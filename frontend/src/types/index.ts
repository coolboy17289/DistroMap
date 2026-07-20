import type { Node, Edge } from '@xyflow/react';

/* ── Family taxonomy ────────────────────────────────────────────────────
 * `family` is no longer a closed 6-value union — it can be any
 * lowercase ascii slug for the family root. The values below are the
 * ones the data file actually uses; the type stays a string so new
 * families don't force a type recompile.
 */
export type DistroFamily = string;

export type Popularity = 1 | 2 | 3 | 4 | 5;

/** True when the distro is currently maintained. */
export type DistroStatus = 'Active' | 'Discontinued';

/* ── Core distro record ──────────────────────────────────────────────
 * Every field below is *also* present in the `distros.json` data file
 * except for `children` and `parents`, which are derived at build
 * time. The frontend reads everything from this one shape.
 */
export interface Distro {
  /* Identity + display */
  id: string;
  slug: string;
  name: string;
  display: string;            // human-readable name (alias of `name` for legacy compat)
  family: DistroFamily;
  parents: string[];          // every parent slug this distro descends from
  /** The primary parent used by the layout. Falls back to parents[0]. */
  parent: string | null;
  /** Pre-computed list of direct child slugs (filled in by synthesis). */
  children: string[];
  /** BFS distance from linux_kernel. Filled in by synthesis. */
  depth: number;

  /* Lineage + meta */
  based_on: string | null;    // e.g. "Ubuntu", "Debian", "Independent"
  kernel_root: 'Linux Kernel';

  /* Release timeline */
  first_release: string | null;   // "YYYY" or "YYYY-MM"
  latest_release: string | null;  // freeform — "22.2 (Zara)", "2026-03"
  status: DistroStatus;
  discontinued_year: number | null;
  release_model: string;          // "Point release", "Rolling release", "Immutable", etc.

  /* Package + system */
  package_manager: string;
  package_format: string;         // "deb", "rpm", "pkg.tar.xz", "apk", etc.
  init_system: string;            // "systemd", "OpenRC", "runit", "s6", "dinit", etc.
  architecture: string[];         // ["x86_64", "aarch64", ...]

  /* Defaults */
  desktop_defaults: string[];     // ["GNOME", "KDE Plasma", ...]

  /* Provenance */
  license: string;
  website: string | null;
  source_code: string | null;
  description: string;
  logo: string | null;            // SVG/PNG URL — Wikipedia or favicon
  color: string;                  // brand hex, used for node tint
  country: string | null;
  developer: string | null;
  maintainer: string | null;

  /* Boolean category flags */
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

  /* Legacy fields — kept so the old components (SidePanel, GraphCanvas)
   * still typecheck. Newer fields are added above; older keys stay
   * below and are populated by the build script from the same data. */
  qid: string | null;
  short_desc: string;
  extract: string;
  thumbnail: string | null;
  favicon_url: string | null;
  wiki_url: string;
  official_website: string | null;
  developer_legacy?: string | null;   // alias of `developer` (legacy key)
  inception: string | null;           // legacy alias of first_release
  based_on_label: string | null;      // legacy alias of based_on
  release_model_legacy?: string;      // legacy alias of release_model
  package_manager_legacy?: string;    // legacy alias of package_manager
  popularity: Popularity;
  popularity_signals: PopularitySignals | null;
  desktop_environments: string[];     // legacy alias of desktop_defaults
  markdown?: string;                  // optional pre-rendered dossier
}

export interface PopularitySignals {
  pageviews_30d: number;
  source: 'wikipedia-pageviews' | '';
  fetched_at: string;
}

/* ── React Flow custom node/edge types ───────────────────────────────── */

export interface DistroNodeData extends Record<string, unknown> {
  distro: Distro;
  highlighted: boolean;
  dimmed: boolean;
}

export type DistroFlowNode = Node<DistroNodeData, 'distro'>;

export interface DistroEdgeData extends Record<string, unknown> {
  onPath: boolean;
}

export type DistroFlowEdge = Edge<DistroEdgeData>;

/* ── Layout function return type ─────────────────────────────────── */

export interface GraphLayout {
  nodes: DistroFlowNode[];
  edges: DistroFlowEdge[];
  /** parent-slug → list of direct child slugs. O(1) child lookups. */
  childrenByParent: Map<string, string[]>;
  /** Family roots (depth 1) only — handy for legend / stats. */
  nonKernelFamilyRoots: DistroFlowNode[];
}

/* ── v0.5 — User-submitted suggestions ─────────────────────────── */

export interface ValidationResult {
  qid: string | null;
  short_desc: string;
  extract: string;
  thumbnail: string | null;
  wiki_url: string;
  display: string;
}

export interface Suggestion {
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

/* ── Graph.json (frontend/src/data/graph.json) ─────────────────────── */

export interface GraphNode {
  id: string;
  name: string;
  family: DistroFamily;
  depth: number;
  status: DistroStatus;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphFile {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/* ── Precomputed layout (frontend/src/data/layout.json) ─────────────── */

export interface LayoutFile {
  positions: Record<string, { x: number; y: number }>;
}
