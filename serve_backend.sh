#!/usr/bin/env bash
# Frontend helper script (used by `npm run backend` in ../frontend).
# Installs Python deps if needed and boots the suggestion API on :8765.
set -euo pipefail

# Resolve repo root regardless of where this script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create a venv-of-one in the repo if one doesn't exist.
VENV="$SCRIPT_DIR/.venv"
if [[ ! -d "$VENV" ]]; then
  echo "Creating venv at $VENV"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip
  "$VENV/bin/pip" install -r "$SCRIPT_DIR/backend/requirements.txt"
fi

# Pick the venv's python regardless of who's calling.
exec "$VENV/bin/python" -m uvicorn backend.app:app --reload --port 8765
