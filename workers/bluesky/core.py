"""Pure validation and a durable local queue. No network access."""

from datetime import datetime, timezone
import json
import math
import re
import sqlite3
import time

CATEGORIES = ["flood", "severe_weather", "wildfire", "power_outage", "road_hazard", "shelter", "mutual_aid"]
URGENCIES = ["low", "moderate", "critical"]
HAZARDS = re.compile(
    r"\b(flood\w*|tornado\w*|hurricane\w*|wildfire\w*|evacuat\w*|shelter\w*|"
    r"freez\w*|ice storm|heat wave|extreme heat|power out\w*|outage\w*|"
    r"road clos\w*|roads closed|stranded|rescue|warming center|cooling center|"
    r"mutual aid|drinking water|food distribution|inundaci\w*|incendio\w*|"
    r"refugio\w*|sin luz|sin agua)\b", re.I)
TEXAS = re.compile(
    r"\b(texas|tx|txwx|san antonio|houston|austin|dallas|fort worth|el paso|"
    r"corpus christi|lubbock|amarillo|waco|laredo|mcallen|brownsville|beaumont|"
    r"galveston|san angelo|midland|odessa|abilene|wichita falls|tyler|longview|"
    r"college station|bryan|new braunfels|san marcos|round rock|kerrville|"
    r"hill country|rio grande valley|dfw|satx|atx|htx)\b", re.I)


def candidate(text, extra_terms="", require_texas=True):
    if not isinstance(text, str) or not HAZARDS.search(text):
        return False
    extra = any(re.search(r"\b" + re.escape(t.strip()) + r"\b", text, re.I)
                for t in extra_terms.split(",") if t.strip())
    return not require_texas or bool(TEXAS.search(text) or extra)


def recent(record, max_age_hours=24):
    try:
        stamp = datetime.fromisoformat(record["createdAt"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - stamp).total_seconds()
        return -300 <= age <= max_age_hours * 3600
    except (KeyError, ValueError, TypeError, AttributeError):
        return False


def validate_extraction(data, post):
    if not isinstance(data, dict):
        raise ValueError("Expected an object")
    if data.get("actionable") is not True or data.get("texas") is not True:
        return None
    if data.get("category") not in CATEGORIES or data.get("urgency") not in URGENCIES:
        raise ValueError("Invalid classification")
    for key, limit in [("summary", 500), ("location_text", 300)]:
        if not isinstance(data.get(key), str) or not 1 <= len(data[key].strip()) <= limit:
            raise ValueError("Invalid extraction field")
    if data["location_text"].casefold() not in post.casefold():
        return None  # Location must be an exact quote, never a model-invented address.
    if data.get("precision") not in ("address", "place", "city"):
        return None
    return data


def normalized(text):
    return " ".join(re.findall(r"\w+", text.casefold()))


def resolve_feature(payload, alert):
    """Only one distinct Texas match, at the requested level of specificity."""
    matches = []
    query = normalized(alert["location_text"])
    precision = alert["precision"]
    for feature in payload.get("features", []):
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})
        if props.get("countrycode", "").upper() != "US" or props.get("state", "").casefold() != "texas":
            continue
        if precision == "address":
            number = str(props.get("housenumber", ""))
            if not props.get("street") or not number or not re.search(r"\b" + re.escape(number) + r"\b", query):
                continue
            aliases = {"street": "st", "road": "rd", "avenue": "ave", "boulevard": "blvd", "drive": "dr", "highway": "hwy", "lane": "ln", "north": "n", "south": "s", "east": "e", "west": "w"}
            street_words = [aliases.get(w, w) for w in normalized(props["street"]).split()]
            query_words = [aliases.get(w, w) for w in query.split()]
            if not all(w in query_words for w in street_words):
                continue
        elif precision == "city" and props.get("type") != "city":
            continue
        elif precision == "place" and props.get("type") in ("country", "state", "county", "city", "district", "street"):
            continue
        if precision in ("city", "place"):
            name = normalized(props.get("name", ""))
            if not name or not re.search(r"\b" + re.escape(name) + r"\b", query):
                continue  # Photon fuzzy matches alone aren't evidence of the location.
        coords = geom.get("coordinates", [])
        if geom.get("type") != "Point" or len(coords) != 2:
            continue
        if not all(type(v) in (int, float) and math.isfinite(v) for v in coords):
            continue
        lon, lat = coords
        if not (-106.7 <= lon <= -93.5 and 25.8 <= lat <= 36.6):
            continue
        if not any(abs(lon - m[0]) < .001 and abs(lat - m[1]) < .001 for m in matches):
            matches.append([lon, lat])
    return matches[0] if len(matches) == 1 else None


