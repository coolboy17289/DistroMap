import { useCallback, useMemo, useState } from 'react';
import { ReactFlow, Controls, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { buildLayout } from '@/lib/layout';
import type {
  Distro,
  DistroFlowEdge,
  DistroFlowNode,
} from '@/types';
import DistroNode from './DistroNode';

interface GraphCanvasProps {
  distros: Distro[];
  query: string;
  selected: string | null;
  onSelect: (slug: string | null) => void;
}

const NODE_TYPES = { distro: DistroNode } as const;

const CATEGORY_KEYS = [
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

/**
 * Parse a free-text query like "server debian rolling" or
 * "family:arch status:discontinued rolling".
 *
 * Recognised tokens:
 *   - `key:value` where key ∈ {family, status, parent, cat, package,
 *     init, arch, country, dev, license}
 *   - bare words match display / slug / short_desc / family / country
 *
 * Tokens are AND-ed; a record matches when ALL tokens match.
 */
interface ParsedQuery {
  filters: Record<string, string>;
  terms: string[];
}

function parseQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = { filters: {}, terms: [] };
  for (const tok of raw.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([a-z]+):(.+)$/);
    if (m && m[2].length) {
      out.filters[m[1]] = m[2];
    } else {
      out.terms.push(tok);
    }
  }
  return out;
}

function matchesParsed(d: Distro, q: ParsedQuery): boolean {
  for (const [k, v] of Object.entries(q.filters)) {
    if (k === 'family' && d.family !== v) return false;
    if (k === 'status' && d.status.toLowerCase() !== v) return false;
    if (k === 'parent' && !(d.parents ?? []).includes(v) && d.parent !== v) return false;
    if (k === 'package' && d.package_manager.toLowerCase() !== v) return false;
    if (k === 'init' && d.init_system.toLowerCase() !== v) return false;
    if (k === 'arch' && !(d.architecture ?? []).map((a) => a.toLowerCase()).includes(v)) return false;
    if (k === 'country' && (d.country ?? '').toLowerCase() !== v) return false;
    if (k === 'dev' && (d.developer ?? '').toLowerCase() !== v) return false;
    if (k === 'license' && d.license.toLowerCase() !== v) return false;
    if (k === 'cat' && !CATEGORY_KEYS.includes(v as (typeof CATEGORY_KEYS)[number])) {
      return false;
    }
    if (CATEGORY_KEYS.includes(k as (typeof CATEGORY_KEYS)[number])) {
      if (!d[k as (typeof CATEGORY_KEYS)[number]]) return false;
    }
  }
  for (const t of q.terms) {
    const ok =
      d.display.toLowerCase().includes(t) ||
      d.slug.toLowerCase().includes(t) ||
      (d.short_desc ?? '').toLowerCase().includes(t) ||
      d.family.toLowerCase().includes(t) ||
      (d.description ?? '').toLowerCase().includes(t) ||
      (d.country ?? '').toLowerCase().includes(t) ||
      (d.developer ?? '').toLowerCase().includes(t) ||
      d.package_manager.toLowerCase().includes(t) ||
      (d.desktop_defaults ?? []).some((de) => de.toLowerCase().includes(t)) ||
      (d.architecture ?? []).some((a) => a.toLowerCase().includes(t)) ||
      CATEGORY_KEYS.includes(t as (typeof CATEGORY_KEYS)[number])
        ? d[t as (typeof CATEGORY_KEYS)[number]]
        : false;
    if (!ok) return false;
  }
  return true;
}

export default function GraphCanvas({
  distros,
  query,
  selected,
  onSelect,
}: GraphCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const trimmed = query.trim().toLowerCase();

  // Which nodes match the search/filter, if any — null when query is empty.
  const matching = useMemo(() => {
    if (!trimmed) return null;
    const q = parseQuery(query);
    const set = new Set<string>();
    for (const d of distros) {
      if (matchesParsed(d, q)) set.add(d.slug);
    }
    return set;
  }, [trimmed, query, distros]);

  const layout = useMemo(() => buildLayout(distros), [distros]);

  // Decoration pass — O(N + M) thanks to childrenByParent's map lookup.
  const nodes = useMemo<DistroFlowNode[]>(() => {
    const focus = selected ?? hovered;
    return layout.nodes.map((n) => {
      let highlighted: boolean;
      let dimmed: boolean;

      if (matching) {
        highlighted = matching.has(n.id);
        dimmed = !highlighted;
      } else if (focus) {
        const isFocus = n.id === focus;
        const isDirectChild =
          !isFocus &&
          (layout.childrenByParent.get(focus)?.includes(n.id) ?? false);
        highlighted = isFocus || isDirectChild;
        dimmed = !highlighted;
      } else {
        highlighted = n.id === 'linux_kernel';
        dimmed = !highlighted;
      }
      return { ...n, data: { ...n.data, highlighted, dimmed } };
    });
  }, [layout, selected, hovered, matching]);

  // Selected-path edges become white; others stay neutral.
  const edges = useMemo<DistroFlowEdge[]>(() => {
    return layout.edges.map((e) => {
      const onPath = !!(selected && (e.source === selected || e.target === selected));
      return {
        ...e,
        className: onPath ? 'is-on-path' : '',
        data: { onPath },
      };
    });
  }, [layout, selected]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => onSelect(node.id),
    [onSelect],
  );
  const onNodeEnter: NodeMouseHandler = useCallback(
    (_e, node) => setHovered(node.id),
    [],
  );
  const onNodeLeave: NodeMouseHandler = useCallback(() => setHovered(null), []);
  const onPaneClick = useCallback(() => onSelect(null), [onSelect]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={onNodeLeave}
        onPaneClick={onPaneClick}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
