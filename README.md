# DistroMap

![DistroMap placeholder logo](assets/logo.svg)

A visual knowledge graph of the Linux ecosystem.

DistroMap maps Linux distributions and shows how they are connected —
starting from the **Linux kernel** and branching out into the major

distro families, then deeper into the distributions that descend from
each family. See [`docs/idea.md`](docs/idea.md) for the full product
brief and the planned interactive graph UI.

---

## Why

The Linux distrospace is sprawling (hundreds of active distributions,
several major families, lots of forking). When someone asks "what's
Fedora-based but isn't Fedora?", or "is Nobara an Arch or a Fedora
distro?", the answer is usually a long Wikipedia detour. DistroMap
keeps the relationships in one readable place, sourced automatically
from free public APIs so the data stays roughly in sync with reality.

---

## What ships in v0.1 (this repo)

- A tree of the most-asked-about Linux distros, with one folder per
  distribution
- A researched Markdown dossier for every distribution, auto-generated
  from a free API
- A reproducible data pipeline (cache + build) so the dossiers can be
  refreshed in under a minute
- A base README + design brief in `docs/`

What **doesn't** ship yet (Phase 1 from `docs/idea.md`): the
interactive circular graph itself. The content layer is ready; the
frontend is next.

---

## Repository layout

```
DistroMap/
├── README.md                       ← you are here
├── docs/
│   └── idea.md                     ← original product brief
├── assets/
│   └── logo.svg                    ← placeholder; replaced by Figma export when ready
├── distros/                        ← one folder per Linux distribution (the dossier)
├── frontend/                       ← Vite SPA + TS serverless API: React + TypeScript + Tailwind 3
│   ├── src/                        ← React app shell, components, layout
│   ├── public/logo.svg             ← Figma export
│   ├── api/
│   │   └── index.ts                ← suggestion API — @vercel/node function in prod,
│   │                                 served in-process by the Vite dev server in dev
│   │                                 (one `npm run dev`, one process, no Python venv)
│   ├── tsconfig.api.json           ← typechecks api/ with Node types (separate from src/)
│   ├── vercel.json                 ← framework: vite + @vercel/node + /api/(.*) → /api/index
│   └── vite.config.js              ← React SWC plugin + apiServerPlugin (serves /api/* in dev)
└── .cache/                         ← working data (NOT user content; safe to gitignore later)
    ├── fetch_distros.py            ← pulls from Wikipedia + Wikidata
    └── build_distro_files.py       ← emits distros/<slug>/<slug>.md + frontend/src/data/distros.json
```

---

## The distribution tree

These are the distros currently tracked. Folder slugs are the same as
the link targets; each slug is its own folder containing a single
`<slug>.md` dossier.

```
linux_kernel
├── debian
│   ├── ubuntu
│   │   ├── linux_mint
│   │   └── pop_os
├── arch
│   ├── manjaro
│   └── endeavouros
├── fedora
│   └── nobara
├── gentoo
└── slackware
```

The `Parent in DistroMap tree` row inside each dossier is a clickable
link, which means you can navigate the whole tree by following links.

> **Note on "Others":** Folding the full Linux distrospace into a single
> folder tree is unwieldy, so DistroMap v0.1 tracks the families listed
> in [`docs/idea.md`](docs/idea.md) (*Debian / Arch / Fedora / Gentoo /
> Slackware*) and treats everything underneath *Others* — Alpine,
> openSUSE, Void, NixOS, etc. — as out-of-scope for now. Adding more
> families is an explicit step in the contributing guide below.

---

## Distro dossier schema

Every `distros/<slug>/<slug>.md` file contains the same fields in the
same order, so any tooling can parse them predictably.

| Field                          | Source                                                           |
|---|---|
| Display name                   | Folder's title                                                   |
| Wikidata ID                    | `Q…` resolved via the Wikipedia `pageprops` endpoint             |
| Wikipedia URL                  | `https://en.wikipedia.org/wiki/<WikiTitle>`                      |
| Official website               | Wikidata claim **P856**                                         |
| Developer / maintainer         | Wikidata claim **P112** (resolved to its English label)         |
| First released                 | Wikidata claim **P571**, normalized via `precision`              |
| Based on (Wikidata P144)       | Wikidata claim **P144**; if the label wasn't resolvable, raw QID |
| Parent in DistroMap tree       | Manual mapping inside `.cache/fetch_distros.py`                 |
| Summary (long extract)         | Wikipedia REST API `extract` field                               |
| Logo / thumbnail               | Wikipedia REST API `thumbnail.source` field                      |
| Sources (citation block)       | Two URLs + CC-BY-SA note                                        |

