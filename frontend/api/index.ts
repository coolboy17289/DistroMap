/**
 * DistroMap API — TypeScript serverless function.
 *
 * Runs in two places from the SAME source file:
 *
 *   - Production (Vercel): `@vercel/node` deploys this file as a Node.js
 *     serverless function. `vercel.json` rewrites `/api/(.*) → /api/index`
 *     so every `/api/*` request lands here.
 *
 *   - Local dev (`npm run dev`): a Vite plugin in vite.config.js loads
 *     this module via `server.ssrLoadModule('api/index.ts')` and calls
 *     the same default export directly against the Vite dev server's
 *     req/res.
 *
 * Endpoints (all no-API-key, all public):
 *   GET  /api/health                  → health + counts
 *   GET  /api/distros                 → full list (filters: family, status, category, q, arch, init)
 *   GET  /api/distros/:slug           → one distro
 *   GET  /api/search?q=&limit=        → ranked search results
 *   GET  /api/families                → list families + counts
 *   GET  /api/family/:family          → distros in a family
 *   GET  /api/related/:slug           → same-family distros
 *   GET  /api/descendants/:slug       → full descendant tree
 *   GET  /api/ancestors/:slug         → chain back to linux_kernel
 *   GET  /api/path?from=&to=          → shortest parent-chain path
 *   GET  /api/compare?a=&b=           → side-by-side + common ancestor
 *   GET  /api/stats                   → counts
 *   GET  /api/random                  → one random distro
 *   GET  /api/graph                   → nodes + edges for the full graph
 *   GET  /api/categories              → boolean category flags + counts
 *   GET  /api/og/:slug.svg            → SVG OG image (1200×630)
 *   GET  /api/og/:slug.png            → same, PNG-mimetype alias
 *   GET  /api/suggestions             → last 100 suggestions
 *   POST /api/suggestions             → append (409 on dup)
 *
 * The distro dataset is loaded once per cold start and cached in
 * module scope. The read-only endpoints are edge-cacheable via
 * Cache-Control: s-maxage headers (Vercel CDN).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ── Paths & env ───────────────────────────────────────────────────────
const FRONTEND_ROOT = path.resolve(process.cwd());
const SUGGESTIONS_FILE = path.join(FRONTEND_ROOT, '.cache', 'api', 'suggestions.json');
const DISTROS_FILE = path.join(FRONTEND_ROOT, 'src', 'data', 'distros.json');
const GRAPH_FILE = path.join(FRONTEND_ROOT, 'src', 'data', 'graph.json');
const KV_KEY = 'distromap:suggestions';

const KV_URL = (process.env.KV_REST_API_URL ?? '').trim();
const KV_TOKEN = (process.env.KV_REST_API_TOKEN ?? '').trim();

function usingKV(): boolean {
  return KV_URL.length > 0 && KV_TOKEN.length > 0;
}

// ── Types ─────────────────────────────────────────────────────────────

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

interface DistroRow {
  id: string;
  slug: string;
  name: string;
  display: string;
  family: string;
  parents: string[];
  parent: string | null;
  children: string[];
  based_on: string | null;
  kernel_root: string;
  first_release: string | null;
  latest_release: string | null;
  status: 'Active' | 'Discontinued';
  release_model: string;
  package_manager: string;
  package_format: string;
  desktop_defaults: string[];
  init_system: string;
  architecture: string[];
  license: string;
  website: string | null;
  source_code: string | null;
  description: string;
  logo: string | null;
  color: string;
  country: string | null;
  developer: string | null;
  maintainer: string | null;
  immutable: boolean;
  rolling: boolean;
  lts: boolean;
  gaming: boolean;
  privacy: boolean;
  security: boolean;
  education: boolean;
  server: boolean;
  embedded: boolean;
  container: boolean;
  cloud: boolean;
  arm: boolean;
  discontinued_year: number | null;
  /** Set by the synthesis pass for O(1) family-tree depth. */
  depth?: number;
}

interface GraphFile {
  nodes: Array<{ id: string; name: string; family: string; depth: number; status: string }>;
  edges: Array<{ from: string; to: string }>;
}

// ── Dataset cache (read-only) ────────────────────────────────────────
// Loaded once per cold start; in-memory for the warm window.

let _distros: DistroRow[] | null = null;
let _distrosBySlug: Map<string, DistroRow> | null = null;
let _graph: GraphFile | null = null;
let _depthBySlug: Map<string, number> | null = null;

