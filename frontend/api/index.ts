/**
 * DistroMap suggestion API — TypeScript serverless function.
 *
 * This replaces the prior Python/FastAPI backend (api/index.py) so the
 * whole project is one stack: one `npm install`, one language, no Python
 * venv. It runs in TWO places from the SAME source file:
 *
 *   - Production (Vercel): `@vercel/node` deploys this file as a Node.js
 *     serverless function. `vercel.json` rewrites `/api/(.*) → /api/index`
 *     so every `/api/*` request lands here. The default export is the
 *     `(req, res)` handler Vercel invokes.
 *
 *   - Local dev (`npm run dev`): a Vite plugin in vite.config.js loads
 *     this module via `server.ssrLoadModule('api/index.ts')` and calls
 *     the same default export directly against the Vite dev server's
 *     req/res. No second process, no port 8765, no proxy — the Vite
 *     dev server serves both the SPA and the API on :5173.
 *
 * Endpoints (identical wire contract to the old Python API):
 *   GET  /api/health       → { ok, suggestions, mode, file? }
 *   GET  /api/suggestions  → [Suggestion, ...]   (last 100, newest first)
 *   POST /api/suggestions  → { ok, id, total? }  (append; 409 on dup)
 *
 * Storage (same dual-mode design as the Python version):
 *   - KV mode (production, when Vercel KV is linked): Upstash Redis REST
 *     via global fetch. An atomic Lua EVAL does dup-check + append in one
 *     round-trip so concurrent POSTs can't lose rows.
 *   - File mode (local dev, no KV env): JSON at frontend/.cache/api/
 *     suggestions.json with an async mutex around read-modify-write.
 *     Vercel's prod filesystem is read-only, so file mode will 500 on
 *     production POSTs without a linked KV store — link KV from
 *     Vercel → Storage → Create Database → KV.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ── Paths & env ───────────────────────────────────────────────────────
// This file lives at frontend/api/index.ts, so the frontend root is the
// parent of this file's directory. `process.cwd()` is the Vercel project
// root (frontend/) in both `vite dev` and production, so we resolve the
// cache file relative to it.
const FRONTEND_ROOT = path.resolve(process.cwd());
const SUGGESTIONS_FILE = path.join(FRONTEND_ROOT, '.cache', 'api', 'suggestions.json');
const KV_KEY = 'distromap:suggestions';

// Vercel KV (Upstash Redis REST) auto-injects these when a KV store is
// linked from the Vercel dashboard → Storage. Missing → file mode.
const KV_URL = (process.env.KV_REST_API_URL ?? '').trim();
const KV_TOKEN = (process.env.KV_REST_API_TOKEN ?? '').trim();

function usingKV(): boolean {
  return KV_URL.length > 0 && KV_TOKEN.length > 0;
}

// ── Types ─────────────────────────────────────────────────────────────

/** Row persisted to storage. Suggestion + server-generated fields. */
interface SuggestionRow {
  id: string;
  received_at: string;
  wikipedia_title: string;
  slug: string;
  parent: string;
  reason: string;
  qid: string | null;
  short_desc: string;
  extract: string;
  thumbnail: string | null;
  wiki_url: string;
  submitted_at: string;
  submitter_label: string | null;
}

/** Subset of SuggestionRow that the client sends (no id/received_at). */
interface SuggestionIn {
  wikipedia_title: string;
  slug: string;
  parent: string;
  reason: string;
  qid?: string | null;
  short_desc?: string;
  extract?: string;
  thumbnail?: string | null;
  wiki_url?: string;
  submitted_at: string;
  submitter_label?: string | null;
}

