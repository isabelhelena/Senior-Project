<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lone Star Support project guide

This repository is a Texas disaster-information project with two active parts today:

- A Next.js frontend in `src/` for diagnostics, map-oriented UI work, and future alert display.
- Standalone Python workers under `workers/bluesky/` for Bluesky ingestion, filtering, Gemini extraction, geocoding, and Supabase persistence.

The project is still evolving toward the broader Lone Star Support architecture described in the milestone plan: public data ingestion for NWS, TxDOT, and OSM; a unified map with alerts; and a true geospatial disaster dashboard. The current codebase is the operational baseline, not the final end-state. We should match the current stack and implementation patterns while keeping the roadmap and product goals in view.

The current implementation is not a FastAPI application, and the live code does not yet include the full production architecture. If a historical document or milestone draft describes FastAPI, Celery, or a different architecture, treat it as planning context and compare it against the actual implementation. Prefer the live code and `README.md` as the source of truth for what is currently shipped, but do not ignore the plan for features we still need to build.

## Source of truth

Use the actual project files in this repo when making decisions:

- `README.md` for the overall repo status and usage.
- `workers/bluesky/README.md` for the live worker flow and operational details.
- `package.json` and the app code under `src/` for frontend conventions.
- The Python scripts in `workers/bluesky/` as the authoritative implementation of the current ingestion pipeline.
- The milestone planning document only as a roadmap for future scope, not as a literal description of the code that exists today.

## Current implementation status

### Frontend

- Next.js app using the App Router under `src/app/`.
- Reusable UI components live under `src/components/ui/` and custom app components under `src/components/`.
- The app is currently a diagnostics/readout layer and is separate from the Python worker pipeline.
- Use `npm ci` and `npm run dev` for local frontend development.
- The eventual product direction includes a map dashboard with official alerts and social reports layered together, but this is not yet fully implemented in the current code.

### Python workers

The worker pipeline is implemented as standalone Python scripts rather than a web service:

- `workers/bluesky/core.py` handles filtering, validation, queueing, and local SQLite state.
- `workers/bluesky/worker.py` handles Bluesky ingestion, Gemini calls, Photon geocoding, and Supabase persistence.
- `workers/bluesky/demo.py` runs the offline presentation/demo flow without external credentials.
- `workers/bluesky/verify_storage.py` checks insert, update, and cleanup behavior in live storage.

The current live flow is:

`Bluesky → keyword filter → Gemini → Photon → validation → Supabase`

This repo also includes a local demo mode that uses fixed examples and isolated storage instead of real external services.

## Roadmap

While the implementation is incremental, the long-term project goal remains the broader Lone Star Support system described in the plan:

- NWS, TxDOT, and OpenStreetMap or related data workers for official disaster and road information.
- Bluesky disaster signal ingestion and AI extraction.
- Unified spatial data storage with PostGIS-style geospatial handling.
- A map-based frontend that visualizes alerts, closures, shelters, and social reports together.
- Background workers and persistence patterns that fit the existing Python-first architecture.

Agents should build toward this roadmap, but should not assume the full architecture already exists. Match the current stack and implementation patterns first, then extend them in the same direction as the plan.

## Important project conventions

- Keep the frontend and worker concerns separate. The Next.js app does not own the ingestion pipeline.
- Do not add FastAPI routes or assume a backend API exists unless the current code explicitly adds it.
- Do not ignore the milestone plan when deciding product scope; it remains the target architecture for the remaining work.
- Use Python 3.12+ for the worker scripts.
- Keep Supabase service-role credentials in the worker environment only; never expose them in the browser or in `NEXT_PUBLIC_*` variables.
- Treat the offline demo as a presentation tool; it is intentionally isolated from live production storage.
- Prefer incremental implementation that matches the current repo and then extends it toward the full disaster dashboard described in the plan.

## Common commands

Frontend:

```powershell
npm ci
npm run dev
```

Offline demo:

```powershell
python workers/bluesky/demo.py
```

Live worker checks:

```powershell
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py --check
workers/bluesky/.venv/Scripts/python.exe workers/bluesky/worker.py
```

Demo tests:

```powershell
python -m unittest discover -s workers/bluesky -p test_demo.py -v
```

## Working style for contributors

- Prefer the repo's actual implementation over historical planning documents when determining current architecture.
- Use the milestone plan to guide scope, product direction, and remaining work, especially for NWS/TxDOT/OSM ingestion and the map alert dashboard.
- When modifying the UI, keep it aligned with the current Next.js app structure and design system already in use.
- When modifying the worker, match the current queueing, validation, and persistence patterns used by the Python scripts.
- Update the docs if behavior changes, especially `README.md` and the worker documentation.

This file is intended to guide AI coding assistants and contributors to match the current repository state while preserving the target product and milestone goals for the project.
