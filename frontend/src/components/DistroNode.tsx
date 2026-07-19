import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DistroFlowNode } from '@/types';

const RADIUS_BY_DEPTH: Record<number, number> = { 0: 52, 1: 30, 2: 22, 3: 16 };

function DistroNodeComponent({ data }: NodeProps<DistroFlowNode>) {
  const { distro, highlighted, dimmed } = data;
  const r = RADIUS_BY_DEPTH[distro.depth] ?? 20;
  const opacity = dimmed ? 0.28 : 1;
  const isKernel = distro.depth === 0;

  return (
    <div
      style={{ opacity, transition: 'opacity 200ms ease' }}
      className="relative flex items-center justify-center"
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ width: 1, height: 1, minWidth: 1, minHeight: 1, opacity: 0 }}
        isConnectable={false}
      />

      {isKernel && (
        <div
          aria-hidden="true"
          className="kernel-glow absolute rounded-full pointer-events-none"
          style={{
            top: -36,
            left: -36,
            width: r * 2 + 72,
            height: r * 2 + 72,
            background: `radial-gradient(circle, ${distro.accent}66 0%, ${distro.accent}11 45%, transparent 70%)`,
          }}
        />
      )}

      <div
        className="relative flex items-center justify-center rounded-full font-mono font-bold text-bg"
        style={{
          width: r * 2,
          height: r * 2,
          backgroundColor: distro.accent,
          border: `2px solid ${highlighted ? distro.accent : '#0d1117'}`,
          boxShadow: highlighted
            ? `0 0 22px ${distro.accent}, inset 0 0 0 2px #0d1117`
            : `0 0 8px ${distro.accent}44`,
          transform: highlighted ? 'scale(1.16)' : 'scale(1)',
          filter: highlighted ? 'brightness(1.3)' : 'brightness(1)',
          fontSize: r * 0.7,
          transition: 'all 200ms ease-out',
        }}
      >
        {distro.display.charAt(0).toUpperCase()}
      </div>

      <div
        className="absolute whitespace-nowrap text-center pointer-events-none font-mono"
        style={{
          top: r * 2 + 12,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <div
          className="text-[11px] uppercase tracking-wider"
          style={{
            color: highlighted ? distro.accent : '#cbd5e1',
            textShadow: highlighted ? `0 0 12px ${distro.accent}77` : 'none',
            transition: 'color 200ms ease, text-shadow 200ms ease',
          }}
        >
          {distro.display}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ width: 1, height: 1, minWidth: 1, minHeight: 1, opacity: 0 }}
        isConnectable={false}
      />
    </div>
  );
}

export default memo(DistroNodeComponent);
