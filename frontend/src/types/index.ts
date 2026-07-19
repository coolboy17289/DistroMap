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
 * .cache/build_distro_files.py frontend_payload().
 */
export interface Distro {
  slug: string;
  display: string;
  parent: string | null;
  depth: 0 | 1 | 2 | 3;
  family: DistroFamily;
  accent: string;
  qid: string | null;

  short_desc: string;
  extract: string;
  thumbnail: string | null;
  wiki_url: string;

  official_website: string | null;
  developer: string | null;
  inception: string | null;
  based_on_label: string | null;

  release_model: string;
  package_manager: string;
  desktop_environments: string[];
  popularity: Popularity;
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
