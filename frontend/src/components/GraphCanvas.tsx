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
import type { Distro, DistroFlowNode, DistroFlowEdge } from '@/types';
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

  // Compute which nodes match the search, if any.
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

  // Polar layout — bounceable cache.
  const baseLayout = useMemo(() => buildLayout(distros), [distros]);

  // Decorate nodes with the current highlight / dim state.
  const nodes = useMemo<DistroFlowNode[]>(() => {
    return baseLayout.nodes.map((n) => {
      let highlighted: boolean;
      let dimmed: boolean;

      if (matching) {
        highlighted = matching.has(n.id);
        dimmed = !highlighted;
      } else if (selected || hovered) {
        const focus = selected ?? hovered;
        const isFocus = n.id === focus;
        const isAncestor =
          !isFocus && distros.some((d) => d.slug === n.id && d.parent === focus);
        const isDescendant =
          !isFocus && (focus === 'linux_kernel' || isAncestor); // family roots light up on hover of the kernel
        highlighted = isFocus || isAncestor || isDescendant || n.id === 'linux_kernel';
        dimmed = !highlighted;
      } else {
        highlighted = n.id === 'linux_kernel';
        dimmed = !highlighted;
      }

      return {
        ...n,
        data: { ...n.data, highlighted, dimmed },
      };
    });
  }, [baseLayout, selected, hovered, matching, distros]);

  // Decorate edges — selected-path edges become cyan + thicker.
  const edges = useMemo<DistroFlowEdge[]>(() => {
    return baseLayout.edges.map((e) => {
      const onPath = !!(selected && (e.source === selected || e.target === selected));
      return {
        ...e,
        className: onPath ? 'is-on-path' : 'flow',
        data: { onPath },
      };
    });
  }, [baseLayout, selected]);

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
          style={{ background: '#161b22' }}
        />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