Anyone writing a parser can rely on exactly this shape; the field order
is stable.

---

## Data sources

Every dossier is generated from two **free, no-key** Wikimedia APIs:

| API | Used for |
|---|---|
| **Wikipedia REST API** — `/page/summary/<title>` | short description, long summary extract, thumbnail/logo |
| **Wikidata SPARQL endpoint** — `/query.wikidata.org/sparql` | site-wide structured facts (QID lookup, label resolution, all entity facts) |
| **Wikidata entity endpoint** — `Special:EntityData/<QID>.json` | per-distro structured claims (website, developer, inception, based-on) |

All three are maintained by the Wikimedia Foundation, are free to use,
require no API key, and are licensed under CC-BY-SA 4.0. Exact URLs are
cited at the bottom of every dossier.

---

## Roadmap

- [x] **v0.1** — per-distro dossiers, fetch + build pipeline, this README
- [x] **v0.2** — apply reviewer flag — Nobelium/P110 + Last-regenerated fix
- [x] **v0.3** — interactive circular graph frontend (Vite + React + Vue + Tailwind)
- [x] **v0.4** — **manual overrides layer** (`.cache/api/manual_overrides.json`, shallow-merged at build time; `fetch_distros.py` prints a missing-field report that suggests what to put in the override file)
- [x] **v0.5** — **user-submitted "add a distro" flow** (TypeScript serverless function at `frontend/api/index.ts`, file-backed queue at `frontend/.cache/api/suggestions.json`; redundant in-browser fallback to `localStorage` + a downloadable JSON so suggestions survive when the API is offline. Originally FastAPI/Python in v0.5, rewritten in TypeScript so the whole stack is one language — no Python venv, one `npm install`)
- [x] **v0.6** — **popularity scoring** (Wikipedia pageviews over 30 days, log-transformed + quantile-binned into 1–5; raw signal exposed in the SidePanel). DistroWatch was originally listed as a co-signal, but their site actively blocks scripted traffic and the public ToS discourages scraping — pageviews-only ships in v0.6 and the scoring logger is structured so a second signal can be appended later without breaking the build script.

See `frontend/api/index.ts` (header comment) for the suggestion-API contract and `.cache/fetch_popularity.py` for the scoring details.

---

## Adding a new distro

1. Edit `.cache/fetch_distros.py` and add a row to `DISTROS`:

   ```python
   ("Display Name", "folder_slug", "Wikipedia_Title", "parent_slug"),
   ```

   Use `None` as the parent only for the root (the Linux kernel).

2. Run `python3 .cache/fetch_distros.py` to pull the new distro's data
   (≈ 0.4 s sleep between API calls — polite to public services).

3. Run `python3 .cache/build_distro_files.py` to re-render every
   dossier.

4. Update the ASCII tree in this README to include the new entry.

5. Commit the new folder + any auto-regenerated dossier changes.

---

## Refreshing all data

From the repo root:

```bash
python3 .cache/fetch_distros.py      # pulls fresh data from Wikipedia + Wikidata
python3 .cache/build_distro_files.py # writes distros/<slug>/<slug>.md +
                                    # frontend/src/data/distros.json
python3 .cache/fetch_popularity.py   # v0.6 — fetches pageview signals → popularity.json
python3 .cache/build_distro_files.py # re-run to merge popularity into distros.json
cd frontend && npm run dev           # → http://127.0.0.1:5173
                                    # (serves BOTH the SPA and the /api/* API
                                    #  in-process — no separate backend command)
```

> The SuggestForm falls back to `localStorage` + a JSON download if the
> API is ever offline. The form's badge shows "backend:live" vs
> "backend:offline (local+download)" so you always know the path. In dev,
> the API is always live (served by the Vite dev server itself).

Refreshing all twelve distros takes well under a minute. Raw
responses are cached under `.cache/api/` so you can diff the cache
before regenerating if you're curious what changed.

---

## Frontend

Phase 1 from [`docs/idea.md`](docs/idea.md) ships as a Vite SPA in the
`frontend/` folder:

