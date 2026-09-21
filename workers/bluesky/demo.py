"""Offline classroom demo. Uses real validation rules and isolated SQLite storage."""

import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from core import candidate, resolve_feature, validate_extraction

ROOT = Path(__file__).resolve().parent
FIXTURES = json.loads((ROOT / "demo_scenarios.json").read_text(encoding="utf-8"))


class Demo:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS demo_alerts (
                id TEXT PRIMARY KEY, bluesky_uri TEXT UNIQUE NOT NULL,
                summary TEXT NOT NULL, category TEXT NOT NULL, urgency TEXT NOT NULL,
                geom TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS demo_runs (
                id INTEGER PRIMARY KEY, result TEXT NOT NULL);
        """)

    def snapshot(self):
        return {"mode": "offline-demo", "notice": FIXTURES["notice"],
                "scenarios": [{k: s[k] for k in ("id", "title", "post", "expected")} for s in FIXTURES["scenarios"]],
                "alerts": [dict(row) for row in self.db.execute("SELECT * FROM demo_alerts ORDER BY created_at")],
                "runs": [json.loads(row[0]) for row in self.db.execute("SELECT result FROM demo_runs ORDER BY id DESC LIMIT 30")]}

    def reset(self):
        with self.db:
            self.db.execute("DELETE FROM demo_alerts")
            self.db.execute("DELETE FROM demo_runs")

    def run(self, scenario_id):
        scenario = next((s for s in FIXTURES["scenarios"] if s["id"] == scenario_id), None)
        if scenario is None:
            raise ValueError("Unknown demo scenario")
        result = {"scenario_id": scenario_id, "title": scenario["title"], "post": scenario["post"],
                  "time": datetime.now(timezone.utc).isoformat(), "stages": [], "outcome": "rejected",
                  "note": scenario.get("note"), "extraction": None, "coordinates": None}

        def stage(name, status, detail):
            result["stages"].append({"name": name, "status": status, "detail": detail})

        stage("Input", "passed", "Loaded a synthetic post from the local scenario file; nothing was published to Bluesky.")
        if not candidate(scenario["post"]):
            stage("Keyword filter", "rejected", "No disaster keyword. Rejected before extraction, geocoding, or storage.")
            stage("Extraction", "skipped", "No model request needed.")
            stage("Location", "skipped", "No geocoder request needed.")
            stage("Storage", "skipped", "No alert created.")
        else:
            stage("Keyword filter", "passed", "The real worker filter found a disaster term and a Texas reference.")
            extraction = validate_extraction(scenario["extraction"], scenario["post"])
            result["extraction"] = extraction
            if extraction is None:
                stage("Extraction", "rejected", "The fixed extraction did not pass the real worker's validation.")
                stage("Location", "skipped", "No valid location to resolve.")
                stage("Storage", "skipped", "No alert created.")
            else:
                stage("Extraction", "passed", "Fixed Gemini-style response passed real schema checks and location-text evidence validation.")
                coords = resolve_feature(scenario["geocoder"], extraction)
                result["coordinates"] = coords
                if coords is None:
                    result["outcome"] = "ambiguous"
                    stage("Location", "rejected", "Two distinct synthetic Texas places match. The real validator refuses to choose one.")
                    stage("Storage", "skipped", "No coordinate guess and no alert created.")
                else:
                    stage("Location", "passed", "One valid Texas point in the fixed Photon response. City location is approximate.")
                    uri = "demo://lone-star-support/" + scenario_id
                    summary = "[DEMO - NOT A REAL ALERT] " + extraction["summary"]
                    if extraction["precision"] == "city":
                        summary += " (Approximate city location.)"
                    with self.db:
                        self.db.execute("""INSERT INTO demo_alerts VALUES (?,?,?,?,?,?,?)
                            ON CONFLICT(bluesky_uri) DO UPDATE SET summary=excluded.summary,
                            category=excluded.category,urgency=excluded.urgency,geom=excluded.geom""",
                            (str(uuid4()), uri, summary, extraction["category"], extraction["urgency"],
                             f"SRID=4326;POINT({coords[0]} {coords[1]})", result["time"]))
                    result["outcome"] = "stored"
                    stage("Storage", "passed", "Upserted into local demo_alerts. Replaying this scenario keeps one row; live Supabase is untouched.")
        with self.db:
            self.db.execute("INSERT INTO demo_runs(result) VALUES (?)", (json.dumps(result),))
        return result


def handler_for(demo):
    class Handler(BaseHTTPRequestHandler):
        def send(self, status, data, content_type="application/json"):
            body = data if isinstance(data, bytes) else json.dumps(data).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type + "; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def local_request(self):
            allowed = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            host = self.headers.get("Host", "")
            origin = self.headers.get("Origin")
            return host in allowed and (origin is None or origin == "http://" + host)

        def do_GET(self):
            if not self.local_request():
                return self.send(403, {"error": "Local requests only"})
            if self.path == "/":
                return self.send(200, (ROOT / "demo.html").read_bytes(), "text/html")
            if self.path == "/api/demo":
                return self.send(200, demo.snapshot())
            return self.send(404, {"error": "Not found"})

        def do_POST(self):
            if not self.local_request() or self.headers.get("Content-Type") != "application/json":
                return self.send(403, {"error": "Use the local demo page"})
            # Commands are allowlisted and have no request body or arbitrary post input.
            if self.headers.get("Content-Length", "0") != "0" or self.headers.get("Transfer-Encoding"):
                self.close_connection = True
                return self.send(400, {"error": "Demo commands do not accept a body"})
            try:
                if self.path == "/api/demo/reset":
                    demo.reset()
                elif self.path.startswith("/api/demo/run/"):
                    demo.run(self.path.removeprefix("/api/demo/run/"))
                else:
                    return self.send(404, {"error": "Not found"})
                self.send(200, demo.snapshot())
            except ValueError:
                self.send(400, {"error": "Unknown demo scenario"})
            except sqlite3.Error:
                self.send(500, {"error": "Local demo storage failed. Check the presentation terminal."})

        def log_message(self, format, *args):
            pass

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--run-all", action="store_true", help="Run all scenarios in the terminal and exit")
    mode.add_argument("--reset", action="store_true", help="Clear only local demo rows/history and exit")
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    (ROOT / "data").mkdir(exist_ok=True)
    demo = Demo(ROOT / "data" / "demo.sqlite3")
    try:
        if args.reset:
            demo.reset()
            print("Local demo reset. Live storage was not accessed.")
        elif args.run_all:
            for scenario in FIXTURES["scenarios"]:
                result = demo.run(scenario["id"])
                print(f"{scenario['title']}: {result['outcome']}")
            print(f"Local demo rows: {len(demo.snapshot()['alerts'])}")
        else:
            with HTTPServer(("127.0.0.1", args.port), handler_for(demo)) as server:
                print(f"Open http://127.0.0.1:{server.server_port}", flush=True)
                print("OFFLINE DEMO: synthetic posts, fixed API responses, isolated SQLite. Ctrl+C to stop.", flush=True)
                server.serve_forever()
    finally:
        demo.db.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Demo stopped.")
    except (OSError, sqlite3.Error) as exc:
        print(f"Demo stopped: {type(exc).__name__}. Check the port and local data directory.")
        raise SystemExit(1) from None
