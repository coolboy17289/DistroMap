import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react';
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

type CategoryKey = (typeof CATEGORY_KEYS)[number];

function isCategoryKey(value: string): value is CategoryKey {
  return (CATEGORY_KEYS as readonly string[]).includes(value);
}

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
  for (const [key, value] of Object.entries(q.filters)) {
    switch (key) {
      case 'family':
        if (d.family.toLowerCase() !== value) return false;
        break;
      case 'status':
        if (d.status.toLowerCase() !== value) return false;
        break;
      case 'parent':
        if (!d.parents.includes(value) && d.parent !== value) return false;
        break;
      case 'package':
        if (!d.package_manager.toLowerCase().includes(value)) return false;
        break;
      case 'init':
        if (!d.init_system.toLowerCase().includes(value)) return false;
        break;
      case 'arch':
        if (!d.architecture.some((arch) => arch.toLowerCase().includes(value))) {
          return false;
        }
        break;
      case 'country':
        if (!(d.country ?? '').toLowerCase().includes(value)) return false;
        break;
      case 'dev':
        if (!(d.developer ?? '').toLowerCase().includes(value)) return false;
        break;
      case 'license':
        if (!d.license.toLowerCase().includes(value)) return false;
        break;
      case 'cat':
        if (!isCategoryKey(value) || !d[value]) return false;
        break;
      default:
        return false;
    }
  }

  for (const term of q.terms) {
    const matchesText = [
      d.display,
      d.slug,
      d.short_desc,
      d.family,
      d.description,
      d.country ?? '',
      d.developer ?? '',
      d.package_manager,
      d.init_system,
      d.release_model,
      ...d.desktop_defaults,
      ...d.architecture,
    ].some((value) => value.toLowerCase().includes(term));
    const matchesCategory = isCategoryKey(term) && d[term];

    if (!matchesText && !matchesCategory) return false;
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

  // When the search/filter changes, re-fit the view to the highlighted
  // nodes so the user doesn't have to pan/zoom manually.
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!trimmed) return;
    const ids = nodes.filter((n) => n.data.highlighted).map((n) => n.id);
    if (ids.length === 0) return;
    // Defer one frame so ReactFlow has mounted the updated nodes.
    const t = window.setTimeout(() => {
      try {
        fitView({ nodes: ids.map((id) => ({ id })), padding: 0.25, duration: 350 });
      } catch {
        // Fallback: fit the whole canvas
        fitView({ padding: 0.3, duration: 350 });
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, [trimmed, nodes, fitView]);

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
        {trimmed && (
          <div
            className="absolute top-3 left-3 z-20 px-2.5 py-1 rounded border
                       border-panel-border bg-bg/80 backdrop-blur-sm
                       font-mono text-[11px] text-ink-400"
          >
            <span className="text-ink-50">
              {nodes.filter((n) => n.data.highlighted).length}
            </span>
            <span className="text-ink-500"> of </span>
            <span className="text-ink-400">{distros.length}</span>
            <span className="ml-1.5 text-ink-500">match</span>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}
