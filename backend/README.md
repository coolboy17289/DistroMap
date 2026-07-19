# DistroMap Suggestions API (v0.5)

Tiny FastAPI service for receiving user-submitted distro suggestions.
The data layer is a plain JSON file at `.cache/api/suggestions.json`
that the maintainer commits via PR — no auth, no database.

## Run

```bash
# from repo root
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --reload --port 8765
```

Or, after the frontend `npm install`:

```bash
cd frontend && npm run backend   # wraps the same command
```

While uvicorn is running, the frontend's `/api/*` calls (relative to
Vite at http://127.0.0.1:5173) are proxied to
http://127.0.0.1:8765 via `frontend/vite.config.js`.

## Endpoints

| Method | Path                | Body                | Returns                                  |
|--------|---------------------|---------------------|------------------------------------------|
| GET    | `/api/health`       | —                   | `{ ok: bool, suggestions: int, file }`   |
| GET    | `/api/suggestions`  | —                   | `[Suggestion, …] (newest-first)`         |
| POST   | `/api/suggestions`  | `SuggestionIn` JSON | `{ ok: bool, id: string }` (201)         |

`POST` returns 409 on (slug, wikipedia_title) duplicates.

## Storage

`POST` appends one record to `.cache/api/suggestions.json`. The
maintainer periodically reviews that file, and on accept:

1. Adds the slug to `DISTROS` in `.cache/fetch_distros.py`
2. Runs `python3 .cache/fetch_distros.py && python3 .cache/build_distro_files.py`
3. Trims the JSON to keep only rejected/failed submissions as audit log

The frontend's `SuggestForm` falls back to `localStorage` + a JSON
download if the backend is unreachable, so suggestions are never lost.
