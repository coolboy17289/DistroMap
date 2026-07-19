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
import os
import tempfile
import threading
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, constr

ROOT = Path(__file__).resolve().parents[1]
SUGGESTIONS_FILE = ROOT / ".cache" / "api" / "suggestions.json"

# Vercel KV (Upstash Redis REST) auto-injects these env vars when a
# KV store is linked from Vercel dashboard → Storage. We default to
# the file layer (existing locally-tested code) when either is
# missing so `npm run backend` keeps working without any setup.
KV_URL = os.environ.get("KV_REST_API_URL", "").strip()
KV_TOKEN = os.environ.get("KV_REST_API_TOKEN", "").strip()
KV_KEY = "distromap:suggestions"


def _kv_health() -> str | None:
    """
    Return None if KV is configured correctly, else a reason string that
    prints explaining why we're staying in file mode.

    urllib.parse.urlparse is lenient — it accepts strings like
    `not-a-url` as a path. We layer extra checks: netloc present +
    http(s) scheme. For deeper validation we'd send a `["PING"]` to
    the KV at startup, but that adds a startup round-trip on every
    cold start, so we keep validation cheap and let the first real
    request surface auth/network failures with a 500 → localStorage
    fallback in the frontend.
    """
    if not KV_URL or not KV_TOKEN:
        return "env vars not set"
    try:
        parsed = urllib.parse.urlparse(KV_URL)
    except ValueError as e:
        return f"unparseable URL: {e}"
    if parsed.scheme not in ("http", "https"):
        return f"unsupported scheme {parsed.scheme!r}"
    if not parsed.netloc:
        return "missing host"
    return None


def _using_kv() -> bool:
    return _kv_health() is None


_kv_disabled_reason = _kv_health()
if _kv_disabled_reason and (KV_URL or KV_TOKEN):
    # Print once at import time so a misconfigured production deploy
    # surfaces in `vercel logs` immediately. We deliberately never
    # mention KV_TOKEN itself — only whether it was set, to avoid
    # leaking any information about secret presence.
    print(f"[distromap] KV disabled: {_kv_disabled_reason}")

app = FastAPI(
    title="DistroMap Suggestions API",
    version="0.5.0",
    description="v0.5 — append-only suggestion intake. The file backing "
    "this is committed via PR; no auth because the maintainer is the "
    "only writer that matters.",
)

# CORS — dev defaults + Vercel preview/prod regex + env-driven extras.
#
# Why a regex for vercel.app?
# Vercel generates a new subdomain per branch / PR preview
# (`distromap-<hash>-<team>.vercel.app`). Hard-coding them all is
# brittle, but `allow_origin_regex` lets us match the whole family
# with one pattern. The pattern only allows *.vercel.app which is
# already a controlled namespace; non-Vercel browsers cannot claim it.
_BASE_LOCAL_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]
_VERCEL_ORIGIN_REGEX = r"^https://[a-z0-9-]+(\-[a-z0-9-]+)*\.vercel\.app$"


