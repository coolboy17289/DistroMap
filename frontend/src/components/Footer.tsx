import { useEffect, useState } from 'react';

const BACKEND_URL =
  (import.meta.env.VITE_API_URL ?? '').trim() === ''
    ? '/api'
    : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

interface Stats {
  total: number;
  active: number;
  discontinued: number;
  families: number;
}

export default function Footer() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setStats(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="border-t border-panel-border bg-bg/60">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-ink-500">
        <div className="flex flex-wrap items-center gap-3">
          <span>data:</span>
          <a
            className="text-ink-100 hover:text-ink-50 underline underline-offset-2 hover:no-underline"
            href="https://github.com/LihanBadenhorst/DistroMap/blob/main/synthesize_distros.py"
            target="_blank"
            rel="noreferrer"
          >
            synthesize_distros.py
          </a>
          <span className="text-ink-600">·</span>
          <a
            className="text-ink-100 hover:text-ink-50 underline underline-offset-2 hover:no-underline"
            href={`${BACKEND_URL}/graph`}
            target="_blank"
            rel="noreferrer"
          >
            graph.json
          </a>
          <span className="text-ink-600">·</span>
          <a
            className="text-ink-100 hover:text-ink-50 underline underline-offset-2 hover:no-underline"
            href={`${BACKEND_URL}/distros`}
            target="_blank"
            rel="noreferrer"
          >
            distros.json
          </a>
        </div>
        {stats ? (
          <div className="flex flex-wrap items-center gap-2.5 text-ink-500">
            <span>
              <span className="text-ink-50">{stats.total}</span> distros
            </span>
            <span className="text-ink-600">·</span>
            <span>
              <span className="text-ink-50">{stats.families}</span> families
            </span>
            <span className="text-ink-600">·</span>
            <span>
              <span className="text-ink-50">{stats.active}</span> active
            </span>
            <span className="text-ink-600">·</span>
            <span>
              <span className="text-ink-50">{stats.discontinued}</span>{' '}
              discontinued
            </span>
          </div>
        ) : (
          <div className="text-ink-500">Explore the Linux ecosystem.</div>
        )}
      </div>
    </footer>
  );
}