class State:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS jobs (
              uri TEXT PRIMARY KEY, event TEXT NOT NULL, version INTEGER NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
              due REAL NOT NULL DEFAULT 0, extraction TEXT);
            CREATE INDEX IF NOT EXISTS jobs_pending ON jobs(status,due,version);
            CREATE TABLE IF NOT EXISTS geocache (query TEXT PRIMARY KEY, result TEXT, saved REAL);
        """)
        self.cursor = int(self.get("cursor"))
        self.checkpoint_at = time.monotonic()

    def get(self, key, default="0"):
        row = self.db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else default

    def set(self, key, value):
        self.db.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", (key, str(value)))

    def accept(self, event, config):
        stamp = event.get("time_us")
        if type(stamp) is not int or stamp <= 0:
            return
        commit = event.get("commit", {})
        saved = False
        with self.db:
            if event.get("kind") == "commit" and commit.get("collection") == "app.bsky.feed.post":
                did, rkey = event.get("did", ""), commit.get("rkey", "")
                if not isinstance(did, str) or not did.startswith("did:") or not isinstance(rkey, str) or not rkey or "/" in rkey:
                    return
                uri = f"at://{did}/app.bsky.feed.post/{rkey}"
                known = self.db.execute("SELECT version FROM jobs WHERE uri=?", (uri,)).fetchone()
                record = commit.get("record", {})
                action = commit.get("operation")
                relevant = action in ("create", "update") and candidate(record.get("text"), config.extra_terms, config.require_texas) and recent(record, config.max_age)
                if (relevant or (known and action in ("update", "delete"))) and (not known or stamp > known[0]):
                    count = self.db.execute("SELECT count(*) FROM jobs WHERE status='pending'").fetchone()[0]
                    if count >= config.max_queue and not known:
                        raise BufferError("Queue full")  # No cursor advance past unqueued work.
                    self.db.execute("""INSERT INTO jobs(uri,event,version) VALUES (?,?,?)
                        ON CONFLICT(uri) DO UPDATE SET event=excluded.event,version=excluded.version,
                        status='pending',attempts=0,due=0,extraction=NULL""", (uri, json.dumps(event), stamp))
                    saved = True
            self.cursor = max(self.cursor, stamp)
            if saved or time.monotonic() - self.checkpoint_at > 1:
                self.set("cursor", self.cursor)
                self.checkpoint_at = time.monotonic()

    def next_job(self):
        return self.db.execute("SELECT * FROM jobs WHERE status='pending' AND due<=? ORDER BY version LIMIT 1", (time.time(),)).fetchone()

    def current(self, job):
        row = self.db.execute("SELECT version FROM jobs WHERE uri=?", (job["uri"],)).fetchone()
        return row is not None and row[0] == job["version"]

    def finish(self, job, status):
        with self.db:
            self.db.execute("UPDATE jobs SET status=? WHERE uri=? AND version=?", (status, job["uri"], job["version"]))
            if status != "failed":
                self.db.execute("UPDATE jobs SET event='{}',extraction=NULL WHERE uri=? AND version=?", (job["uri"], job["version"]))

    def retry(self, job, delay):
        with self.db:
            self.db.execute("UPDATE jobs SET attempts=attempts+1,due=? WHERE uri=? AND version=?", (time.time() + delay, job["uri"], job["version"]))

    def close(self):
        with self.db:
            self.set("cursor", self.cursor)
        self.db.close()
