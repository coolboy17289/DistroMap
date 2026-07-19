import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
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

export default function GraphCanvas({
  distros,
  query,
  selected,
  onSelect,
}: GraphCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const trimmed = query.trim().toLowerCase();

  // Which nodes match the search, if any — null when query is empty.
  const matching = useMemo(() => {
    if (!trimmed) return null;
    const set = new Set<string>();
    for (const d of distros) {
      if (
        d.display.toLowerCase().includes(trimmed) ||
        d.short_desc.toLowerCase().includes(trimmed) ||
        d.family.includes(trimmed)
      ) {
        set.add(d.slug);
      }
    }
    return set;
  }, [trimmed, distros]);

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
        // isFocus covers the distro itself; isDirectChild covers its immediate
        // descendants (so when focus is the kernel, all family roots light up;
        // when focus is Debian, Ubuntu + Linux Mint light up). No need for
        // dedicated "kernel is always highlighted" clauses.
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

  // Selected-path edges become cyan + thicker; others get the slow flow dash.
  const edges = useMemo<DistroFlowEdge[]>(() => {
    return layout.edges.map((e) => {
      const onPath = !!(selected && (e.source === selected || e.target === selected));
      return {
        ...e,
        className: onPath ? 'is-on-path' : 'flow',
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

  // MiniMap nodeColor — opt in to per-distro accents.
  const nodeColor = useCallback(
    (n: DistroFlowNode) => {
      const accent = n.data?.distro?.accent as string | undefined;
      return typeof accent === 'string' ? accent : '#22d3ee';
    },
    [],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
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
        <Background gap={32} size={1} color="#21262d" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(13, 17, 23, 0.7)"
          nodeColor={nodeColor}
          style={{ background: '#161b22' }}
        />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
