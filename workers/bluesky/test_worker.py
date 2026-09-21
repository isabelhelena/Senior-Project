import asyncio
from datetime import datetime, timedelta, timezone
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import AsyncMock

import httpx

from core import State, candidate, recent, resolve_feature, validate_extraction
from worker import BudgetReached, Config, Pipeline, ServiceError, stream_url


def event(stamp=100, operation="create", text="Flooding reported in San Antonio, Texas."):
    return {"kind": "commit", "time_us": stamp, "did": "did:plc:test", "commit": {
        "collection": "app.bsky.feed.post", "rkey": "test", "operation": operation,
        "record": {"text": text, "createdAt": datetime.now(timezone.utc).isoformat()}}}


def alert():
    return {"actionable": True, "texas": True, "summary": "Flooding is reported in San Antonio.",
            "category": "flood", "urgency": "moderate", "location_text": "San Antonio", "precision": "city"}


def feature(lon=-98.49, lat=29.42, **properties):
    props = {"countrycode": "US", "state": "Texas", "type": "city", "name": "San Antonio"}
    props.update(properties)
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


class ValidationTests(unittest.TestCase):
    def test_filter_and_small_town_override(self):
        self.assertTrue(candidate("Flood warning #TXwx"))
        self.assertTrue(candidate("Houston sin luz después de la tormenta"))
        self.assertFalse(candidate("Texas football tonight"))
        self.assertFalse(candidate("Flooding in Boston"))
        self.assertTrue(candidate("Flooding in Utopia", "Utopia"))
        self.assertTrue(candidate("Flooding in Utopia", require_texas=False))

    def test_age_and_timezone_validation(self):
        self.assertTrue(recent(event()["commit"]["record"]))
        self.assertFalse(recent({"createdAt": "2020-01-01T00:00:00Z"}))
        self.assertFalse(recent({"createdAt": "2026-01-01"}))
        self.assertFalse(recent({"createdAt": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}))

    def test_location_must_be_in_source(self):
        self.assertIsNotNone(validate_extraction(alert(), "Flooding in San Antonio"))
        self.assertIsNone(validate_extraction(alert(), "Flooding somewhere in Texas"))
        self.assertIsNone(validate_extraction({**alert(), "texas": False}, "San Antonio"))
        with self.assertRaises(ValueError):
            validate_extraction({**alert(), "urgency": "extreme"}, "San Antonio")

    def test_texas_is_not_just_a_rectangle(self):
        self.assertIsNone(resolve_feature({"features": [feature(state="Oklahoma")]}, alert()))
        self.assertIsNone(resolve_feature({"features": [feature(countrycode="MX")]}, alert()))
        self.assertIsNone(resolve_feature({"features": [feature(lon=float("nan"))]}, alert()))

    def test_ambiguity_and_fuzzy_matches_rejected(self):
        self.assertEqual(resolve_feature({"features": [feature()]}, alert()), [-98.49, 29.42])
        self.assertIsNone(resolve_feature({"features": [feature(), feature(lon=-99.0)]}, alert()))
        self.assertIsNone(resolve_feature({"features": [feature(name="San Marcos")]}, alert()))
        self.assertIsNone(resolve_feature({"features": [feature()]}, {**alert(), "precision": "place"}))

    def test_address_number_and_street_must_match(self):
        data = {**alert(), "precision": "address", "location_text": "123 Main St, San Antonio"}
        good = feature(type="house", street="Main Street", housenumber="123")
        self.assertIsNotNone(resolve_feature({"features": [good]}, data))
        self.assertIsNone(resolve_feature({"features": [feature(type="house", street="Other Street", housenumber="123")]}, data))
        self.assertIsNone(resolve_feature({"features": [feature(type="house", street="Main Street", housenumber="456")]}, data))


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "state.sqlite3"
        self.state = State(self.path)
        self.config = Config()

    def tearDown(self):
        self.state.close()
        self.temp.cleanup()

    def test_restart_and_replay_deduplicate(self):
        self.state.accept(event(), self.config)
        self.state.close()
        self.state = State(self.path)
        self.state.accept(event(), self.config)
        self.assertEqual(self.state.cursor, 100)
        self.assertEqual(self.state.db.execute("SELECT count(*) FROM jobs").fetchone()[0], 1)
        self.assertEqual(self.state.next_job()["status"], "pending")

    def test_completion_cannot_overwrite_newer_delete(self):
        self.state.accept(event(), self.config)
        old = self.state.next_job()
        self.state.accept(event(200, "delete"), self.config)
        self.state.finish(old, "stored")
        self.assertFalse(self.state.current(old))
        self.assertEqual(self.state.next_job()["version"], 200)
        self.assertEqual(json.loads(self.state.next_job()["event"])["commit"]["operation"], "delete")

    def test_queue_overflow_does_not_advance_cursor(self):
        self.config.max_queue = 1
        self.state.accept(event(), self.config)
        other = event(200)
        other["commit"]["rkey"] = "another"
        with self.assertRaises(BufferError):
            self.state.accept(other, self.config)
        self.assertEqual(self.state.cursor, 100)
        self.assertEqual(self.state.get("cursor"), "100")

    def test_unrelated_update_still_queued_for_removal(self):
        self.state.accept(event(), self.config)
        self.state.finish(self.state.next_job(), "stored")
        self.state.accept(event(200, "update", "Hello world"), self.config)
        self.assertIsNotNone(self.state.next_job())

    def test_failed_job_keeps_payload(self):
        self.state.accept(event(), self.config)
        job = self.state.next_job()
        self.state.finish(job, "failed")
        self.assertNotEqual(self.state.db.execute("SELECT event FROM jobs").fetchone()[0], "{}")


