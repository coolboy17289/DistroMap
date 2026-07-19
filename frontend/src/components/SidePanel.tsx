import type { Distro } from '@/types';

interface SidePanelProps {
  distro: Distro;
  onClose: () => void;
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400 mb-1">
        {label}
      </div>
      <div className="text-ink-50 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

export default function SidePanel({ distro, onClose }: SidePanelProps) {
  return (
    <aside className="h-full w-full bg-panel border-t lg:border-t-0 lg:border-l border-panel-border overflow-y-auto">
      <header className="sticky top-0 z-10 bg-panel border-b border-panel-border">
        <div className="px-5 py-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400">
              {distro.family} family
            </div>
            <h2 className="text-xl font-bold mt-1 text-ink-50 truncate">
              {distro.display}
            </h2>
            <p className="mt-0.5 text-ink-100 text-[12.5px] leading-snug">
              {distro.short_desc}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded border border-panel-border px-2 py-1 text-ink-400
                       hover:text-cyan-300 hover:border-cyan-500/40 transition-colors
                       font-mono text-[11px]"
          >
            esc
          </button>
        </div>
      </header>

      <div className="px-5 py-4 space-y-4">
        <section className="border-b border-panel-border pb-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
              Popularity
            </div>
            <span className="font-mono text-[12px] text-cyan-300 tracking-wider">
              {distro.popularity}/5
            </span>
          </div>
          {distro.popularity_signals && distro.popularity_signals.pageviews_30d > 0 ? (
            <p
              className="mt-1.5 font-mono text-[10px] text-ink-500 leading-relaxed"
              title={`Wikipedia pageviews, ${distro.popularity_signals.fetched_at}`}
            >
              {distro.popularity_signals.pageviews_30d.toLocaleString()} views/day ·
              {' '}
              <span className="text-cyan-300">
                {distro.popularity_signals.source || 'no-source'}
              </span>
            </p>
          ) : (
            <p className="mt-1.5 font-mono text-[10px] text-ink-500">
              raw signal not yet fetched — run <code className="text-cyan-300">fetch_popularity.py</code>
            </p>
          )}
        </section>

        <FieldRow label="Description">
          <p className="text-ink-100 leading-relaxed">{distro.extract}</p>
        </FieldRow>

        <FieldRow label="Based on">
          {distro.based_on_label ?? (
            <span className="text-ink-500 italic">Root — every distro descends.</span>
          )}
        </FieldRow>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldRow label="Release model">{distro.release_model}</FieldRow>
          <FieldRow label="Package manager">{distro.package_manager}</FieldRow>
        </div>

        <FieldRow label="Desktop environments">
          {distro.desktop_environments.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {distro.desktop_environments.map((de) => (
                <span
                  key={de}
                  className="rounded border border-panel-border px-1.5 py-0.5
                             text-[11px] font-mono text-ink-100"
                >
                  {de}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-ink-500">—</span>
          )}
        </FieldRow>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FieldRow label="First released">
            {distro.inception ?? <span className="text-ink-500">—</span>}
          </FieldRow>
          <FieldRow label="Developer">{distro.developer ?? <span className="text-ink-500">—</span>}</FieldRow>
        </div>

        <FieldRow label="Official website">
          {distro.official_website ? (
            <a
              href={distro.official_website}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline-offset-2
                         hover:underline break-all"
            >
              {distro.official_website}
            </a>
          ) : (
            <span className="text-ink-500">—</span>
          )}
        </FieldRow>

        <FieldRow label="Wikipedia">
          <a
            href={distro.wiki_url}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline-offset-2
                       hover:underline break-all"
          >
            {distro.wiki_url}
          </a>
        </FieldRow>

        {distro.qid && (
          <FieldRow label="Wikidata">
            <a
              href={`https://www.wikidata.org/wiki/${distro.qid}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[12px] text-cyan-400 hover:text-cyan-300"
            >
              {distro.qid}
            </a>
          </FieldRow>
        )}
      </div>
    </aside>
  );
}