| Choice | Why |
|---|---|
| **Vite 5** | Fast bundler, HMR for React |
| **React 18** | App shell, graph state, layout |
| **React Flow** (`@xyflow/react` v12) | Edges, zoom/pan, custom node types |
| **TypeScript 5** (strict) | Per-distro `Distro` type matches the JSON schema |
| **Tailwind CSS 3** | Dark theme, custom palette |

### Quick commands

```bash
cd frontend
npm install       # ~150 packages (frontend + API, one language)
npm run dev       # vite dev server on :5173 — serves the SPA AND /api/*
                   # in-process (apiServerPlugin loads api/index.ts via SSR).
                   # One command, one process, no Python venv.
npm run build     # tsc -b && vite build → frontend/dist/
npm run preview   # serve the production bundle
npm run typecheck # tsc -b --noEmit (frontend) + tsc -p tsconfig.api.json (API)
```

When you have finished the Figma logo export, drop it over both
`assets/logo.svg` and `frontend/public/logo.svg` (already used by the
header and the index.html favicon link).

---

## Deploying

DistroMap ships on **Vercel free tier**, full-stack, in **one** project
that has **`frontend/` as the Vercel project root directory**. The
suggestion API lives in the same directory tree as the SPA, so Vercel
auto-deploys both. No other accounts are required.

| Layer | Where it runs | Free-tier constraints |
|-------|---------------|----------------------|
| Static Vite SPA    | **Vercel** (`frontend/dist`) | 100 GB/mo bandwidth |
| Suggestion intake API | **Vercel Node function** (`frontend/api/index.ts`, `@vercel/node`) | 100 GB-hr/mo, 10s execution |
| Suggestion queue   | **Vercel KV** (Upstash Redis REST) | 256 MB, 30K commands/mo |

The SPA and the API share the same Vercel origin. The
`frontend/vercel.json` rewrite `/api/(.*) → /api/index` routes every
`/api/*` request to the single TypeScript serverless function, so no
CORS config is required for same-origin calls and the SuggestForm's
badge always reads **backend:live** when KV is linked.

### One-time setup

1. Pull the repo on GitHub, import it in Vercel's "Add New Project"
   flow. Set the **Project Root Directory** to **`frontend/`** in the
   "Build & Development Settings" step. Vercel reads
   `frontend/vercel.json` and knows the project is a Vite app with a
   Node.js (`@vercel/node`) serverless function.
2. From the project dashboard, open **Storage → Create Database → KV**.
   Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into
   the Production + Preview environments; the API picks them up on
   cold start and switches from file mode to KV mode automatically.
3. **File mode will 500 on production POSTs.** Vercel's serverless
   filesystem is read-only (only `/tmp` is writable); without the KV
   store linked, the very first POST to `/api/suggestions` will fail
   with a filesystem error. Link KV.

### Deploys

```bash
# from the repo root, with the Vercel project already configured
# (Frontend root directory = frontend/, KV linked)
vercel --prod                 # production deploy

# every PR / branch gets its own preview URL automatically
vercel                        # preview deploy
```

### Custom domain

`distromap.com` (or similar) just works — set it under
**Settings → Domains**. Same Vercel deployment, same KV store, no
extra config. The `ALLOWED_ORIGINS` env var (comma-separated) lets
you extend the CORS allowlist beyond the default `*.vercel.app`
regex; add your custom domain here on the backend.

### Locally simulating deploy

```bash
cd frontend
npm run dev      # Vite on :5173 — serves the SPA AND /api/* in-process
                 # (no separate backend, no second port, no Python)
```

Without KV env vars the API uses the local
`frontend/.cache/api/suggestions.json` path (file mode) with a
promise-chain mutex around read-modify-write so concurrent POSTs
don't lose rows. Once you set `KV_REST_API_URL` +
`KV_REST_API_TOKEN` (e.g. via a `.env` file) and restart `npm run dev`,
the same API switches to KV mode without code changes.

### Why a single TypeScript function at `frontend/api/index.ts`?

Keeping the whole API in one file means there's exactly one Vercel
serverless function at `/api` (and the rewrite rule
`/api/(.*) → /api/index` covers every suggestion API path), with no
dead endpoints. The same file runs unchanged in local dev — the
`apiServerPlugin` in `vite.config.js` loads it via Vite's SSR module
graph (`server.ssrLoadModule`) and calls its default export directly
against the dev server's req/res. One command (`npm run dev`), one
process, one port, one language.

### Why not just stick the backend on Fly.io?