async function loadDistros(): Promise<DistroRow[]> {
  if (_distros) return _distros;
  try {
    const raw = await fs.readFile(DISTROS_FILE, 'utf8');
    const arr = JSON.parse(raw) as DistroRow[];
    _distros = arr;
    _distrosBySlug = new Map(arr.map((d) => [d.slug, d]));
    _depthBySlug = computeDepths(arr);
    return arr;
  } catch (e) {
    console.error('[distromap] failed to load distros.json:', e);
    _distros = [];
    _distrosBySlug = new Map();
    _depthBySlug = new Map();
    return _distros;
  }
}

function computeDepths(arr: DistroRow[]): Map<string, number> {
  // BFS from root nodes (those with `parent === null`). If a record
  // carries an explicit `depth` field (preferred), honour it; otherwise
  // walk the parent chain to compute it on the fly.
  const bySlug = new Map(arr.map((d) => [d.slug, d]));
  const out = new Map<string, number>();
  // BFS starting from any node with parent === null
  const roots = arr.filter((d) => d.parent === null);
  const queue: Array<{ slug: string; depth: number }> = roots.map((r) => ({
    slug: r.slug,
    depth: r.depth ?? 0,
  }));
  while (queue.length) {
    const { slug, depth } = queue.shift()!;
    if (out.has(slug)) continue;
    out.set(slug, depth);
    const node = bySlug.get(slug);
    if (!node) continue;
    for (const c of node.children) queue.push({ slug: c, depth: depth + 1 });
  }
  // Fallback: any record still missing (e.g. orphan) gets depth from
  // explicit field or 99.
  for (const d of arr) {
    if (!out.has(d.slug)) out.set(d.slug, d.depth ?? 99);
  }
  return out;
}

async function loadGraph(): Promise<GraphFile> {
  if (_graph) return _graph;
  try {
    const raw = await fs.readFile(GRAPH_FILE, 'utf8');
    _graph = JSON.parse(raw) as GraphFile;
    return _graph;
  } catch (e) {
    console.error('[distromap] failed to load graph.json:', e);
    _graph = { nodes: [], edges: [] };
    return _graph;
  }
}

async function getBySlug(slug: string): Promise<DistroRow | null> {
  const all = await loadDistros();
  if (!_distrosBySlug) _distrosBySlug = new Map(all.map((d) => [d.slug, d]));
  return _distrosBySlug.get(slug) ?? null;
}

async function depthOf(slug: string): Promise<number> {
  const all = await loadDistros();
  if (!_depthBySlug) _depthBySlug = computeDepths(all);
  return _depthBySlug.get(slug) ?? 99;
}

// ── Validation (suggestion) ───────────────────────────────────────────

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

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileChain.then(fn, fn);
  fileChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ── Vercel KV (Upstash Redis REST) adapter ────────────────────────────

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

async function readBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer | string) => {
      data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function getQuery(req: VercelRequest): Record<string, string> {
  if (req.query && typeof req.query === 'object') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      out[k] = Array.isArray(v) ? String(v[0]) : String(v);
    }
    return out;
  }
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
  cacheSec = 3600,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cacheSec > 0) {
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheSec}, stale-while-revalidate=86400`,
    );
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

function sendSVG(
  res: VercelResponse,
  status: number,
  svg: string,
  cacheSec = 3600,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  if (cacheSec > 0) {
    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${cacheSec}, stale-while-revalidate=86400`,
    );
  }
  res.end(svg);
}

function sendNotFound(res: VercelResponse, detail: string): void {
  sendJSON(res, 404, { detail });
}

function sendBadRequest(res: VercelResponse, detail: string): void {
  sendJSON(res, 400, { detail });
}

// ── Distro helpers ────────────────────────────────────────────────────

const CATEGORY_FLAGS = [
  'immutable',
  'rolling',
  'lts',
  'gaming',
  'privacy',
  'security',
  'education',
  'server',
  'embedded',
  'container',
  'cloud',
  'arm',
] as const;

type CategoryFlag = (typeof CATEGORY_FLAGS)[number];