class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.state = State(":memory:")
        self.calls = []
        self.config = Config(supabase_url="https://example.supabase.co", supabase_key="test-key", gemini_key="test-gemini")

        def handler(request):
            self.calls.append(request)
            if request.url.host == "generativelanguage.googleapis.com":
                return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps(alert())}]}}]})
            if request.url.host == "photon.komoot.io":
                return httpx.Response(200, json={"features": [feature()]})
            return httpx.Response(201)

        self.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.pipeline = Pipeline(self.state, self.client, self.config)

    async def asyncTearDown(self):
        await self.client.aclose()
        self.state.close()

    async def test_full_flow_uses_lon_lat_and_existing_unique_key(self):
        self.state.accept(event(), self.config)
        self.assertEqual(await self.pipeline.process(self.state.next_job()), "stored")
        request = self.calls[-1]
        body = json.loads(request.content)
        self.assertEqual(body["geom"], "SRID=4326;POINT(-98.49 29.42)")
        self.assertEqual(request.url.params["on_conflict"], "bluesky_uri")
        self.assertIn("resolution=merge-duplicates", request.headers["Prefer"])
        self.assertNotIn("created_at", body)
        self.assertTrue(body["summary"].endswith("(Approximate city location.)"))

    async def test_geocode_cache_avoids_repeat_requests(self):
        await self.pipeline.geocode(alert())
        await self.pipeline.geocode(alert())
        self.assertEqual(len(self.calls), 1)

    async def test_city_query_uses_filters_instead_of_usa_business_keyword(self):
        await self.pipeline.geocode(alert())
        params = self.calls[0].url.params
        self.assertEqual(params["q"], "San Antonio, Texas")
        self.assertEqual(params["countrycode"], "US")
        self.assertEqual(params["layer"], "city")

    async def test_old_negative_cache_cannot_mask_fixed_lookup(self):
        import time
        old_key = self.config.photon_url + "|city|san antonio, texas, usa"
        with self.state.db:
            self.state.db.execute("INSERT INTO geocache VALUES (?,?,?)", (old_key, "null", time.time()))
        self.assertEqual(await self.pipeline.geocode(alert()), [-98.49, 29.42])
        self.assertEqual(len(self.calls), 1)

    async def test_existing_texas_suffix_not_duplicated(self):
        await self.pipeline.geocode({**alert(), "location_text": "San Antonio, Texas"})
        self.assertEqual(self.calls[0].url.params["q"], "San Antonio, Texas")

    async def test_ambiguous_location_is_not_written(self):
        self.pipeline.geocode = AsyncMock(return_value=None)
        self.state.accept(event(), self.config)
        self.assertEqual(await self.pipeline.process(self.state.next_job()), "skipped")
        self.assertTrue(all(r.url.host != "example.supabase.co" for r in self.calls))

    async def test_delete_only_targets_the_known_uri(self):
        self.state.accept(event(), self.config)
        self.state.accept(event(200, "delete"), self.config)
        self.assertEqual(await self.pipeline.process(self.state.next_job()), "removed")
        self.assertEqual(self.calls[0].method, "DELETE")
        self.assertEqual(self.calls[0].url.params["bluesky_uri"], "eq.at://did:plc:test/app.bsky.feed.post/test")

    async def test_daily_limit_prevents_network_call(self):
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self.state.db:
            self.state.set("gemini:" + day, self.config.daily)
        with self.assertRaises(BudgetReached):
            await self.pipeline.extract("San Antonio")
        self.assertEqual(self.calls, [])

    async def test_cached_extraction_survives_storage_failure(self):
        self.pipeline.persist = AsyncMock(side_effect=ServiceError("Supabase", 503))
        self.state.accept(event(), self.config)
        with self.assertRaises(ServiceError):
            await self.pipeline.process(self.state.next_job())
        self.assertIsNotNone(self.state.next_job()["extraction"])
        self.pipeline.persist = AsyncMock()
        self.pipeline.extract = AsyncMock(side_effect=AssertionError("must not repeat inference"))
        self.assertEqual(await self.pipeline.process(self.state.next_job()), "stored")

    async def test_replay_url_rewinds_two_seconds(self):
        self.assertIn("cursor=3000000", stream_url(self.config, 5_000_000))


if __name__ == "__main__":
    unittest.main()
