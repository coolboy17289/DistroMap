import { useCallback, useEffect, useMemo, useState } from 'react';
import distrosJson from '@/data/distros.json';
import Header from '@/components/Header';
import GraphCanvas from '@/components/GraphCanvas';
import SidePanel from '@/components/SidePanel';
import Footer from '@/components/Footer';
import SuggestForm from '@/components/SuggestForm';
import FamilyLegend from '@/components/FamilyLegend';
import type { Distro } from '@/types';

const distros = distrosJson as Distro[];
const distroSlugs = new Set(distros.map((d) => d.slug));

function selectedSlugFromUrl(): string | null {
  const slug = new URLSearchParams(window.location.search).get('d');
  return slug && distroSlugs.has(slug) ? slug : null;
}

function selectedFamilyFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('f');
}

export default function App() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(selectedSlugFromUrl);
  const [family, setFamily] = useState<string | null>(selectedFamilyFromUrl);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);

  const selectedDistro = useMemo(
    () => (selected ? distros.find((d) => d.slug === selected) ?? null : null),
    [selected],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>('input[type="search"]');
        input?.focus();
      } else if (e.key === 'Escape') {
        setSelected(null);
        setFamily(null);
      } else if (e.key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // 'f' focuses the family legend by focusing the first chip
        const first = document.querySelector<HTMLButtonElement>('[data-testid="family-legend"] button');
        first?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) {
      url.searchParams.set('d', selected);
    } else {
      url.searchParams.delete('d');
    }
    if (family) {
      url.searchParams.set('f', family);
    } else {
      url.searchParams.delete('f');
    }
    window.history.replaceState(window.history.state, '', url);
  }, [selected, family]);

  useEffect(() => {
    const syncSelectionFromUrl = () => {
      setSelected(selectedSlugFromUrl());
      setFamily(selectedFamilyFromUrl());
    };
    window.addEventListener('popstate', syncSelectionFromUrl);
    return () => window.removeEventListener('popstate', syncSelectionFromUrl);
  }, []);

  const onClosePanel = useCallback(() => setSelected(null), []);

  // Combine the family filter with the search query so the canvas can
  // highlight nodes in both. Family is AND-ed with the search terms.
  const combinedQuery = useMemo(() => {
    if (!family) return query;
    const famToken = `family:${family}`;
    if (query.includes(famToken)) return query;
    return query.trim() ? `${query} ${famToken}` : famToken;
  }, [query, family]);

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink-50">
      <style>{`
        @keyframes sidebar-in {
          from { opacity: 0; transform: translateX(40px) }
          to   { opacity: 1; transform: translateX(0) }
        }
        .sidebar-slide { animation: sidebar-in 220ms ease-out both }
      `}</style>

      <Header
        query={query}
        onQueryChange={setQuery}
        onClearQuery={() => setQuery('')}
        onSuggestClick={() => setIsSuggestOpen(true)}
        onSelect={setSelected}
        distros={distros.map((d) => ({
          slug: d.slug,
          name: d.display,
          family: d.family,
          status: d.status,
          description: d.description,
        }))}
      />

      <FamilyLegend
        selectedFamily={family}
        onSelectFamily={setFamily}
        onSelectRoot={(slug) => setSelected(slug)}
      />

      <main className="flex-1 relative">
        <section className="absolute inset-0">
          {combinedQuery.trim() && (
            <div
              className="pointer-events-none absolute top-3 right-4 z-20 px-2.5 py-1
                         rounded border border-panel-border
                         font-mono text-[11px] text-ink-400"
            >
              filter:&nbsp;<span className="text-ink-50">"{combinedQuery}"</span>
            </div>
          )}
          <GraphCanvas
            distros={distros}
            query={combinedQuery}
            selected={selected}
            onSelect={setSelected}
          />
        </section>

        {selectedDistro && (
          <div
            key={selectedDistro.slug}
            className="sidebar-slide z-30
                       fixed inset-x-0 bottom-0 max-h-[80vh]
                       lg:absolute lg:inset-y-0 lg:right-0 lg:bottom-auto lg:max-h-none
                       lg:w-[360px]"
          >
            <SidePanel distro={selectedDistro} onClose={onClosePanel} />
          </div>
        )}
      </main>

      <Footer />

      {/* Suggestion modal lives outside the main grid so it can
          overlay the full canvas without z-fighting with the sticky
          header or side panel. */}
      <SuggestForm open={isSuggestOpen} onClose={() => setIsSuggestOpen(false)} />
    </div>
  );
}
