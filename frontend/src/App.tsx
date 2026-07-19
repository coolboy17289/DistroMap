import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import distrosJson from '@/data/distros.json';
import Header from '@/components/Header';
import GraphCanvas from '@/components/GraphCanvas';
import SidePanel from '@/components/SidePanel';
import Footer from '@/components/Footer';
import type { Distro } from '@/types';

const distros = distrosJson as Distro[];

export default function App() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // When the underlying dataset changes identity, clear stale selection
  useEffect(() => {
    setSelected((cur) => (cur && distros.some((d) => d.slug === cur) ? cur : null));
  }, []);

  const onClosePanel = useCallback(() => setSelected(null), []);

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink-50">
      <Header
        query={query}
        onQueryChange={setQuery}
        onClearQuery={() => setQuery('')}
        total={distros.length}
      />

      <main className="flex-1 relative">
        <section className="absolute inset-0">
          {query.trim() && (
            <div
              className="pointer-events-none absolute top-3 right-4 z-20 px-3 py-1.5
                         rounded-md bg-panel/80 border border-cyan-500/30
                         font-mono text-[11px] text-cyan-300 animate-slide-in
                         shadow-glow-cyan"
            >
              filter:&nbsp;<span className="text-cyan-100">"{query}"</span>
            </div>
          )}
          <GraphCanvas
            distros={distros}
            query={query}
            selected={selected}
            onSelect={setSelected}
          />
        </section>

        <AnimatePresence>
          {/* SidePanel renders its own <aside> root; we wrap it in a
              motion.div (not motion.aside) — nesting <aside> inside <aside>
              is invalid HTML, and motion.div keeps the same animation API. */}
          {selectedDistro && (
            <motion.div
              key={selectedDistro.slug}
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 32 }}
              className="z-30
                         fixed inset-x-0 bottom-0 max-h-[80vh]
                         lg:absolute lg:inset-y-0 lg:right-0 lg:bottom-auto lg:max-h-none
                         lg:w-[360px]"
            >
              <SidePanel distro={selectedDistro} onClose={onClosePanel} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}
