import type { Node, Edge } from '@xyflow/react';

export type DistroFamily =
  | 'kernel'
  | 'debian'
  | 'arch'
  | 'fedora'
  | 'gentoo'
  | 'slackware';

export type Popularity = 1 | 2 | 3 | 4 | 5;

/**
 * One distro record. Mirrors the schema produced by
 * .cache/api/all.json + .cache/api/manual_overrides.json
 * + .cache/api/popularity.json (the build script merges them all).
 */
export interface Distro {
  slug: string;
  display: string;
  parent: string | null;
  depth: 0 | 1 | 2 | 3;
  family: DistroFamily;
  qid: string | null;

  short_desc: string;
  extract: string;
  thumbnail: string | null;
  /** Resolved via Google Favicon Service from `official_website`. */
  favicon_url: string | null;
  wiki_url: string;

  official_website: string | null;
  developer: string | null;
  inception: string | null;
  based_on_label: string | null;

  release_model: string;
  package_manager: string;
  desktop_environments: string[];

  /** 1-5 score; v0.6 derives this from Wikipedia-pageview signal. */
  popularity: Popularity;

  /** v0.6 — raw signal backing the score, null when popularity wasn't  */
  /** derivable (e.g. fetch never ran for this slug).                  */
  popularity_signals: PopularitySignals | null;
}

export interface PopularitySignals {
  /** Average daily views over the trailing 30-day window, or 0 if missing. */
  pageviews_30d: number;
  /** The build script writes an empty source string if the API returned no data. */
  source: 'wikipedia-pageviews' | '';
  /** ISO date the signal was fetched. */
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
