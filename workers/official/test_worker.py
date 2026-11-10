"""Offline behavior checks; never contact external services or real storage."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx

from worker import DATA, ROAD_FILTER, Worker, geometry, include_road, nws_url, timestamp

POLYGON = {'type': 'Polygon', 'coordinates': [[[-99, 29], [-98, 29], [-98, 30], [-99, 29]]]}
LINE = {'type': 'LineString', 'coordinates': [[-99, 29], [-98, 30]]}
ZONE = 'https://api.weather.gov/zones/county/TXC029'


def alert(identity='urn:alert:1', shape=None):
    return {'type': 'Feature', 'id': identity, 'geometry': shape, 'properties': {
        'id': identity, 'status': 'Actual', 'messageType': 'Alert', 'affectedZones': [ZONE],
        'expires': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        'event': 'Flood Warning', 'headline': 'Flooding', 'instruction': 'Stay clear'}}


def collection(features, **extra):
    return {'type': 'FeatureCollection', 'features': features, **extra}


class IngestionTests(unittest.TestCase):
    def setUp(self):
        DATA.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=DATA)
        self.addCleanup(self.temp.cleanup)

    def worker(self, handler):
        client = httpx.Client(transport=httpx.MockTransport(handler))
        self.addCleanup(client.close)
        return Worker(client, 'https://database.example', 'test-secret', 'test-contact', Path(self.temp.name))

    def test_nws_zone_resolution_and_persistent_cache(self):
        calls = []
        fixture = alert()
        def handler(request):
            self.assertNotIn('apikey', request.headers)
            calls.append(request.url.path)
            return httpx.Response(200, json={'geometry': POLYGON} if '/zones/' in request.url.path else collection([fixture]))
        worker = self.worker(handler)
        first, second = worker.nws(), worker.nws()
        self.assertEqual(first, second)
        self.assertEqual(calls.count('/zones/county/TXC029'), 1)
        self.assertEqual(first[0]['geometry']['type'], 'MultiPolygon')
        self.assertEqual(first[0]['properties']['geometrySource'], 'affectedZones')
        self.assertEqual(first[0]['properties']['instruction'], 'Stay clear')

    def test_nws_all_pages_preserve_official_polygons(self):
        def handler(request):
            if request.url.params.get('cursor'):
                return httpx.Response(200, json=collection([alert('two', POLYGON)]))
            return httpx.Response(200, json=collection([alert('one', POLYGON)],
                pagination={'next': 'https://api.weather.gov/alerts?area=TX&cursor=2'}))
        rows = self.worker(handler).nws()
        self.assertEqual([r['id'] for r in rows], ['one', 'two'])
        self.assertEqual(rows[0]['geometry'], POLYGON)

    def test_expired_cancelled_and_test_alerts_are_omitted(self):
        records = [alert(str(i), POLYGON) for i in range(3)]
        records[0]['properties']['ends'] = '2000-01-01T00:00:00Z'
        records[1]['properties']['messageType'] = 'Cancel'
        records[2]['properties']['status'] = 'Test'
        worker = self.worker(lambda _: httpx.Response(200, json=collection(records)))
        self.assertEqual(worker.nws(), [])

    def test_zone_failure_never_commits_incomplete_snapshot(self):
        commits = []
        def handler(request):
            if '/zones/' in request.url.path:
                return httpx.Response(404)
            if '/rpc/' in request.url.path:
                commits.append(request.url.path)
                return httpx.Response(200, json=0)
            return httpx.Response(200, json=collection([alert()]))
        self.assertFalse(self.worker(handler).run(['nws']))
        self.assertEqual(commits, ['/rest/v1/rpc/prune_official_alerts'])

    def test_txdot_fetches_all_ids_in_batches_with_stable_ids(self):
        ids = list(range(251))
        batches = []
        def handler(request):
            if request.url.params.get('returnIdsOnly'):
                return httpx.Response(200, json={'objectIds': ids, 'objectIdFieldName': 'OBJECTID'})
            batch = [int(i) for i in request.url.params['objectIds'].split(',')]
            batches.append(batch)
            return httpx.Response(200, json=collection([
                {'type': 'Feature', 'geometry': LINE, 'properties': {'OBJECTID': i, 'RTE_NM': 'IH35', 'RDWAY_STAT': 'Closed'}}
                for i in reversed(batch)]))
        rows = self.worker(handler).txdot()
        self.assertEqual(len(rows), 251)
        self.assertEqual([len(batch) for batch in batches], [100, 100, 51])
        self.assertEqual({r['id'] for r in rows}, set(map(str, ids)))

    def test_txdot_missing_batch_record_aborts(self):
        def handler(request):
            data = {'objectIds': [1], 'objectIdFieldName': 'OBJECTID'} if request.url.params.get('returnIdsOnly') else collection([])
            return httpx.Response(200, json=data)
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            self.worker(handler).txdot()

    def test_txdot_excludes_inventory_records_before_geometry_validation(self):
        statuses = ['Artificial Centerline for Non-Mainlane', 'PROPOSED, no roadway',
                    'Open to Traffic (All Data Input)', 'Temporarily Closed to Traffic']
        def handler(request):
            self.assertEqual(request.url.params['where'], ROAD_FILTER)
            if request.url.params.get('returnIdsOnly'):
                return httpx.Response(200, json={'objectIds': [0, 1, 2, 3], 'objectIdFieldName': 'OBJECTID'})
            return httpx.Response(200, json=collection([
                {'type': 'Feature', 'geometry': LINE if i == 3 else None,
                 'properties': {'OBJECTID': i, 'RDWAY_STAT': status}}
                for i, status in enumerate(statuses)]))
        rows = self.worker(handler).txdot()
        self.assertEqual([row['id'] for row in rows], ['3'])
        self.assertTrue(include_road('Open, but with some construction'))
        self.assertFalse(include_road('  artificial CENTERLINE for Non-Mainlane '))
        with self.assertRaises(ValueError):
            include_road(None)

    def test_txdot_inventory_changes_abort(self):
        calls = 0
        def handler(request):
            nonlocal calls
            calls += 1
            return httpx.Response(200, json={'objectIds': [] if calls == 1 else [2], 'objectIdFieldName': 'OBJECTID'})
        with self.assertRaisesRegex(ValueError, 'inventory changed'):
            self.worker(handler).txdot()

    def test_arcgis_error_document_is_not_empty_success(self):
        worker = self.worker(lambda _: httpx.Response(200, json={'error': {'code': 400}}))
        with self.assertRaisesRegex(ValueError, 'error document'):
            worker.txdot()

    def test_empty_complete_feed_commits_and_sources_fail_independently(self):
        worker = self.worker(lambda _: httpx.Response(200, json=0))
        with patch.object(worker, 'nws', side_effect=ValueError('bad snapshot')), patch.object(worker, 'txdot', return_value=[]), patch.object(worker, 'rpc', return_value=0) as rpc:
            self.assertFalse(worker.run(['nws', 'txdot']))
            self.assertEqual(rpc.call_count, 2)
            name, payload = rpc.call_args.args
            self.assertEqual(name, 'sync_official_alerts')
            self.assertEqual(payload['p_source'], 'txdot')
            self.assertEqual(payload['p_features'], [])

    def test_dry_run_never_calls_database(self):
        worker = self.worker(lambda _: httpx.Response(200, json=collection([])))
        with patch.object(worker, 'rpc') as rpc:
            self.assertTrue(worker.run(['nws'], dry_run=True))
            rpc.assert_not_called()

    def test_transient_retry_and_auth_failure(self):
        responses = [httpx.Response(429, headers={'Retry-After': '2'}), httpx.Response(200, json=collection([]))]
        worker = self.worker(lambda _: responses.pop(0))
        with patch('worker.time.sleep') as sleep:
            self.assertEqual(worker.nws(), [])
            sleep.assert_called_once_with(2)
        worker = self.worker(lambda _: httpx.Response(401))
        with patch('worker.time.sleep') as sleep, self.assertRaisesRegex(RuntimeError, '401'):
            worker.nws()
        sleep.assert_not_called()

    def test_invalid_coordinates_and_unsafe_urls_rejected(self):
        invalid = deepcopy(LINE)
        invalid['coordinates'][0][0] = float('nan')
        with self.assertRaises(ValueError):
            geometry(invalid, {'LineString'})
        with self.assertRaises(ValueError):
            nws_url('https://untrusted.example/zones/county/TXC029', zone=True)
        with self.assertRaises(ValueError):
            timestamp('2026-01-01T00:00:00')


if __name__ == '__main__':
    unittest.main()
