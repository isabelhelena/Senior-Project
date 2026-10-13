"""Scheduled statewide NWS / TxDOT snapshots. Python 3.12+, separate from Next.js."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
import re
import time
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
NWS = 'https://api.weather.gov/alerts/active?area=TX'
TXDOT = ('https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/'
         'TxDOT_Roadway_Status/FeatureServer/0/query')
EXCLUDED_ROAD_STATUSES = ('open to traffic', 'artificial centerline', 'proposed')
ROAD_FILTER = ' AND '.join(
    f"LOWER(RDWAY_STAT) NOT LIKE '%{status}%'" for status in EXCLUDED_ROAD_STATUSES
)
LOG = logging.getLogger('official')


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Timestamp must include timezone')
    return parsed


def include_road(status):
    if not isinstance(status, str) or not status.strip():
        raise ValueError('Missing TxDOT road status')
    return not any(excluded in status.casefold() for excluded in EXCLUDED_ROAD_STATUSES)


def feature_collection(data):
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('Incomplete or invalid FeatureCollection')
    return data['features']


def geometry(value, allowed):
    if not isinstance(value, dict) or value.get('type') not in allowed:
        raise ValueError('Missing or unsupported geometry')
    def coordinates(items):
        if not isinstance(items, list) or not items:
            raise ValueError('Empty coordinates')
        if isinstance(items[0], (int, float)):
            if len(items) < 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in items):
                raise ValueError('Invalid coordinate')
            if not -180 <= items[0] <= 180 or not -90 <= items[1] <= 90:
                raise ValueError('Coordinates must be longitude/latitude')
        else:
            for item in items:
                coordinates(item)
    coordinates(value.get('coordinates'))
    return value


def nws_url(url, zone=False):
    parsed = urlparse(url)
    pattern = r'/zones/(county|forecast|fire|marine)/[A-Z]{2}[CZ]\d{3}' if zone else r'/alerts(?:/active)?'
    if parsed.scheme != 'https' or parsed.netloc != 'api.weather.gov' or not re.fullmatch(pattern, parsed.path):
        raise ValueError('Unexpected NWS URL')
    return url


class Worker:
    def __init__(self, client, url='', key='', user_agent='LoneStarSupport-official/1.0', data=DATA):
        self.client, self.url, self.key = client, url.rstrip('/'), key
        self.user_agent, self.data = user_agent, data

    def request(self, method, url, **kwargs):
        for attempt in range(4):
            try:
                response = self.client.request(method, url, **kwargs)
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt == 3:
                        raise RuntimeError(f'Upstream HTTP {response.status_code}; snapshot retained')
                    retry = response.headers.get('Retry-After', '0')
                    try:
                        delay = float(retry)
                    except ValueError:
                        try:
                            delay = (parsedate_to_datetime(retry) - datetime.now(timezone.utc)).total_seconds()
                        except (ValueError, TypeError):
                            delay = 0
                    # Defer long throttles until the next scheduled run.
                    if delay > 60:
                        raise RuntimeError('Upstream requested a longer pause; retry next run')
                    time.sleep(max(2 ** attempt, delay))
                    continue
                if not response.is_success:
                    # Never log response bodies or request headers containing credentials.
                    raise RuntimeError(f'Request failed (HTTP {response.status_code}); check configuration/schema')
                data = response.json()
                if isinstance(data, dict) and data.get('error'):
                    raise ValueError('Upstream returned an error document')
                return data
            except httpx.TransportError:
                if attempt == 3:
                    raise RuntimeError('Network request failed after retries') from None
                time.sleep(2 ** attempt)
        raise RuntimeError('Request failed')

    def rpc(self, name, payload):
        return self.request('POST', self.url + '/rest/v1/rpc/' + name,
            headers={'apikey': self.key, 'Authorization': 'Bearer ' + self.key}, json=payload)

    def nws_get(self, url):
        return self.request('GET', url, headers={
            'User-Agent': self.user_agent, 'Accept': 'application/geo+json'})

    def zone(self, url):
        nws_url(url, zone=True)
        cache = self.data / 'zones' / (hashlib.sha256(url.encode()).hexdigest() + '.json')
        if cache.exists() and time.time() - cache.stat().st_mtime < 7 * 86400:
            try:
                return geometry(json.loads(cache.read_text()), {'Polygon', 'MultiPolygon'})
            except (ValueError, OSError):
                pass
        result = geometry(self.nws_get(url).get('geometry'), {'Polygon', 'MultiPolygon'})
        cache.parent.mkdir(parents=True, exist_ok=True)
        temporary = cache.with_suffix('.tmp')
        temporary.write_text(json.dumps(result), encoding='utf-8')
        temporary.replace(cache)
        return result

    def nws(self):
        rows, visited, ids = [], set(), set()
        url = NWS
        while url:
            nws_url(url)
            if url in visited:
                raise ValueError('Repeated NWS pagination link')
            visited.add(url)
            response = self.nws_get(url)
            for feature in feature_collection(response):
                p = dict(feature['properties'])
                identity = p.get('id') or feature.get('id')
                if not isinstance(identity, str) or not identity or identity in ids:
                    raise ValueError('Missing or duplicate NWS identity')
                ids.add(identity)
                expiration = timestamp(p['expires'])
                if p.get('ends'):
                    expiration = min(expiration, timestamp(p['ends']))
                if p.get('status') != 'Actual' or p.get('messageType') == 'Cancel' or expiration <= datetime.now(timezone.utc):
                    continue
                shape = feature.get('geometry')
                if shape is None:
                    zones = p.get('affectedZones')
                    if not isinstance(zones, list) or not zones:
                        raise ValueError('NWS alert has no polygon or affected zones')
                    polygons = []
                    for zone in sorted(set(zones)):
                        boundary = self.zone(zone)
                        polygons.extend([boundary['coordinates']] if boundary['type'] == 'Polygon' else boundary['coordinates'])
                    shape = {'type': 'MultiPolygon', 'coordinates': polygons}
                    p['geometrySource'] = 'affectedZones'
                else:
                    p['geometrySource'] = 'alert'
                geometry(shape, {'Polygon', 'MultiPolygon'})
                # Frontend countdown uses the same effective expiry as storage.
                p['expires'] = expiration.isoformat()
                rows.append({'type': 'Feature', 'id': identity, 'geometry': shape,
                    'properties': p, 'expires_at': expiration.isoformat(),
                    'headline': p.get('headline') or p.get('event'), 'description': p.get('description')})
            url = response.get('pagination', {}).get('next')
        return rows

    def txdot_ids(self):
        data = self.request('GET', TXDOT, params={'f': 'json', 'where': ROAD_FILTER, 'returnIdsOnly': 'true'})
        ids = data.get('objectIds')
        if not isinstance(ids, list) or data.get('objectIdFieldName') != 'OBJECTID' or data.get('exceededTransferLimit'):
            raise ValueError('Incomplete TxDOT ID inventory')
        if any(type(i) is not int for i in ids) or len(ids) != len(set(ids)):
            raise ValueError('Invalid TxDOT IDs')
        return sorted(ids)

    def txdot(self):
        ids = self.txdot_ids()
        rows = []
        for start in range(0, len(ids), 100):
            batch = ids[start:start + 100]
            response = self.request('GET', TXDOT, params={'f': 'geojson',
                'objectIds': ','.join(map(str, batch)), 'where': ROAD_FILTER,
                'outFields': 'OBJECTID,RTE_NM,RDWAY_STAT,BEGIN_DFO,END_DFO',
                'outSR': '4326', 'returnGeometry': 'true', 'returnZ': 'false', 'returnM': 'false'})
            features = feature_collection(response)
            actual = [f['properties']['OBJECTID'] for f in features]
            if response.get('exceededTransferLimit') or len(actual) != len(batch) or set(actual) != set(batch):
                raise ValueError('TxDOT batch incomplete or changed during fetch')
            for feature in features:
                p = feature['properties']
                if not include_road(p.get('RDWAY_STAT')):
                    continue
                shape = geometry(feature.get('geometry'), {'LineString', 'MultiLineString'})
                rows.append({'type': 'Feature', 'id': str(p['OBJECTID']), 'geometry': shape,
                    'properties': p, 'expires_at': None,
                    'headline': f"{p.get('RTE_NM') or 'Texas Roadway'} — {p.get('RDWAY_STAT') or 'Road condition'}",
                    'description': f"Road status: {p.get('RDWAY_STAT')}. Mile/DFO marker: {p.get('BEGIN_DFO')} to {p.get('END_DFO')}."})
        if self.txdot_ids() != ids:
            raise ValueError('TxDOT inventory changed; retry next run')
        return rows

    def run(self, sources, dry_run=False):
        success = True
        if not dry_run:
            try:
                LOG.info('Deleted %s expired official alerts', self.rpc('prune_official_alerts', {}))
            except Exception as exc:
                LOG.error('Expiry cleanup failed: %s', exc)
                success = False
        for source in sources:
            started = datetime.now(timezone.utc).isoformat()
            try:
                rows = getattr(self, source)()
                if dry_run:
                    LOG.info('%s: validated %d records; no database writes', source, len(rows))
                else:
                    count = self.rpc('sync_official_alerts', {
                        'p_source': source, 'p_fetched_at': started, 'p_features': rows})
                    LOG.info('%s: committed %s active records', source, count)
            except Exception as exc:
                LOG.error('%s failed; previous snapshot retained: %s', source, exc)
                success = False
        return success


@contextmanager
def single_instance(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            if path.stat().st_size == 0:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise RuntimeError('An official worker is already running') from None
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--once', action='store_true', help='One cycle (default)')
    mode.add_argument('--poll', action='store_true', help='Poll every ten minutes until Ctrl+C')
    mode.add_argument('--dry-run', action='store_true', help='Fetch/validate upstreams without database access')
    mode.add_argument('--check', action='store_true', help='Read-only check of database migration and counts')
    parser.add_argument('--source', choices=['nws', 'txdot', 'all'], default='all')
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', handlers=[
        logging.StreamHandler(), RotatingFileHandler(DATA / 'worker.log', maxBytes=2_000_000, backupCount=3)])
    logging.getLogger('httpx').setLevel(logging.WARNING)
    load_dotenv(ROOT / '.env')
    url = os.getenv('SUPABASE_URL', '')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    if not args.dry_run and (not key or not url or urlparse(url).scheme != 'https'):
        parser.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in workers/official/.env')
    sources = ['nws', 'txdot'] if args.source == 'all' else [args.source]
    try:
        with single_instance(DATA / 'worker.lock'), httpx.Client(timeout=60, follow_redirects=False) as client:
            worker = Worker(client, url, key, os.getenv('NWS_USER_AGENT', 'LoneStarSupport-official/1.0'))
            if args.check:
                for source in sources:
                    result = worker.rpc('read_official_alerts', {'p_source': source})
                    LOG.info('%s: %s records, fetched=%s, stale=%s', source,
                        len(feature_collection(result)), result.get('fetchedAt'), result.get('stale'))
                return 0
            while True:
                started = time.monotonic()
                ok = worker.run(sources, args.dry_run)
                if not args.poll:
                    return 0 if ok else 1
                time.sleep(max(1, 600 - (time.monotonic() - started)))
    except KeyboardInterrupt:
        return 0
    except Exception as exc:
        LOG.error('%s', exc)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
