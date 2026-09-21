"""Exercise real Supabase storage with one labeled temporary record, then delete it."""

import asyncio
from datetime import datetime, timezone
import json
import math
import struct
from uuid import uuid4

import httpx
from dotenv import load_dotenv

from core import State
from worker import Config, Pipeline, ROOT, ServiceError


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def coordinates(geometry):
    """PostgREST may expose PostGIS geometry as GeoJSON or hex EWKB."""
    if isinstance(geometry, dict):
        require(geometry.get("type") == "Point", "Stored geometry is not a Point")
        return geometry["coordinates"]
    require(isinstance(geometry, str), "Unexpected geometry representation")
    raw = bytes.fromhex(geometry.removeprefix("\\x"))
    require(len(raw) >= 21 and raw[0] in (0, 1), "Invalid EWKB geometry")
    endian = "<" if raw[0] == 1 else ">"
    kind = struct.unpack_from(endian + "I", raw, 1)[0]
    require(kind & 0xFFFF == 1, "Stored geometry is not a Point")
    offset = 5
    if kind & 0x20000000:
        require(struct.unpack_from(endian + "I", raw, offset)[0] == 4326, "Incorrect SRID")
        offset += 4
    return struct.unpack_from(endian + "dd", raw, offset)


async def verify():
    load_dotenv(ROOT / ".env")
    config = Config.from_env()
    uri = "at://did:example:lonestar-support-storage-test/app.bsky.feed.post/" + uuid4().hex
    alert = {"summary": "[DEMO TEST - NOT A REAL ALERT] Storage verification in San Antonio.",
             "category": "shelter", "urgency": "low", "precision": "city"}
    expected_coords = [-98.4951405, 29.4246002]
    receipt = {"started_at": datetime.now(timezone.utc).isoformat(), "test_uri": uri, "checks": []}
    state = State(":memory:")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            pipeline = Pipeline(state, client, config)

            async def read():
                response = await pipeline.request("Supabase", "GET", config.supabase_url + "/rest/v1/social_alerts",
                    headers={"apikey": config.supabase_key, "Authorization": "Bearer " + config.supabase_key},
                    params={"select": "id,bluesky_uri,summary,category,urgency,geom,created_at", "bluesky_uri": "eq." + uri})
                return response.json()

            def passed(name):
                receipt["checks"].append(name)
                print("PASS:", name, flush=True)

            require(await read() == [], "Test URI unexpectedly exists; no writes attempted")
            try:
                await pipeline.persist(uri, alert, expected_coords)
                rows = await read()
                require(len(rows) == 1, "Insert readback must contain exactly one row")
                first = rows[0]
                require(bool(first["id"]) and bool(first["created_at"]), "Database defaults missing")
                require(first["bluesky_uri"] == uri and first["category"] == "shelter" and first["urgency"] == "low", "Stored fields differ")
                require(first["summary"] == alert["summary"] + " (Approximate city location.)", "Stored summary differs")
                passed("insert and exact field readback")
                stored_coords = coordinates(first["geom"])
                require(len(stored_coords) == 2 and all(math.isclose(a, b, abs_tol=1e-8, rel_tol=0) for a, b in zip(stored_coords, expected_coords)), "Longitude/latitude readback differs")
                passed("PostGIS point longitude/latitude readback")

                await pipeline.persist(uri, alert, expected_coords)
                duplicate = await read()
                require(len(duplicate) == 1 and duplicate[0]["id"] == first["id"], "Duplicate created a second row or changed its ID")
                passed("duplicate upsert retains one row and the same ID")

                updated = {**alert, "summary": "[DEMO TEST - NOT A REAL ALERT] Updated storage verification.", "urgency": "moderate"}
                await pipeline.persist(uri, updated, expected_coords)
                rows = await read()
                require(len(rows) == 1 and rows[0]["id"] == first["id"], "Update changed row identity")
                require(rows[0]["summary"] == updated["summary"] + " (Approximate city location.)" and rows[0]["urgency"] == "moderate", "Update not persisted")
                require(rows[0]["created_at"] == first["created_at"], "Upsert changed creation time")
                receipt["test_row_id"] = first["id"]
                passed("update changes content and preserves ID/created_at")
            finally:
                # Only this run's randomly generated URI is ever deleted.
                await pipeline.persist(uri)
                require(await read() == [], "Test row cleanup failed")
                passed("test row deleted and absence confirmed")
        receipt["completed_at"] = datetime.now(timezone.utc).isoformat()
        (ROOT / "data").mkdir(exist_ok=True)
        path = ROOT / "data" / "storage-verification.json"
        path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        print("Verification receipt: workers/bluesky/data/storage-verification.json")
    except Exception:
        print("Verification stopped. Test URI for cleanup inspection:", uri)
        raise
    finally:
        state.close()


if __name__ == "__main__":
    try:
        asyncio.run(verify())
    except Exception as exc:
        print("FAILED:", str(exc) if isinstance(exc, (RuntimeError, ServiceError)) else type(exc).__name__)
        raise SystemExit(1) from None
