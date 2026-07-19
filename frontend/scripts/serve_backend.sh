#!/usr/bin/env bash
# Local dev launcher for the DistroMap suggestion API, run from
# `npm run backend` inside frontend/. Installs Python deps if
# needed and boots uvicorn on :8765 against api/index:app.
#
# Vercel uses the same api/index.py file in production (Mangum
# wraps the FastAPI app for the serverless runtime); this script
# is the local-dev counterpart that talks to FastAPI directly via
# uvicorn's ASGI interface, so no Mangum is involved here.
set -euo pipefail

# Resolve script's parent (frontend/) regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Make a venv-of-one inside frontend/ if one doesn't exist yet.
VENV="$ROOT_DIR/.venv"
if [[ ! -d "$VENV" ]]; then
  echo "Creating venv at $VENV"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip
  "$VENV/bin/pip" install -r "$ROOT_DIR/requirements.txt"
fi

# Pick the venv's python regardless of who's calling. cwd is
# frontend/ so `api.index:app` resolves to frontend/api/index.py.
# Implicit namespace packages (PEP 420, Python 3.3+) make this
# work without an __init__.py inside frontend/api/.
exec "$VENV/bin/python" -m uvicorn api.index:app --reload --port 8765
