import type { Distro, DistroFlowNode, DistroFlowEdge, GraphLayout } from '@/types';

/**
 * Polar-coordinate layout for a Linux distro tree.
 *
 * Rules:
 *   - depth 0 (the kernel) sits at the centre
 *   - depth 1 (family roots) are spaced evenly around the full circle
 *   - depth 2/3 leaves cluster around their parent's angle
 *   - sibling leaves share an even slice around the parent
 *
 * The returned `nodes` use the React Flow `position` field so they're
 * ready to be fed straight into <ReactFlow nodes={...} />.
 */

const RADIUS_BY_DEPTH: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 220,
  2: 380,
  3: 540,
};

// Per-child angular spacing (degrees) by depth — gets tighter the
// deeper we go so we don't end up with arcs that overlap.
const STEP_DEG_BY_DEPTH: Record<1 | 2 | 3, number> = {
  1: 0,
  2: 28,
  3: 16,
};

const TAU = Math.PI * 2;

export function buildLayout(distros: Distro[]): GraphLayout {
  const parent = new Map<string, string | null>(distros.map((d) => [d.slug, d.parent]));
  const childrenOf = new Map<string | null, Distro[]>();
  for (const d of distros) {
    const k = parent.get(d.slug) ?? null;
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k)!.push(d);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  // depth via parent-chain walk
  const depth = new Map<string, 0 | 1 | 2 | 3>();
  for (const d of distros) {
    let dp = 0;
    let cur: string | null = d.slug;
    while (parent.get(cur ?? '') ?? null) {
      dp += 1;
      cur = parent.get(cur ?? '');
      if (dp > 16) break; // cycle guard
    }
    depth.set(d.slug, Math.min(dp, 3) as 0 | 1 | 2 | 3);
  }

  // angles — roots spread evenly across the top arc, children cluster
  const angles = new Map<string, number>();
  const roots = childrenOf.get(null) ?? [];
  const startAngle = -Math.PI / 2; // top
  roots.forEach((r, i) => {
    const a = startAngle + (i / Math.max(roots.length, 1)) * TAU;
    angles.set(r.slug, a);
  });

  function recurse(parentSlug: string) {
    const kids = childrenOf.get(parentSlug) ?? [];
    if (kids.length === 0) return;
    const parentAngle = angles.get(parentSlug) ?? 0;
    const dp = depth.get(parentSlug) ?? 1;
    const stepRad = ((STEP_DEG_BY_DEPTH[dp as 1 | 2 | 3] ?? 24) * Math.PI) / 180;
    kids.forEach((k, i) => {
      const offset = (i - (kids.length - 1) / 2) * stepRad;
      angles.set(k.slug, parentAngle + offset);
      recurse(k.slug);
    });
  }
  for (const r of roots) recurse(r.slug);

  const nodes: DistroFlowNode[] = distros.map((d) => {
    const dp = depth.get(d.slug) ?? 0;
    const ang = angles.get(d.slug) ?? 0;
    const r = RADIUS_BY_DEPTH[dp];
    return {
      id: d.slug,
      type: 'distro',
      position: { x: Math.cos(ang) * r, y: Math.sin(ang) * r },
      data: {
        distro: d,
        highlighted: false,
        dimmed: false,
      },
    };
  });

  const edges: DistroFlowEdge[] = distros
    .filter((d) => d.parent)
    .map((d) => ({
      id: `${d.parent}->${d.slug}`,
      source: d.parent as string,
      target: d.slug,
      type: 'smoothstep',
      className: 'flow',
      data: { onPath: false },
    }));

  const nonKernelFamilyRoots = nodes.filter((n) => n.data.distro.depth === 1);

  return { nodes, edges, nonKernelFamilyRoots };
}
