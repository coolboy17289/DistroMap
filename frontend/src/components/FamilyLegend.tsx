import { useEffect, useState } from 'react';

const BACKEND_URL =
  (import.meta.env.VITE_API_URL ?? '').trim() === ''
    ? '/api'
    : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

interface Family {
  family: string;
  count: number;
  active: number;
  root: string | null;
}

interface FamilyLegendProps {
  selectedFamily: string | null;
  onSelectFamily: (f: string | null) => void;
  onSelectRoot: (slug: string) => void;
}

const FAMILY_COLORS: Record<string, string> = {
  debian: '#A80030',
  arch: '#1793D1',
  fedora: '#294172',
  slackware: '#3B3B3B',
  alpine: '#0D597F',
  gentoo: '#54487A',
  opensuse: '#73BA25',
  ubuntu: '#E95420',
  lfs: '#D43F00',
  puppy: '#5C2E91',
  void: '#3B3B3B',
  linux_kernel: '#F5A623',
};

/* Map a family name to a stable color even if it isn't pre-listed.
 * Uses a tiny hash → HSL so the palette is recognisable per family
 * but never repeats. */
function colorFor(family: string): string {
  if (FAMILY_COLORS[family]) return FAMILY_COLORS[family];
  let h = 0;
  for (let i = 0; i < family.length; i++) {
    h = (h * 31 + family.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}deg 55% 55%)`;
}

export default function FamilyLegend({
  selectedFamily,
  onSelectFamily,
  onSelectRoot,
}: FamilyLegendProps) {
  const [families, setFamilies] = useState<Family[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/families`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setFamilies(j.families ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (families.length === 0) return null;

  return (
    <div
      className="border-b border-panel-border bg-bg/95 backdrop-blur-sm"
      data-testid="family-legend"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500 mr-1">
          family
        </span>
        <button
          type="button"
          onClick={() => onSelectFamily(null)}
          className={`rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
            selectedFamily === null
              ? 'border-ink-50 text-ink-50 bg-panel-strong'
              : 'border-panel-border text-ink-400 hover:text-ink-50 hover:border-ink-600'
          }`}
        >
          all
        </button>
        {families.map((f) => {
          const isActive = selectedFamily === f.family;
          const c = colorFor(f.family);
          return (
            <button
              key={f.family}
              type="button"
              onClick={() => onSelectFamily(isActive ? null : f.family)}
              onDoubleClick={() => f.root && onSelectRoot(f.root)}
              title={
                f.root
                  ? `${f.count} distros · double-click to focus on ${f.root}`
                  : `${f.count} distros`
              }
              className={`rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                isActive
                  ? 'text-ink-50'
                  : 'text-ink-400 hover:text-ink-50'
              }`}
              style={{
                borderColor: isActive ? c : undefined,
                backgroundColor: isActive ? `${c}33` : undefined,
              }}
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle"
                style={{ background: c }}
              />
              {f.family}
              <span className="text-ink-500 ml-1">·</span>
              <span className="text-ink-500 ml-1">{f.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
