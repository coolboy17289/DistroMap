import { memo, useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import type { DistroFlowNode } from '@/types';

const RADIUS_BY_DEPTH: Record<number, number> = { 0: 28, 1: 24, 2: 20, 3: 16, 4: 14 };

/**
 * Three-tier avatar source chain.
 *
 *   1. distro.favicon_url  — Google Favicon Service from official_website.
 *   2. distro.thumbnail    — Wikipedia REST API upload (Wikimedia).
 *   3. first letter        — last-resort placeholder.
 *
 * A single `tier` index advances on each onError so the <img>
 * chain hops cleanly without unmounting the node.
 *
 * The node ring is tinted by the distro's `color` field at low alpha,
 * so the strict 3-color palette stays the structural accent while
 * a hint of brand colour is visible. Status (active/discontinued) is
 * indicated by a small ring under the avatar.
 */
function DistroNodeComponent({ data }: NodeProps<DistroFlowNode>) {
  const { distro, highlighted, dimmed } = data;
  const visualDepth = Math.min(distro.depth ?? 0, 4);
  const r = RADIUS_BY_DEPTH[visualDepth] ?? 16;
  const opacity = dimmed ? 0.32 : 1;
  const accent = distro.color && /^#[0-9a-fA-F]{3,8}$/.test(distro.color) ? distro.color : '#30363d';

  // Initial tier: 0 = favicon, 1 = thumbnail, 2 = letter only.
  const sources = [distro.favicon_url, distro.thumbnail];
  const firstUsable = sources.findIndex((s) => !!s);
  const [tier, setTier] = useState<number>(
    firstUsable === -1 ? 2 : firstUsable,
  );
  const current = tier < 2 ? sources[tier] : null;

  const discontinued = distro.status === 'Discontinued';

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
          border: `${highlighted ? 2.5 : 1.5}px solid ${highlighted ? '#e6edf3' : accent}`,
          backgroundColor: `${accent}1A`, // 10% alpha overlay
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
            className="leading-none font-mono text-ink-50"
            style={{
              fontSize: r * 0.7,
            }}
          >
            {distro.display.charAt(0).toUpperCase()}
          </span>
        )}
        {discontinued && (
          <span
            aria-label="Discontinued"
            title="Discontinued"
            className="absolute -bottom-0.5 -right-0.5 inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: '#6e7681', border: '1.5px solid #0d1117' }}
          />
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
