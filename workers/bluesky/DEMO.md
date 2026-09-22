# Classroom presentation demo

From the project root, run:

```powershell
python workers/bluesky/demo.py
```

Open **http://127.0.0.1:8766** in a browser. Leave that terminal running and use Ctrl+C to stop. If port 8766 is in use, add `--port 8767` and open that port instead.

This presentation uses only Python's standard library and the worker's pure validation module. It requires no API keys, internet, Node dependencies, Next.js server, or running live worker. It is a separate presentation page; it does not add a live alerts panel to the application.

## Two-minute walkthrough

1. Click **Reset demo**. Point out the offline/synthetic notice and the empty storage panel.
2. Run **A Texas report with a clear location**. Walk through the actual keyword filter, the fixed extraction response, and the actual coordinate validator. Expand the extraction and coordinate details. The accepted example saves a clearly labeled row to the separate local database.
3. Expand **Inspect local database row**, then run the accepted scenario again. Demonstrate that the row count stays at one and its ID is unchanged.
4. Run **An unrelated Texas post**. The real keyword filter rejects it before any extraction or geocoding. Explain how this saves API requests in the live worker.
5. Run **A report with an ambiguous place**. Two synthetic Texas geocoder candidates match a generic community center. The real validator rejects the ambiguity rather than inventing an incident location. No new row appears.
6. Use **Recent runs** to revisit any result, or **Run all three scenarios** to replay the examples. Reset clears the demo for the next presentation.

Suggested introduction: “This is our repeatable offline demonstration. Posts and external API responses are fixtures; the filtering and location validation are the same Python functions our live worker uses. Storage here is isolated SQLite. We separately verified real Supabase inserts, coordinate readback, deduplication, updates, and cleanup.”

## What is real and what is simulated

| Stage | Demo behavior |
| --- | --- |
| Bluesky input | Three synthetic local posts; no public posts are created or streamed |
| Keyword filtering | Actual `core.candidate` function |
| Gemini extraction | Fixed JSON fixture, validated by actual `core.validate_extraction` |
| Photon response | Fixed city result for the accepted example; two explicitly synthetic places for ambiguity |
| Location validation | Actual `core.resolve_feature` function |
| Storage | Actual local SQLite upsert into `demo_alerts`; separate from Supabase |

The ambiguity example intentionally provides a permissive extraction fixture to exercise the downstream guard. Live Gemini may reject such an underspecified post earlier. No display claims that fixtures are fresh live API results.

## Data and terminal fallback

- Scenarios: `workers/bluesky/demo_scenarios.json` (checked into the project).
- Presentation: `workers/bluesky/demo.html` (local styles/scripts; no CDN or web fonts).
- Demo storage: `workers/bluesky/data/demo.sqlite3` (ignored by Git).
- Live worker storage remains `data/state.sqlite3`; this demo never opens it or loads `.env`.
- Reset deletes only rows in the two demo tables, not database files or live records.

If a browser is unavailable, run the same examples in the terminal:

```powershell
python workers/bluesky/demo.py --run-all
python workers/bluesky/demo.py --reset
```

The expected results are `stored`, `rejected`, and `ambiguous`, with exactly one local alert. Repeat runs preserve that one-row result.

Test the offline demonstration:

```powershell
python -m unittest discover -s workers/bluesky -p test_demo.py -v
```
