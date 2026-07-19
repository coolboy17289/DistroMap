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

  // Selected-path edges become cyan; others stay neutral.
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
        minZoom={0.4}
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
