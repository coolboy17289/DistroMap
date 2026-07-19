"""
Vercel Python entrypoint for the DistroMap suggestion API.

Vercel's @vercel/python runtime auto-discovers `api/*.py` at the repo
root (NOT inside backend/) and looks for an exported `handler`
symbol. We wrap the FastAPI ASGI app with Mangum so the runtime's
WSGI bridge correctly forwards async events — without this any
`async def` route in FastAPI would 500 on Vercel even though it
works locally. `lifespan="off"` because serverless functions don't
have a stable lifespan and we don't want FastAPI startup/shutdown
hooks firing on every cold start.

Local dev: `python3 backend/app.py` (or `uvicorn backend.app:app`)
uses the FastAPI app directly — Mangum is bypassed.
"""
from mangum import Mangum
from backend.app import app

# Vercel's Python runtime reads `handler` from this file. Anything
# else we re-export (e.g. `app`) is harmless but not used by the
# runtime uplink.
handler = Mangum(app, lifespan="off")