def _extra_origins() -> list[str]:
    """Comma-separated `ALLOWED_ORIGINS` env var for custom domains or LAN IPs."""
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return []
    return [o.strip() for o in raw.split(",") if o.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_BASE_LOCAL_ORIGINS + _extra_origins(),
    allow_origin_regex=_VERCEL_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

# Single lock around the read-modify-write of SUGGESTIONS_FILE.
# FastAPI runs sync `def` endpoints in a threadpool, so threading.Lock
# is the right primitive (an asyncio.Lock would only protect coroutines
# that yield control, which the file ops do not).
_FILE_LOCK = threading.Lock()


# ── Models ────────────────────────────────────────────────────────────


class SuggestionIn(BaseModel):
    # v2-friendly constraint kwargs: `pattern` replaces the deprecated
    # `regex` kwarg from Pydantic v1. Pinned in requirements.txt.
    wikipedia_title: constr(strip_whitespace=True, min_length=2, max_length=200)
    slug:            constr(strip_whitespace=True, min_length=2, max_length=80, pattern=r"^[a-z0-9_]+$")
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
    """Read all suggestions; routes through KV when configured, file otherwise."""
    if _using_kv():
        return _kv_read_all()
    _ensure_file()
    return json.loads(SUGGESTIONS_FILE.read_text(encoding="utf-8") or "[]")


def _write_all(rows: list[dict[str, Any]]) -> None:
    """Write the full suggestions list. When in KV mode, prefer atomic kv_replace."""
    if _using_kv():
        _kv_replace(rows)
        return
    _ensure_file()
    payload = json.dumps(rows, indent=2, ensure_ascii=False)
    fd, tmp_path = tempfile.mkstemp(
        dir=str(SUGGESTIONS_FILE.parent),
        prefix=".suggestions-",
        suffix=".json.tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_path, SUGGESTIONS_FILE)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


# ── Vercel KV (Upstash Redis REST) adapter ────────────────────────
#
# Why urllib and not httpx?
#   Cold-start budget on Vercel Python is ~600-1000 ms total; `import
#   httpx` adds ~80 ms and a transitive bytes payload we'd rather not
#   pay. Upstash's REST API is dead simple JSON-in / JSON-out, so the
#   stdlib is enough.
#
# Why Lua for the atomic write path?
#   GET-then-SET is two round-trips with a race window: two concurrent
#   POSTs both read [], both append, last SET wins. Lua executes
#   atomically on the Redis server, so we lose no rows. EVAL also
#   returns the dup-check result so we can return a 409 from one
#   round-trip without an extra GET.
_KV_APPEND_LUA = """
local cur = redis.call('GET', KEYS[1])
local arr
if cur then
  arr = cjson.decode(cur)
else
  arr = {}
end
for _, v in ipairs(arr) do
  if v.slug == ARGV[2] and v.wikipedia_title == ARGV[3] then
    return {-1, #arr}
  end
end
table.insert(arr, cjson.decode(ARGV[1]))
redis.call('SET', KEYS[1], cjson.encode(arr))
return {0, #arr}
"""


def _kv_post(payload: list[Any]) -> Any:
    """
    Upstash Redis REST: every command (GET, SET, EVAL...) is POSTed
    to the bare KV_REST_API_URL with a JSON command-array body and a
    Bearer-token Authorization header. There is no /get or /set URL
    path — the path is always `/` and the command lives in the body.
    Upstash returns `{"result": <value>}` JSON which we pass back
    unchanged for callers to interpret.
    """
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        KV_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {KV_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read())


def _kv_result(out: Any) -> Any:
    """Strip Upstash's `{"result": ...}` envelope; pass through raw arrays too."""
    if isinstance(out, dict) and "result" in out:
        return out["result"]
    return out


def _kv_read_all() -> list[dict[str, Any]]:
    """
    `GET distromap:suggestions`. The result is a JSON string (or
    nil — Upstash returns `null` for missing keys). Empty / nil /
    undecodable → empty list.
    """
    out = _kv_post(["GET", KV_KEY])
    raw = _kv_result(out)
    if not raw:
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return []


def _kv_replace(rows: list[dict[str, Any]]) -> None:
    """
    Wholesale write. `SET distromap:suggestions <json>` with a 1-year
    EX so old keys don't accumulate forever on a free tier. Use
    `_kv_append_one` for the normal POST flow (atomic Lua).
    """
    value = json.dumps(rows, ensure_ascii=False)
    _kv_post(["SET", KV_KEY, value, "EX", 60 * 60 * 24 * 365])


def _kv_append_one(row: dict[str, Any]) -> tuple[bool, int]:
    """
    Returns (ok, new_length) for the POST flow.

    Uses Upstash REST EVAL with a short Lua script that:
      - reads the current JSON array at KV_KEY,
      - rejects if a record with the same (slug, wikipedia_title) exists,
      - appends the new record,
      - writes the array back.

    EVAL is atomic on the Redis server, so two concurrent POSTs
    can't both read the same array and lose rows in a GET-then-SET
    race window. The Lua script returns a 2-element array:
      [0, new_length] on success, [-1, current_length] on duplicate.
    """
    body = [
        "EVAL",
        _KV_APPEND_LUA,
        1,
        KV_KEY,
        json.dumps(row),
        row.get("slug", ""),
        row.get("wikipedia_title", ""),
    ]
    out = _kv_post(body)
    result = _kv_result(out)
    if not isinstance(result, list) or len(result) < 2:
        raise RuntimeError(f"unexpected EVAL response: {out!r}")
    status, length = int(result[0]), int(result[1])
    return (status == 0, length)


# ── Routes ────────────────────────────────────────────────────────────


@app.get("/api/health")
def health() -> dict[str, Any]:
    # KV mode is atomic server-side; file mode needs the lock to
    # avoid reading a half-written JSON. Branching on mode keeps
    # file-mode concurrency race-tested without paying for an
    # extra lock acquisition in KV mode that does nothing.
    if _using_kv():
        rows = _read_all()
    else:
        with _FILE_LOCK:
            rows = _read_all()
    out: dict[str, Any] = {
        "ok": True,
        "suggestions": len(rows),
        "mode": "kv" if _using_kv() else "file",
    }
    if not _using_kv():
        out["file"] = str(SUGGESTIONS_FILE)
    return out


@app.get("/api/suggestions")
def list_suggestions(limit: int = 100) -> list[dict[str, Any]]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be 1..500")
    if _using_kv():
        rows = _read_all()
    else:
        with _FILE_LOCK:
            rows = _read_all()
    return rows[-limit:][::-1]  # newest first


@app.post("/api/suggestions", status_code=201)
def post_suggestion(payload: SuggestionIn) -> dict[str, Any]:
    row = payload.dict()
    row["id"] = f"{payload.slug}-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:6]}"
    row["received_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if _using_kv():
        # Single atomic round-trip; Lua does dup-check + append.
        ok, length = _kv_append_one(row)
        if not ok:
            raise HTTPException(
                status_code=409,
                detail=f"Suggestion for slug '{payload.slug}' already on file.",
            )
        return {"ok": True, "id": row["id"], "total": length}

    # File mode — locked read-modify-write so concurrent POSTs don't
    # lose rows; tests already verified 10 concurrent POSTs all land.
    with _FILE_LOCK:
        rows = _read_all()
        if any(r.get("slug") == payload.slug and r.get("wikipedia_title") == payload.wikipedia_title
               for r in rows):
            raise HTTPException(
                status_code=409,
                detail=f"Suggestion for slug '{payload.slug}' already on file.",
            )
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
