import { memo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DistroFlowNode } from '@/types';

const RADIUS_BY_DEPTH: Record<number, number> = { 0: 26, 1: 22, 2: 18, 3: 14 };

function DistroNodeComponent({ data }: NodeProps<DistroFlowNode>) {
  const { distro, highlighted, dimmed } = data;
  const r = RADIUS_BY_DEPTH[distro.depth] ?? 18;
  const opacity = dimmed ? 0.32 : 1;

  // onError swap from favicon <img> to letter fallback. Single
  // failed-load event persists for the life of the node via state.
  const [imgError, setImgError] = useState(false);
  const showFavicon = !!distro.favicon_url && !imgError;

  return (
    <div
      style={{ opacity, transition: 'opacity 200ms ease' }}
      className="relative flex items-center justify-center"
    >
      <div
        className="relative flex items-center justify-center rounded-full overflow-hidden font-mono font-bold text-bg transition-colors"
        style={{
          width: r * 2,
          height: r * 2,
          backgroundColor: '#ffffff',
          border: `1.5px solid ${highlighted ? '#22d3ee' : '#30363d'}`,
        }}
      >
        {showFavicon ? (
          <img
            src={distro.favicon_url as string}
            alt={`${distro.display} favicon`}
            onError={() => setImgError(true)}
            // object-contain keeps the favicon centered inside the
            // circle without stretching — most distro favicons have
            // a transparent pad so this reads cleanly.
            className="w-full h-full object-contain p-1.5"
            draggable={false}
          />
        ) : (
          <span
            className="leading-none"
            style={{
              fontSize: r * 0.7,
              color: '#0d1117',
            }}
          >
            {distro.display.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div
        className="absolute whitespace-nowrap text-center pointer-events-none font-mono"
        style={{
          top: r * 2 + 8,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        <div
          className="text-[10.5px] uppercase tracking-[0.18em] transition-colors"
          style={{
            color: highlighted ? '#22d3ee' : '#8b949e',
          }}
        >
          {distro.display}
        </div>
      </div>
    </div>
  );
}

export default memo(DistroNodeComponent);
