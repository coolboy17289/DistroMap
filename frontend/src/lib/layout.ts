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
 * For 500+ nodes, the runtime algorithm collapses very wide parents
 * onto a single point. We mitigate by:
 *   1. Capping the visual depth at 4 (still showing all distros, but
 *      rings beyond depth 4 stack as additional offsets rather than
 *      additional radii).
 *   2. Auto-thinning the per-sibling angular step when a parent has
 *      more than N children (TAU/N stays in the bounds).
 *   3. Sorting children deterministically by slug so the layout is
 *      stable across re-renders.
 *
 * Returns: nodes + edges ready for React Flow.
 */

const MAX_RENDER_DEPTH = 4;

const RADIUS_BY_DEPTH: Record<number, number> = {
  0: 0,
  1: 240,
  2: 460,
  3: 660,
  4: 860,
};

// Minimum angular step in radians. Below this, we space children on
// the ring at TAU/2π minimum so they don't overlap visually.
const MIN_STEP_RAD = (Math.PI * 2) / 240; // ~1.5°

const TAU = Math.PI * 2;

function visualDepth(d: Distro): number {
  // Cap depth at MAX_RENDER_DEPTH — but record the original so it
  // can still be inspected via the data shape.
  return Math.min(d.depth ?? 0, MAX_RENDER_DEPTH);
}

export function buildLayout(distros: Distro[]): GraphLayout {
  const bySlug = new Map(distros.map((d) => [d.slug, d]));
  const parent = new Map<string, string | null>(
    distros.map((d) => [d.slug, d.parent]),
  );
  const childrenOf = new Map<string | null, Distro[]>();
  const childrenByParent: Map<string, string[]> = new Map();
  for (const d of distros) {
    const k = parent.get(d.slug) ?? null;
    if (!childrenOf.has(k)) childrenOf.set(k, []);
    childrenOf.get(k)!.push(d);
    if (d.parent) {
      const list = childrenByParent.get(d.parent) ?? [];
      list.push(d.slug);
      childrenByParent.set(d.parent, list);
    }
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  const angles = new Map<string, number>();
  const roots = childrenOf.get(null) ?? [];
  const startAngle = -Math.PI / 2;
  roots.forEach((r, i) => {
    const a = startAngle + (i / Math.max(roots.length, 1)) * TAU;
    angles.set(r.slug, a);
  });

  function recurse(parentSlug: string) {
    const kids = childrenOf.get(parentSlug) ?? [];
    if (kids.length === 0) return;
    const parentAngle = angles.get(parentSlug) ?? 0;
    const stepRad = Math.max(MIN_STEP_RAD, TAU / Math.max(kids.length * 1.5, 24));
    const spread = (kids.length - 1) * stepRad;
    kids.forEach((k, i) => {
      const offset = (i - (kids.length - 1) / 2) * stepRad;
      let a = parentAngle + offset;
      // Normalise to [-π, π]
      while (a > Math.PI) a -= TAU;
      while (a < -Math.PI) a += TAU;
      angles.set(k.slug, a);
      recurse(k.slug);
    });
  }
  for (const r of roots) recurse(r.slug);

  const nodes: DistroFlowNode[] = distros.map((d) => {
    const dp = visualDepth(d);
    const ang = angles.get(d.slug) ?? 0;
    const r = RADIUS_BY_DEPTH[dp] ?? 0;
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

  const nonKernelFamilyRoots = nodes.filter(
    (n) => (n.data.distro.depth ?? 0) === 1,
  );

  return { nodes, edges, childrenByParent, nonKernelFamilyRoots };
}
