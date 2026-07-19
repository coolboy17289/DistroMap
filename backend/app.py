"""
v0.5 — minimal FastAPI for user-submitted distro suggestions.

Why this exists
---------------
The docs/idea.md brief calls for a Python FastAPI backend. We keep it
deliberately tiny: a single file, no ORM, no auth, and the "database"
is a plain JSON file at `.cache/api/suggestions.json` that maintainers
commit via PR. This matches the trick in README ("submit suggestions
flows through one free external source – Wikidata – and the file the
frontend reads is reproducible").

Endpoints
---------
GET  /api/health         → { ok: True, suggestions: <int> }
GET  /api/suggestions    → [Suggestion, ...]                          (last 100)
POST /api/suggestions    → { ok: True, id: <slug-ts> }                 (append)

Run
---
    pip install -r backend/requirements.txt
    uvicorn backend.app:app --reload --port 8765
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, constr

ROOT = Path(__file__).resolve().parents[1]
SUGGESTIONS_FILE = ROOT / ".cache" / "api" / "suggestions.json"

app = FastAPI(
    title="DistroMap Suggestions API",
    version="0.5.0",
    description="v0.5 — append-only suggestion intake. The file backing "
    "this is committed via PR; no auth because the maintainer is the "
    "only writer that matters.",
)

# CORS for local Vite dev (5173) and 127.0.0.1, plus file:// previews.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)


# ── Models ────────────────────────────────────────────────────────────


class SuggestionIn(BaseModel):
    wikipedia_title: constr(strip_whitespace=True, min_length=2, max_length=200)
    slug:            constr(strip_whitespace=True, min_length=2, max_length=80, regex=r"^[a-z0-9_]+$")
    parent:          constr(strip_whitespace=True, min_length=2, max_length=80) = "linux_kernel"
    reason:          constr(strip_whitespace=True, min_length=4, max_length=600)
    qid:             constr(strip_whitespace=True, min_length=1, max_length=40) | None = None
    short_desc:      constr(strip_whitespace=True, max_length=400) = ""
    extract:         constr(strip_whitespace=True, max_length=4000) = ""
    thumbnail:       constr(strip_whitespace=True, max_length=800) | None = None
    wiki_url:        constr(strip_whitespace=True, max_length=400) = ""
    submitted_at:    constr(strip_whitespace=True, min_length=10, max_length=40)
    submitter_label: constr(strip_whitespace=True, max_length=80) | None = Field(
        default=None,
        description="Optional tag — used by the maintainer to spot duplicates / spam.",
    )


# ── Storage ───────────────────────────────────────────────────────────


def _ensure_file() -> None:
    SUGGESTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not SUGGESTIONS_FILE.exists():
        SUGGESTIONS_FILE.write_text("[]", encoding="utf-8")


def _read_all() -> list[dict[str, Any]]:
    _ensure_file()
    return json.loads(SUGGESTIONS_FILE.read_text(encoding="utf-8") or "[]")


def _write_all(rows: list[dict[str, Any]]) -> None:
    _ensure_file()
    SUGGESTIONS_FILE.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Routes ────────────────────────────────────────────────────────────


@app.get("/api/health")
def health() -> dict[str, Any]:
    _ensure_file()
    rows = _read_all()
    return {"ok": True, "suggestions": len(rows), "file": str(SUGGESTIONS_FILE)}


@app.get("/api/suggestions")
def list_suggestions(limit: int = 100) -> list[dict[str, Any]]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be 1..500")
    rows = _read_all()
    return rows[-limit:][::-1]  # newest first


@app.post("/api/suggestions", status_code=201)
def post_suggestion(payload: SuggestionIn) -> dict[str, Any]:
    # De-dup on (slug, wikipedia_title) so refresh-submits don't pile up.
    rows = _read_all()
    if any(r.get("slug") == payload.slug and r.get("wikipedia_title") == payload.wikipedia_title
           for r in rows):
        raise HTTPException(
            status_code=409,
            detail=f"Suggestion for slug '{payload.slug}' already on file.",
        )

    row = payload.dict()
    row["id"] = f"{payload.slug}-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:6]}"
    row["received_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows.append(row)
    _write_all(rows)
    return {"ok": True, "id": row["id"]}


# Convenience root so a `curl http://localhost:8765/` is friendly.
@app.get("/")
def index() -> dict[str, Any]:
    return {
        "service": "DistroMap Suggestions API",
        "version": "0.5.0",
        "endpoints": ["/api/health", "/api/suggestions (GET, POST)"],
    }