// ── Validation ────────────────────────────────────────────────────────
// Mirror of the Pydantic constr constraints from the old Python model.
// Returns an error message string on failure, or null if valid.
function validateSuggestion(p: SuggestionIn): string | null {
  const s = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : '';
  const wikipedia_title = s(p.wikipedia_title);
  if (wikipedia_title.length < 2 || wikipedia_title.length > 200)
    return 'wikipedia_title must be 2..200 chars';

  const slug = s(p.slug);
  if (slug.length < 2 || slug.length > 80 || !/^[a-z0-9_]+$/.test(slug))
    return 'slug must be 2..80 chars, matching ^[a-z0-9_]+$';

  const parent = s(p.parent);
  if (parent.length < 2 || parent.length > 80)
    return 'parent must be 2..80 chars';

  const reason = s(p.reason);
  if (reason.length < 4 || reason.length > 600)
    return 'reason must be 4..600 chars';

  const submitted_at = s(p.submitted_at);
  if (submitted_at.length < 10 || submitted_at.length > 40)
    return 'submitted_at must be 10..40 chars';

  // Optional bounded fields — only validate length if present.
  const qid = s(p.qid);
  if (qid && qid.length > 40) return 'qid must be ≤40 chars';
  const short_desc = s(p.short_desc);
  if (short_desc.length > 400) return 'short_desc must be ≤400 chars';
  const extract = s(p.extract);
  if (extract.length > 4000) return 'extract must be ≤4000 chars';
  const thumbnail = s(p.thumbnail);
  if (thumbnail.length > 800) return 'thumbnail must be ≤800 chars';
  const wiki_url = s(p.wiki_url);
  if (wiki_url.length > 400) return 'wiki_url must be ≤400 chars';
  const submitter_label = s(p.submitter_label);
  if (submitter_label.length > 80) return 'submitter_label must be ≤80 chars';

  return null;
}

/** Normalize a client payload into the fields we store. */
function normalizeRow(p: SuggestionIn): SuggestionRow {
  const now = Date.now();
  const id = `${p.slug.trim()}-${now}-${crypto.randomBytes(3).toString('hex')}`;
  return {
    id,
    received_at: new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    wikipedia_title: p.wikipedia_title.trim(),
    slug: p.slug.trim(),
    parent: p.parent.trim(),
    reason: p.reason.trim(),
    qid: typeof p.qid === 'string' && p.qid.trim() ? p.qid.trim() : null,
    short_desc: (p.short_desc ?? '').trim(),
    extract: (p.extract ?? '').trim(),
    thumbnail:
      typeof p.thumbnail === 'string' && p.thumbnail.trim()
        ? p.thumbnail.trim()
        : null,
    wiki_url: (p.wiki_url ?? '').trim(),
    submitted_at: p.submitted_at.trim(),
    submitter_label:
      typeof p.submitter_label === 'string' && p.submitter_label.trim()
        ? p.submitter_label.trim()
        : null,
  };
}

// ── File-mode storage (local dev) ─────────────────────────────────────
// A simple promise-chain mutex around read-modify-write so concurrent
// POSTs don't lose rows. Vercel prod filesystem is read-only; KV mode
// is used there instead.
let fileChain: Promise<unknown> = Promise.resolve();

async function ensureFile(): Promise<void> {
  await fs.mkdir(path.dirname(SUGGESTIONS_FILE), { recursive: true });
  try {
    await fs.access(SUGGESTIONS_FILE);
  } catch {
    await fs.writeFile(SUGGESTIONS_FILE, '[]', 'utf8');
  }
}

async function fileReadAll(): Promise<SuggestionRow[]> {
  await ensureFile();
  const raw = await fs.readFile(SUGGESTIONS_FILE, 'utf8');
  if (!raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SuggestionRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * Atomic-ish write: build the JSON string first, then write to a temp
 * file in the same directory and rename. fs.rename is atomic on POSIX,
 * so a reader never sees a half-written file.
 */
async function fileWriteAll(rows: SuggestionRow[]): Promise<void> {
  await ensureFile();
  const payload = JSON.stringify(rows, null, 2);
  const tmp = path.join(
    path.dirname(SUGGESTIONS_FILE),
    `.suggestions-${process.pid}-${Date.now()}.json.tmp`,
  );
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, SUGGESTIONS_FILE);
}

/** Run `fn` serially across all callers (file-mode concurrency guard). */
function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileChain.then(fn, fn); // chain even on rejection
  fileChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── Vercel KV (Upstash Redis REST) adapter ────────────────────────────
// Same shape as the Python adapter: every command is POSTed to the bare
// KV_REST_API_URL with a JSON command-array body and a Bearer header.
// Uses global fetch (Node 18+ / Vercel Node runtime).

async function kvPost(payload: unknown): Promise<unknown> {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    throw new Error(`KV REST ${r.status}: ${await r.text().catch(() => '')}`);
  }
  return r.json();
}