/** Score a single distro against a free-text query. Higher is better. */
function scoreMatch(d: DistroRow, q: string): number {
  if (!q) return 1;
  const ql = q.toLowerCase();
  let score = 0;
  if (d.slug === ql) score += 200;
  if (d.name.toLowerCase() === ql) score += 200;
  if (d.name.toLowerCase().startsWith(ql)) score += 80;
  if (d.slug.includes(ql)) score += 60;
  if (d.name.toLowerCase().includes(ql)) score += 50;
  if (d.family.includes(ql)) score += 30;
  if ((d.based_on ?? '').toLowerCase().includes(ql)) score += 20;
  if (d.country?.toLowerCase().includes(ql)) score += 15;
  if (d.developer?.toLowerCase().includes(ql)) score += 15;
  if (d.package_manager.toLowerCase().includes(ql)) score += 12;
  if (d.init_system.toLowerCase().includes(ql)) score += 10;
  if (d.release_model.toLowerCase().includes(ql)) score += 10;
  if (d.license.toLowerCase().includes(ql)) score += 5;
  if (d.desktop_defaults.some((de) => de.toLowerCase().includes(ql))) score += 25;
  if (d.architecture.some((a) => a.toLowerCase().includes(ql))) score += 8;
  if (d.description.toLowerCase().includes(ql)) score += 6;
  return score;
}

function buildChildTree(d: DistroRow, all: DistroRow[]): DistroRow[] {
  const out: DistroRow[] = [];
  const queue: Array<{ slug: string }> = d.children.map((c) => ({ slug: c }));
  const seen = new Set<string>([d.slug]);
  while (queue.length) {
    const { slug } = queue.shift()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const node = all.find((x) => x.slug === slug);
    if (!node) continue;
    out.push(node);
    for (const c of node.children) queue.push({ slug: c });
  }
  return out;
}

function buildAncestorChain(d: DistroRow, all: DistroRow[]): DistroRow[] {
  const chain: DistroRow[] = [];
  const seen = new Set<string>();
  let current: DistroRow | null = d;
  let safety = 0;
  while (current && safety++ < 32) {
    if (seen.has(current.slug)) break;
    seen.add(current.slug);
    if (current.slug !== d.slug) chain.push(current);
    if (!current.parents.length) break;
    const parentSlug: string = current.parents[0]!;
    const parent: DistroRow | undefined = all.find((x) => x.slug === parentSlug);
    if (!parent) break;
    current = parent;
  }
  return chain.reverse();
}

function shortestPath(
  from: DistroRow,
  to: DistroRow,
  all: DistroRow[],
): DistroRow[] | null {
  if (from.slug === to.slug) return [from];
  const bySlug = new Map(all.map((d) => [d.slug, d]));
  const visited = new Set<string>([from.slug]);
  const queue: Array<{ slug: string; path: DistroRow[] }> = [
    { slug: from.slug, path: [from] },
  ];
  while (queue.length) {
    const { slug, path } = queue.shift()!;
    const cur = bySlug.get(slug);
    if (!cur) continue;
    const neighbors: string[] = [...cur.parents, ...cur.children];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      const nNode = bySlug.get(n);
      if (!nNode) continue;
      const np = [...path, nNode];
      if (n === to.slug) return np;
      queue.push({ slug: n, path: np });
    }
  }
  return null;
}

function commonAncestor(
  a: DistroRow,
  b: DistroRow,
  all: DistroRow[],
): DistroRow | null {
  const aChain = [a, ...buildAncestorChain(a, all)];
  const bSet = new Set([b, ...buildAncestorChain(b, all)].map((d) => d.slug));
  for (const d of aChain) {
    if (bSet.has(d.slug)) return d;
  }
  return null;
}

function svgEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderOG(d: DistroRow): string {
  const W = 1200;
  const H = 630;
  const familyLabel = svgEscape(d.family.toUpperCase());
  const name = svgEscape(d.name);
  const desc = svgEscape(
    d.description.length > 220
      ? d.description.slice(0, 217) + '…'
      : d.description,
  );
  const accent = d.color || '#888';
  const status = d.status === 'Discontinued' ? 'Discontinued' : 'Active';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d1117"/>
      <stop offset="1" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="0" y="0" width="12" height="100%" fill="${accent}"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="#e6edf3">
    <text x="60" y="100" font-size="24" letter-spacing="3" fill="#8b949e">${familyLabel} FAMILY · ${status.toUpperCase()}</text>
    <text x="60" y="220" font-size="96" font-weight="700">${name}</text>
    <text x="60" y="320" font-size="32" fill="#cbd5e1">${desc}</text>
    <text x="60" y="560" font-size="20" letter-spacing="2" fill="#8b949e">DISTROMAP · LINUX DISTRIBUTION GRAPH</text>
    <text x="${W - 60}" y="560" text-anchor="end" font-size="20" letter-spacing="2" fill="#8b949e">distromap.app</text>
  </g>
  <g transform="translate(${W - 200}, 100)">
    <circle cx="80" cy="80" r="60" fill="${accent}" opacity="0.18"/>
    <circle cx="80" cy="80" r="60" fill="none" stroke="${accent}" stroke-width="3"/>
    <text x="80" y="92" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="42" fill="#e6edf3" font-weight="700">${svgEscape((d.name[0] || '?').toUpperCase())}</text>
  </g>
</svg>`;
}

// ── Read-side route handlers ──────────────────────────────────────────

async function handleHealth(res: VercelResponse): Promise<boolean> {
  let rows: SuggestionRow[];
  if (usingKV()) {
    rows = await kvReadAll();
  } else {
    rows = await withFileLock(() => fileReadAll());
  }
  const distros = await loadDistros();
  const families = new Set(distros.map((d) => d.family));
  const out = {
    ok: true,
    service: 'distromap',
    version: '2.0.0',
    suggestions: rows.length,
    mode: usingKV() ? 'kv' : 'file',
    distros: {
      count: distros.length,
      families: families.size,
      active: distros.filter((d) => d.status === 'Active').length,
      discontinued: distros.filter((d) => d.status === 'Discontinued').length,
    },
    endpoints: [
      '/api/health',
      '/api/distros',
      '/api/distros/:slug',
      '/api/search',
      '/api/families',
      '/api/family/:family',
      '/api/related/:slug',
      '/api/descendants/:slug',
      '/api/ancestors/:slug',
      '/api/path',
      '/api/compare',
      '/api/stats',
      '/api/random',
      '/api/graph',
      '/api/categories',
      '/api/og/:slug.svg',
      '/api/og/:slug.png',
      '/api/suggestions',
    ],
  };
  if (!usingKV()) (out as { file?: string }).file = SUGGESTIONS_FILE;
  sendJSON(res, 200, out, 0);
  return true;
}

async function handleListDistros(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const all = await loadDistros();
  const q = getQuery(req);
  let result = all;
  if (q.family) {
    result = result.filter((d) => d.family === q.family);
  }
  if (q.status) {
    result = result.filter(
      (d) => d.status.toLowerCase() === q.status.toLowerCase(),
    );
  }
  if (q.category) {
    const cat = q.category as CategoryFlag;
    if (CATEGORY_FLAGS.includes(cat)) {
      result = result.filter((d) => d[cat] === true);
    }
  }
  if (q.q) {
    const ql = q.q.toLowerCase();
    result = result.filter(
      (d) =>
        d.slug.includes(ql) ||
        d.name.toLowerCase().includes(ql) ||
        d.description.toLowerCase().includes(ql) ||
        d.family.includes(ql),
    );
  }
  if (q.arch) {
    result = result.filter((d) => d.architecture.includes(q.arch));
  }
  if (q.init) {
    result = result.filter(
      (d) => d.init_system.toLowerCase() === q.init.toLowerCase(),
    );
  }
  sendJSON(res, 200, { count: result.length, distros: result });
  return true;
}

async function handleGetDistro(
  slug: string,
  res: VercelResponse,
): Promise<boolean> {
  const d = await getBySlug(slug);
  if (!d) {
    sendNotFound(res, `no distro with slug "${slug}"`);
    return true;
  }
  sendJSON(res, 200, d);
  return true;
}

async function handleSearch(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const q = getQuery(req);
  const query = (q.q ?? '').trim();
  const limit = Math.max(1, Math.min(50, Number(q.limit) || 10));
  if (!query) {
    sendJSON(res, 200, { query, count: 0, results: [] });
    return true;
  }
  const all = await loadDistros();
  const scored = all
    .map((d) => ({ d, s: scoreMatch(d, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ d, s }) => ({
      slug: d.slug,
      name: d.name,
      family: d.family,
      status: d.status,
      description: d.description,
      score: s,
    }));
  sendJSON(res, 200, { query, count: scored.length, results: scored });
  return true;
}

async function handleFamilies(res: VercelResponse): Promise<boolean> {
  const all = await loadDistros();
  // For each family, identify the depth-1 record with the most direct
  // children — that's the "true" family root (Debian, Arch, etc.).
  // Tiebreaker: shortest slug, then lexicographic. Records whose
  // `family` field equals "linux_kernel" are deliberately excluded
  // because that's used as a placeholder for independent-from-scratch
  // distros (LFS, Puppy, etc.), not the actual Linux kernel.
  const childrenByParent = new Map<string, number>();
  for (const d of all) {
    if (d.parent) {
      childrenByParent.set(d.parent, (childrenByParent.get(d.parent) ?? 0) + 1);
    }
  }
  const m = new Map<
    string,
    { count: number; active: number; root: string | null; rootChildren: number }
  >();
  for (const d of all) {
    const entry = m.get(d.family) ?? {
      count: 0,
      active: 0,
      root: null,
      rootChildren: -1,
    };
    entry.count += 1;
    if (d.status === 'Active') entry.active += 1;
    if (d.depth === 1 && d.family !== 'linux_kernel') {
      const kids = childrenByParent.get(d.slug) ?? 0;
      if (
        entry.root === null ||
        kids > entry.rootChildren ||
        (kids === entry.rootChildren && d.slug.length < entry.root.length)
      ) {
        entry.root = d.slug;
        entry.rootChildren = kids;
      }
    }
    m.set(d.family, entry);
  }
  const out = Array.from(m.entries())
    .map(([family, info]) => {
      const { rootChildren: _rc, ...rest } = info;
      return { family, ...rest };
    })
    .sort((a, b) => b.count - a.count);
  sendJSON(res, 200, { count: out.length, families: out });
  return true;
}

async function handleFamily(
  family: string,
  res: VercelResponse,
): Promise<boolean> {
  const all = await loadDistros();
  const ql = family.toLowerCase();
  const matches = all.filter((d) => d.family.toLowerCase() === ql);
  if (!matches.length) {
    sendNotFound(res, `no family "${family}"`);
    return true;
  }
  const sorted = await Promise.all(
    matches.map(async (d) => ({ d, dep: await depthOf(d.slug) })),
  );
  sorted.sort((a, b) => a.dep - b.dep || a.d.slug.localeCompare(b.d.slug));
  sendJSON(res, 200, {
    family,
    count: sorted.length,
    distros: sorted.map((x) => x.d),
  });
  return true;
}

async function handleRelated(
  slug: string,
  res: VercelResponse,
): Promise<boolean> {
  const d = await getBySlug(slug);
  if (!d) {
    sendNotFound(res, `no distro with slug "${slug}"`);
    return true;
  }
  const all = await loadDistros();
  const related = all
    .filter((x) => x.family === d.family && x.slug !== d.slug)
    .map((x) => ({
      slug: x.slug,
      name: x.name,
      family: x.family,
      status: x.status,
      relationship: x.parents.includes(d.slug)
        ? 'descendant'
        : x.children.includes(d.slug)
          ? 'ancestor'
          : x.parents.some((p) => d.parents.includes(p))
            ? 'cousin'
            : 'same-family',
    }))
    .sort(
      (a, b) =>
        a.relationship.localeCompare(b.relationship) ||
        a.slug.localeCompare(b.slug),
    );
  sendJSON(res, 200, { slug, count: related.length, related });
  return true;
}

async function handleDescendants(
  slug: string,
  res: VercelResponse,
): Promise<boolean> {
  const d = await getBySlug(slug);
  if (!d) {
    sendNotFound(res, `no distro with slug "${slug}"`);
    return true;
  }
  const all = await loadDistros();
  const tree = buildChildTree(d, all);
  sendJSON(res, 200, { slug, count: tree.length, descendants: tree });
  return true;
}

async function handleAncestors(
  slug: string,
  res: VercelResponse,
): Promise<boolean> {
  const d = await getBySlug(slug);
  if (!d) {
    sendNotFound(res, `no distro with slug "${slug}"`);
    return true;
  }
  const all = await loadDistros();
  const chain = buildAncestorChain(d, all);
  sendJSON(res, 200, { slug, count: chain.length, ancestors: chain });
  return true;
}

async function handlePath(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const q = getQuery(req);
  if (!q.from || !q.to) {
    sendBadRequest(res, 'from and to required');
    return true;
  }
  const all = await loadDistros();
  const from = await getBySlug(q.from);
  const to = await getBySlug(q.to);
  if (!from) {
    sendNotFound(res, `no distro with slug "${q.from}"`);
    return true;
  }
  if (!to) {
    sendNotFound(res, `no distro with slug "${q.to}"`);
    return true;
  }
  const path = shortestPath(from, to, all);
  if (!path) {
    sendJSON(res, 200, { from: from.slug, to: to.slug, path: null, note: 'not connected in tree' });
    return true;
  }
  sendJSON(res, 200, { from: from.slug, to: to.slug, length: path.length, path });
  return true;
}

async function handleCompare(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const q = getQuery(req);
  if (!q.a || !q.b) {
    sendBadRequest(res, 'a and b required');
    return true;
  }
  const all = await loadDistros();
  const a = await getBySlug(q.a);
  const b = await getBySlug(q.b);
  if (!a) {
    sendNotFound(res, `no distro with slug "${q.a}"`);
    return true;
  }
  if (!b) {
    sendNotFound(res, `no distro with slug "${q.b}"`);
    return true;
  }
  const common = commonAncestor(a, b, all);
  const distance = shortestPath(a, b, all);
  sendJSON(res, 200, {
    a,
    b,
    common_ancestor: common,
    same_family: a.family === b.family,
    distance: distance ? distance.length - 1 : null,
    path: distance,
  });
  return true;
}

async function handleStats(res: VercelResponse): Promise<boolean> {
  const all = await loadDistros();
  const by: Record<string, Record<string, number>> = {
    family: {},
    status: {},
    release_model: {},
    package_manager: {},
    package_format: {},
    init_system: {},
    license: {},
    country: {},
  };
  for (const c of CATEGORY_FLAGS) by[c] = { true: 0, false: 0 };
  for (const d of all) {
    by.family[d.family] = (by.family[d.family] ?? 0) + 1;
    by.status[d.status] = (by.status[d.status] ?? 0) + 1;
    by.release_model[d.release_model] =
      (by.release_model[d.release_model] ?? 0) + 1;
    by.package_manager[d.package_manager] =
      (by.package_manager[d.package_manager] ?? 0) + 1;
    by.package_format[d.package_format] =
      (by.package_format[d.package_format] ?? 0) + 1;
    by.init_system[d.init_system] = (by.init_system[d.init_system] ?? 0) + 1;
    by.license[d.license] = (by.license[d.license] ?? 0) + 1;
    if (d.country) by.country[d.country] = (by.country[d.country] ?? 0) + 1;
    for (const c of CATEGORY_FLAGS) {
      by[c][d[c] ? 'true' : 'false'] += 1;
    }
  }
  sendJSON(res, 200, {
    total: all.length,
    active: all.filter((d) => d.status === 'Active').length,
    discontinued: all.filter((d) => d.status === 'Discontinued').length,
    families: Object.keys(by.family).length,
    by,
  });
  return true;
}

async function handleRandom(res: VercelResponse): Promise<boolean> {
  const all = await loadDistros();
  if (!all.length) {
    sendJSON(res, 200, { distro: null });
    return true;
  }
  const idx = Math.floor(Math.random() * all.length);
  sendJSON(res, 200, { distro: all[idx] }, 0);
  return true;
}

async function handleGraph(res: VercelResponse): Promise<boolean> {
  const g = await loadGraph();
  sendJSON(res, 200, g);
  return true;
}

async function handleCategories(res: VercelResponse): Promise<boolean> {
  const all = await loadDistros();
  const out: Array<{ key: string; count: number }> = [];
  for (const c of CATEGORY_FLAGS) {
    out.push({ key: c, count: all.filter((d) => d[c]).length });
  }
  sendJSON(res, 200, { count: out.length, categories: out });
  return true;
}

async function handleOG(
  slug: string,
  res: VercelResponse,
  ext: 'svg' | 'png',
): Promise<boolean> {
  const d = await getBySlug(slug);
  if (!d) {
    sendNotFound(res, `no distro with slug "${slug}"`);
    return true;
  }
  const svg = renderOG(d);
  if (ext === 'png') {
    // Many social networks still expect a .png URL. We serve the same
    // SVG bytes with a .png URL alias and tag the response with
    // X-Content-Fallback so any future generator (sharp, satori) can
    // transparently replace this with a real PNG.
    res.setHeader('X-Content-Fallback', 'svg-as-png');
  }
  sendSVG(res, 200, svg, 3600);
  return true;
}

// ── Suggestion route handlers ─────────────────────────────────────────

async function handleListSuggestions(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const query = getQuery(req);
  const rawLimit = Number(query.limit ?? 100);
  const limit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 100;
  if (limit < 1 || limit > 500) {
    sendBadRequest(res, 'limit must be 1..500');
    return true;
  }
  let rows: SuggestionRow[];
  if (usingKV()) {
    rows = await kvReadAll();
  } else {
    rows = await withFileLock(() => fileReadAll());
  }
  sendJSON(res, 200, rows.slice(-limit).reverse(), 0);
  return true;
}

async function handlePostSuggestion(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  let payload: SuggestionIn;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw || '{}');
  } catch {
    sendBadRequest(res, 'invalid JSON body');
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // CORS — dev defaults + Vercel preview/prod regex + env extras.
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const rawPath = req.url ?? '';
  const pathNoApi = rawPath.replace(/^\/api/, '');
  const p = pathNoApi === '' ? '/' : pathNoApi;
  const routePath = p.split('?')[0];

  try {
    // ── read-only routes ─────────────────────────────────────────
    if (req.method === 'GET' && routePath === '/health') {
      await handleHealth(res);
      return;
    }
    if (req.method === 'GET' && routePath === '/distros') {
      await handleListDistros(req, res);
      return;
    }
    if (req.method === 'GET' && routePath === '/search') {
      await handleSearch(req, res);
      return;
    }
    if (req.method === 'GET' && routePath === '/families') {
      await handleFamilies(res);
      return;
    }
    if (req.method === 'GET' && routePath === '/stats') {
      await handleStats(res);
      return;
    }
    if (req.method === 'GET' && routePath === '/random') {
      await handleRandom(res);
      return;
    }
    if (req.method === 'GET' && routePath === '/graph') {
      await handleGraph(res);
      return;
    }
    if (req.method === 'GET' && routePath === '/categories') {
      await handleCategories(res);
      return;
    }

    // Parametric routes.
    const distroMatch = routePath.match(/^\/distros\/([a-z0-9_-]+)$/);
    if (req.method === 'GET' && distroMatch) {
      await handleGetDistro(distroMatch[1], res);
      return;
    }
    const familyMatch = routePath.match(/^\/family\/([a-z0-9_-]+)$/);
    if (req.method === 'GET' && familyMatch) {
      await handleFamily(familyMatch[1], res);
      return;
    }
    const relatedMatch = routePath.match(/^\/related\/([a-z0-9_-]+)$/);
    if (req.method === 'GET' && relatedMatch) {
      await handleRelated(relatedMatch[1], res);
      return;
    }
    const descMatch = routePath.match(/^\/descendants\/([a-z0-9_-]+)$/);
    if (req.method === 'GET' && descMatch) {
      await handleDescendants(descMatch[1], res);
      return;
    }
    const ancMatch = routePath.match(/^\/ancestors\/([a-z0-9_-]+)$/);
    if (req.method === 'GET' && ancMatch) {
      await handleAncestors(ancMatch[1], res);
      return;
    }
    if (req.method === 'GET' && routePath === '/path') {
      await handlePath(req, res);
      return;
    }
    if (req.method === 'GET' && routePath === '/compare') {
      await handleCompare(req, res);
      return;
    }
    const ogSvgMatch = routePath.match(/^\/og\/([a-z0-9_-]+)\.svg$/);
    if (req.method === 'GET' && ogSvgMatch) {
      await handleOG(ogSvgMatch[1], res, 'svg');
      return;
    }
    const ogPngMatch = routePath.match(/^\/og\/([a-z0-9_-]+)\.png$/);
    if (req.method === 'GET' && ogPngMatch) {
      await handleOG(ogPngMatch[1], res, 'png');
      return;
    }

    // ── suggestion routes ────────────────────────────────────────
    if (req.method === 'GET' && routePath === '/suggestions') {
      await handleListSuggestions(req, res);
      return;
    }
    if (req.method === 'POST' && routePath === '/suggestions') {
      await handlePostSuggestion(req, res);
      return;
    }

    // Friendly root.
    if (req.method === 'GET' && routePath === '/') {
      sendJSON(res, 200, {
        service: 'DistroMap API',
        version: '2.0.0',
        see: '/api/health for the full endpoint list',
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
