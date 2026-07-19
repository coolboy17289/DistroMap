import { memo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DistroFlowNode } from '@/types';

const RADIUS_BY_DEPTH: Record<number, number> = { 0: 26, 1: 22, 2: 18, 3: 14 };

/**
 * Three-tier avatar source chain.
 *
 *   1. distro.favicon_url  — Google Favicon Service from official_website.
 *   2. distro.thumbnail    — Wikipedia REST API upload (Wikimedia).
 *   3. first letter        — last-resort placeholder.
 *
 * A single `tier` index advances on each onError so the <img>
 * chain hops cleanly without unmounting the node.
 */
function DistroNodeComponent({ data }: NodeProps<DistroFlowNode>) {
  const { distro, highlighted, dimmed } = data;
  const r = RADIUS_BY_DEPTH[distro.depth] ?? 18;
  const opacity = dimmed ? 0.32 : 1;

  // Initial tier: 0 = favicon, 1 = thumbnail, 2 = letter only.
  const sources = [distro.favicon_url, distro.thumbnail];
  const firstUsable = sources.findIndex((s) => !!s);
  const [tier, setTier] = useState<number>(
    firstUsable === -1 ? 2 : firstUsable,
  );
  const current = tier < 2 ? sources[tier] : null;

  return (
    <div
      style={{ opacity, transition: 'opacity 200ms ease' }}
      className="relative flex items-center justify-center"
    >
      <div
        className="relative flex items-center justify-center rounded-full overflow-hidden font-mono font-bold transition-colors duration-150"
        style={{
          width: r * 2,
          height: r * 2,
          border: `${highlighted ? 2 : 1}px solid ${highlighted ? '#e6edf3' : '#30363d'}`,
        }}
      >
        {current ? (
          <img
            src={current}
            alt={`${distro.display} logo`}
            key={`${distro.slug}-tier-${tier}`}
            onError={() => setTier((t) => t + 1)}
            className="w-full h-full object-contain p-1.5"
            draggable={false}
          />
        ) : (
          <span
            className="leading-none font-mono text-ink-600"
            style={{
              fontSize: r * 0.7,
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
          className="text-[10.5px] uppercase tracking-[0.18em] transition-colors duration-150"
          style={{
            color: highlighted ? '#e6edf3' : '#8b949e',
          }}
        >
          {distro.display}
        </div>
      </div>
    </div>
  );
}

export default memo(DistroNodeComponent);