/** Strip Upstash's `{"result": ...}` envelope. */
function kvResult(out: unknown): unknown {
  if (out && typeof out === 'object' && 'result' in out) {
    return (out as { result: unknown }).result;
  }
  return out;
}

async function kvReadAll(): Promise<SuggestionRow[]> {
  const out = await kvPost(['GET', KV_KEY]);
  const raw = kvResult(out);
  if (!raw) return [];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? (arr as SuggestionRow[]) : [];
  } catch {
    return [];
  }
}

// Lua script: atomic dup-check + append in one round-trip. Returns
// [0, newLength] on success, [-1, currentLength] on duplicate. Same
// logic as the Python version — EVAL is atomic on the Redis server.
const KV_APPEND_LUA = `
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
`;

/**
 * Returns [ok, newLength] for the POST flow. Atomic on the Redis server
 * so two concurrent POSTs can't both read the same array and lose rows.
 */
async function kvAppendOne(
  row: SuggestionRow,
): Promise<[boolean, number]> {
  const out = await kvPost([
    'EVAL',
    KV_APPEND_LUA,
    1,
    KV_KEY,
    JSON.stringify(row),
    row.slug,
    row.wikipedia_title,
  ]);
  const result = kvResult(out);
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error(`unexpected EVAL response: ${JSON.stringify(out)}`);
  }
  const status = Number(result[0]);
  const length = Number(result[1]);
  return [status === 0, length];
}

// ── Request normalization (works in BOTH Vite dev + Vercel prod) ──────
// @vercel/node auto-parses JSON bodies and populates req.query. The
// Vite dev server gives us a raw http.IncomingMessage with an unread
// stream body and no `query` property. These helpers bridge the gap so
// the route handlers can treat both environments the same.

/** Read the request body as a string, handling stream + pre-parsed. */
async function readBody(req: VercelRequest): Promise<string> {
  // @vercel/node already parsed it → stringify back.
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  // Vite dev: raw stream — collect chunks.
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer | string) => {
      data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Parse query params from req.url (works when req.query is absent). */
function getQuery(req: VercelRequest): Record<string, string> {
  // @vercel/node populates req.query already.
  if (req.query && typeof req.query === 'object') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      out[k] = Array.isArray(v) ? String(v[0]) : String(v);
    }
    return out;
  }
  // Vite dev: parse from req.url ourselves. URLSearchParams handles
  // `+`-as-space and URL-encoding correctly, and .entries() takes the
  // first value for duplicate keys (matching the @vercel/node branch).
  const raw = req.url ?? '';
  const qIdx = raw.indexOf('?');
  if (qIdx < 0) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw.slice(qIdx + 1)).entries()) {
    if (!(k in out)) out[k] = v;
  }
  return out;
}

// ── HTTP helpers ──────────────────────────────────────────────────────