Vercel KV at 30K commands/mo + 256 MB covers a maintainer-only
queue forever. Paying for a second host was overkill for a
public-website intake form.

---

## Current coverage & known gaps

The v0.1 data pipeline covers everything from `idea.md`'s example tree.
Real-world Wikidata coverage has gaps, which is reflected honestly in
the dossiers:

| Topic | Status | Notes |
|---|---|---|
| Parent distribution links inside DistroMap | ✅ Always shown | Manual mapping, not from Wikidata |
| Short description + long extract | ✅ Always shown | From Wikipedia REST |
| Official website | ✅ 12/12 | From Wikidata P856 |
| First released date | ✅ 12/12 | Normalized to `YYYY` or `YYYY-MM-DD` |
| Developer / maintainer | ⚠️ Missing on some rows | Some distros (e.g. Pop!_OS, Nobara) lack the Wikidata P112 claim entirely |
| Short description | ⚠️ Sometimes thin | A few dossiers (e.g. Nobara) end up with the boilerplate "Linux distribution" because the Wikipedia description is generic |
| Based-on link (Wikidata P144) | ⚠️ Some render as raw QIDs | If the parent item has no English label, the script keeps the raw QID instead of dropping the row |

These gaps are **data** gaps, not pipeline gaps — they reflect what's
actually on Wikidata. They'll shrink over time as the Wikipedia and
Wikidata communities curate the entries; in the meantime, a small
manual override layer (read from `.cache/manual_overrides.json`) can
fill specific missing fields without touching the auto-generated
content.

---

## Branding

The logo is the Figma export for **"Create logo for distroMap"** —
560 × 130 wide-aspect-ratio wordmark designed for *dark* backgrounds.

The SVG is installed in two places so the README *and* the running
frontend share the same asset:

- `assets/logo.svg` (referenced by this README and useful in any
  later social-card / OG-image tools)
- `frontend/public/logo.svg` (served verbatim by Vite at `/logo.svg`,
  consumed by `Header.jsx` and the favicon link in `index.html`)

### Design choices baked in

- **Palette:** `#0d1117` (badge fill) on near-black / `#e6edf3` wordmark
  in soft white + `#58a6ff` accent on "**Map**" — reads cleanly on
  dark UI, would lose contrast on white.
- **Glyphs:** tiny outlined distro icons (Arch/Ubuntu/Debian/Fedora/
  NixOS/Linux Mint) arranged around a tux-penguin badge, designed to
  evoke the distrospace without dominating the wordmark.
- **Aspect:** 560 × 130; consumer code uses `w-auto` so it scales
  side-by-side with the title text in the header.

### When the Figma design evolves

1. Re-export from the Figma design
   ([link](https://www.figma.com/design/c5aE74Oiy5qzcjpZBfSm4P/Create-logo-for-distroMap)).
2. Drop the new SVG over both `assets/logo.svg` *and*
   `frontend/public/logo.svg` (same filename, same width ≈ 560 px).
3. If the aspect ratio changes by a wide margin, adjust the
   `className="h-9 w-auto"` in `Header.jsx` so the chrome still
   matches.
4. If chart readability and access is needed, drop a light-bg variant
   alongside (`assets/logo-light.svg`) and switch consumers in light
   theme.

---

## License

- **Code** (the scripts in `.cache/`, the asset pipeline, any future
  frontend) is MIT-licensed. See [`LICENSE-MIT`](LICENSE-MIT) once it
  is added (or treat the MIT license text in the scripts' headers as
  authoritative in the meantime).
- **Content** (`docs/idea.md`, this README, every `distros/<slug>/<slug>.md`)
  is derived from Wikipedia + Wikidata, both licensed under
  **CC-BY-SA 4.0**, so the content inherits that license:
  > If you remix the dossiers and publish them, you must attribute
  > Wikipedia and Wikidata, indicate any changes, and license your
  > derivative under CC-BY-SA 4.0.

---

## Acknowledgements

- **Wikipedia** + **Wikidata** — for the entire data layer
- The **DistroWatch** community for ongoing popularity observation
- **System76** for Pop!_OS, **Canonical** for Ubuntu, **Red Hat** for
  Fedora, and every distro maintainer who ships the thing that's
  actually fun to graph

---

_Maintainer: @Lihan. Last regenerated: 2026-07-19 (refresh the dossiers
any time with `python3 .cache/fetch_distros.py && python3 .cache/build_distro_files.py`)._
