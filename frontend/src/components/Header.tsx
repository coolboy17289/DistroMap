import { useEffect, useRef, useState } from 'react';
import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';
import GithubButton from './GithubButton';

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClearQuery: () => void;
  onSuggestClick: () => void;
  onSelect: (slug: string) => void;
  distros: Array<{ slug: string; name: string; family: string; status: string; description: string }>;
}

const BACKEND_URL =
  (import.meta.env.VITE_API_URL ?? '').trim() === ''
    ? '/api'
    : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export default function Header({
  query,
  onQueryChange,
  onClearQuery,
  onSuggestClick,
  onSelect,
  distros,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<HeaderProps['distros']>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Debounced server search — runs 200ms after the last keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `${BACKEND_URL}/search?q=${encodeURIComponent(q)}&limit=8`,
        );
        if (r.ok) {
          const j = (await r.json()) as { results: HeaderProps['distros'] };
          if (Array.isArray(j.results) && j.results.length) {
            setResults(j.results);
            return;
          }
        }
      } catch {
        // ignore — fall through to local match
      }
      const ql = q.toLowerCase();
      const local = distros
        .filter(
          (d) =>
            d.slug.includes(ql) ||
            d.name.toLowerCase().includes(ql) ||
            d.family.includes(ql) ||
            d.description.toLowerCase().includes(ql),
        )
        .slice(0, 8);
      setResults(local);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, distros]);

  // Close the suggestion dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function onRandom() {
    try {
      const r = await fetch(`${BACKEND_URL}/random`);
      if (r.ok) {
        const j = (await r.json()) as { distro: { slug: string } | null };
        if (j.distro?.slug) {
          onSelect(j.distro.slug);
        }
      }
    } catch {
      if (distros.length) {
        const idx = Math.floor(Math.random() * distros.length);
        onSelect(distros[idx].slug);
      }
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-panel-border bg-bg">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
        <a
          href="/"
          className="flex items-center gap-3 shrink-0"
          aria-label="DistroMap home"
        >
          <img
            src="/logo.svg"
            alt="DistroMap"
            className="h-9 w-auto max-w-[200px] hidden sm:block"
          />
          <img
            src="/logo.svg"
            alt="DistroMap"
            className="h-7 w-auto max-w-[140px] sm:hidden"
          />
        </a>
        <div className="relative flex-1 max-w-2xl mx-2 sm:mx-4" ref={wrapperRef}>
          <SearchBar
            value={query}
            onChange={(v) => {
              onQueryChange(v);
              setOpen(true);
            }}
            onClear={() => {
              onClearQuery();
              setResults([]);
              setOpen(false);
            }}
          />
          {open && results.length > 0 && (
            <div
              className="absolute left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto
                         rounded border border-panel-border bg-panel shadow-lg z-40"
              role="listbox"
            >
              {results.map((d) => (
                <button
                  key={d.slug}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="w-full text-left px-3 py-2 hover:bg-panel-strong border-b border-panel-border last:border-b-0 transition-colors"
                  onClick={() => {
                    onSelect(d.slug);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] text-ink-50 truncate">
                      {d.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-400 shrink-0">
                      {d.family}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-100 mt-0.5 line-clamp-1">
                    {d.description}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onRandom}
            aria-label="Pick a random distro"
            title="Pick a random distro"
            className="rounded border border-panel-border px-2 py-1
                       text-[11px] font-mono uppercase tracking-wider
                       text-ink-400 hover:text-ink-50 hover:border-ink-600
                       transition-colors"
          >
            <span aria-hidden="true" className="mr-0.5">~</span>
            <span className="hidden sm:inline">random</span>
          </button>
          <button
            type="button"
            onClick={onSuggestClick}
            aria-label="Suggest a distribution"
            className="rounded border border-panel-border px-2 py-1
                       text-[11px] font-mono uppercase tracking-wider
                       text-ink-400 hover:text-ink-50 hover:border-ink-600
                       transition-colors"
          >
            <span aria-hidden="true" className="mr-0.5">+</span>
            <span className="hidden sm:inline">suggest</span>
          </button>
          <ThemeToggle />
          <GithubButton />
        </div>
      </div>
    </header>
  );
}