function sendJSON(
  res: VercelResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** Health response; file mode includes the on-disk path for dev DX. */
interface HealthOut {
  ok: true;
  suggestions: number;
  mode: 'kv' | 'file';
  file?: string;
}

// ── Route handlers ────────────────────────────────────────────────────
// Each returns a boolean so the caller knows whether the response was
// sent (true) or whether it should fall through (false). A single
// default-exported handler dispatches by method + path — Vercel's
// rewrites send all /api/* here.

async function handleHealth(res: VercelResponse): Promise<boolean> {
  let rows: SuggestionRow[];
  if (usingKV()) {
    rows = await kvReadAll();
  } else {
    rows = await withFileLock(() => fileReadAll());
  }
  const out: HealthOut = {
    ok: true,
    suggestions: rows.length,
    mode: usingKV() ? 'kv' : 'file',
  };
  if (!usingKV()) out.file = SUGGESTIONS_FILE;
  sendJSON(res, 200, out);
  return true;
}

async function handleList(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const query = getQuery(req);
  const rawLimit = Number(query.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 100;
  if (limit < 1 || limit > 500) {
    sendJSON(res, 400, { detail: 'limit must be 1..500' });
    return true;
  }
  let rows: SuggestionRow[];
  if (usingKV()) {
    rows = await kvReadAll();
  } else {
    rows = await withFileLock(() => fileReadAll());
  }
  // newest first: take the last `limit` rows, reverse.
  sendJSON(res, 200, rows.slice(-limit).reverse());
  return true;
}

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  let payload: SuggestionIn;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw || '{}');
  } catch {
    sendJSON(res, 400, { detail: 'invalid JSON body' });
    return true;
  }

  const err = validateSuggestion(payload);
  if (err) {
    sendJSON(res, 422, { detail: err });
    return true;
  }

  const row = normalizeRow(payload);

  if (usingKV()) {
    try {
      const [ok, length] = await kvAppendOne(row);
      if (!ok) {
        sendJSON(res, 409, {
          detail: `Suggestion for slug '${row.slug}' already on file.`,
        });
        return true;
      }
      sendJSON(res, 201, { ok: true, id: row.id, total: length });
      return true;
    } catch (e) {
      sendJSON(res, 500, {
        detail: 'KV write failed',
        error: e instanceof Error ? e.message : String(e),
      });
      return true;
    }
  }

  // File mode — locked read-modify-write so concurrent POSTs don't
  // lose rows. Same semantics as the Python version.
  try {
    const result = await withFileLock(async () => {
      const rows = await fileReadAll();
      if (
        rows.some(
          (r) =>
            r.slug === row.slug && r.wikipedia_title === row.wikipedia_title,
        )
      ) {
        return { dup: true as const };
      }
      rows.push(row);
      await fileWriteAll(rows);
      return { dup: false as const };
    });
    if (result.dup) {
      sendJSON(res, 409, {
        detail: `Suggestion for slug '${row.slug}' already on file.`,
      });
      return true;
    }
    sendJSON(res, 201, { ok: true, id: row.id });
    return true;
  } catch (e) {
    sendJSON(res, 500, {
      detail: 'file write failed',
      error: e instanceof Error ? e.message : String(e),
    });
    return true;
  }
}

// ── Default export: Vercel handler + Vite dev entry ───────────────────
// One function serves both runtimes. The Vite plugin (see vite.config.js)
// calls this directly with the dev server's req/res.

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // CORS — dev defaults + Vercel preview/prod regex + env extras.
  // Vercel generates a new *.vercel.app subdomain per preview; the
  // regex matches the whole family. Custom domains go in ALLOWED_ORIGINS.
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowedExact = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    ...extraOrigins,
  ]);
  const vercelMatch = /^https:\/\/[a-z0-9-]+(\-[a-z0-9-]+)*\.vercel\.app$/;
  if (origin) {
    if (allowedExact.has(origin) || vercelMatch.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, OPTIONS',
      );
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
  }
  // Preflight short-circuit.
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Normalize the path: strip a leading /api if present so the same
  // handler works whether Vercel forwards the full path (/api/health)
  // or strips the function-mount prefix before we see it (/health).
  // This mirrors the dual-mount router trick from the Python version.
  const rawPath = req.url ?? '';
  const pathNoApi = rawPath.replace(/^\/api/, '');
  const p = pathNoApi === '' ? '/' : pathNoApi;
  // Drop any query string for routing.
  const routePath = p.split('?')[0];

  try {
    if (req.method === 'GET' && routePath === '/health') {
      await handleHealth(res);
      return;
    }
    if (req.method === 'GET' && routePath === '/suggestions') {
      await handleList(req, res);
      return;
    }
    if (req.method === 'POST' && routePath === '/suggestions') {
      await handlePost(req, res);
      return;
    }
    // Friendly root for `curl http://localhost:5173/api/` in dev.
    if (req.method === 'GET' && routePath === '/') {
      sendJSON(res, 200, {
        service: 'DistroMap Suggestions API',
        version: '1.0.0',
        endpoints: ['/api/health', '/api/suggestions (GET, POST)'],
      });
      return;
    }
    sendJSON(res, 404, { detail: 'not found', path: routePath });
  } catch (e) {
    sendJSON(res, 500, {
      detail: 'internal error',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
