/**
 * Client-side helpers for the "Add a distro" SuggestForm.
 *
 * The flow the user sees is:
 *   1. They type a Wikipedia title in the modal.
 *   2. validateWikidataTitle() hits the public Wikipedia REST API and
 *      returns the structured fields (qid, short_desc, extract, thumb).
 *   3. They click "Submit"; postSuggestion() tries the backend
 *      /api/suggestions first, and on network failure falls back to
 *      localStorage + a JSON download so the suggestion survives.
 *
 * The backend is a TypeScript serverless function at api/index.ts —
 * same stack as the frontend. In dev the Vite dev server serves it
 * in-process on the same port (no separate backend command); in prod
 * Vercel deploys it as a @vercel/node function at the same origin.
 *
 * The submission path is intentionally redundant — a missing/offline
 * API never blocks the user from contributing.
 */

import type { Suggestion, ValidationResult } from '@/types';

// In dev:    leave VITE_API_URL unset → same-origin /api/* is served
//            in-process by the Vite apiServerPlugin (vite.config.js).
// In prod:   leave VITE_API_URL unset → same-origin /api/* on Vercel,
//            rewritten to the @vercel/node function at api/index.ts.
// Set VITE_API_URL ONLY if the API lives on a different host.
// Trailing-slash normalization keeps `<API>/suggestions` valid even if
// the user supplies `.../api/` (with a trailing slash) by mistake.
const RAW_API_URL = (import.meta.env.VITE_API_URL ?? '').trim();
const BACKEND_URL =
  RAW_API_URL === ''
    ? '/api'
    : RAW_API_URL.endsWith('/')
      ? RAW_API_URL.slice(0, -1)
      : RAW_API_URL;
const LOCAL_KEY = 'distromap-suggestions';

const WIKI_HEADERS = { Accept: 'application/json' };

export async function validateWikidataTitle(title: string): Promise<ValidationResult> {
  const wp = title.trim().replace(/ /g, '_');
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wp)}`;
  const r = await fetch(url, { headers: WIKI_HEADERS });
  if (!r.ok) {
    throw new Error(`Wikipedia REST returned ${r.status} for "${title}"`);
  }
  const data: any = await r.json();
  // The REST endpoint exposes a lot; we only pick the fields the
  // build script and SuggestionIn model both know about.
  const extract: string = (data.extract ?? '').trim();
  // Use Wikipedia's wikibase_item (QID) directly; the pageid fallback
  // is only used when the REST endpoint doesn't expose wikibase_item
  // (some article types omit it). Writing `data.pageid ? \`Q${pageid}\` : null`
  // was a bug — see the precedence note in PR review; QID is what we want.
  const qid: string | null =
    (typeof data.wikibase_item === 'string' && data.wikibase_item.length > 0)
      ? data.wikibase_item
      : (typeof data.pageid === 'number' ? `Q${data.pageid}` : null);
  return {
    qid,
    short_desc: data.description ?? '',
    extract: extract.length > 1900 ? `${extract.slice(0, 1900)}…` : extract,
    thumbnail: data.thumbnail?.source ?? data.originalimage?.source ?? null,
    wiki_url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${wp}`,
    display: data.title ?? title,
  };
}

export async function postSuggestion(
  payload: Suggestion,
): Promise<{ ok: true; via: 'backend' | 'local'; id?: string } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${BACKEND_URL}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const j = (await r.json()) as { id: string };
      return { ok: true, via: 'backend', id: j.id };
    }
    // 409 is still a successful submit on the backend side; report it.
    if (r.status === 409) {
      const j = (await r.json().catch(() => ({}))) as { detail?: string };
      return { ok: false, error: j.detail ?? 'duplicate suggestion' };
    }
    throw new Error(`backend ${r.status}`);
  } catch (err) {
    // Network down / API not running → localStorage fallback.
    saveLocalSuggestion(payload);
    return { ok: true, via: 'local' };
  }
}

export function saveLocalSuggestion(payload: Suggestion): void {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const cur: Suggestion[] = raw ? (JSON.parse(raw) as Suggestion[]) : [];
    cur.push(payload);
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(cur));
  } catch {
    /* localStorage may be unavailable (private mode); download-only fallback handled below. */
  }
}

export function listLocalSuggestions(): Suggestion[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Suggestion[]) : [];
  } catch {
    return [];
  }
}

export function downloadSuggestion(payload: Suggestion): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `distromap-suggestion-${payload.slug}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function backendReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${BACKEND_URL}/health`, { method: 'GET' });
    return r.ok;
  } catch (err) {
    // Loud in dev console so the developer-DX case explains itself,
    // silent for end users (the badge already says "backend:offline").
    if (typeof console !== 'undefined') {
      console.warn(
        '[distromap] suggestion backend unreachable; falling back to localStorage + JSON download:',
        err instanceof Error ? err.message : String(err),
      );
    }
    return false;
  }
}
