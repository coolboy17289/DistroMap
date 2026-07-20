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

const CATEGORIES: Array<{ key: keyof Distro; label: string }> = [
  { key: 'immutable', label: 'Immutable' },
  { key: 'rolling', label: 'Rolling' },
  { key: 'lts', label: 'LTS' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'security', label: 'Security' },
  { key: 'education', label: 'Education' },
  { key: 'server', label: 'Server' },
  { key: 'embedded', label: 'Embedded' },
  { key: 'container', label: 'Container' },
  { key: 'cloud', label: 'Cloud' },
  { key: 'arm', label: 'ARM' },
];

export default function SidePanel({ distro, onClose }: SidePanelProps) {
  const accent =
    distro.color && /^#[0-9a-fA-F]{3,8}$/.test(distro.color)
      ? distro.color
      : '#8b949e';
  const activeCategories = CATEGORIES.filter((c) => Boolean(distro[c.key]));

  return (
    <aside className="h-full w-full bg-panel border-t lg:border-t-0 lg:border-l border-panel-border overflow-y-auto">
      <header className="sticky top-0 z-10 bg-panel border-b border-panel-border">
        <div className="px-5 py-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
              {distro.family} family
            </div>
            <h2 className="text-xl font-bold mt-1 text-ink-50 truncate flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: accent }}
              />
              {distro.display}
            </h2>
            <p className="mt-0.5 text-ink-100 text-[12.5px] leading-snug">
              {distro.short_desc}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-mono">
              <span
                className="rounded border px-1.5 py-0.5 uppercase tracking-wider"
                style={{
                  borderColor:
                    distro.status === 'Discontinued' ? '#6e7681' : '#3fb950',
                  color:
                    distro.status === 'Discontinued' ? '#8b949e' : '#3fb950',
                }}
              >
                {distro.status}
                {distro.status === 'Discontinued' && distro.discontinued_year
                  ? ` ${distro.discontinued_year}`
                  : ''}
              </span>
              {distro.rolling && (
                <span className="rounded border border-panel-border text-ink-100 px-1.5 py-0.5 uppercase tracking-wider">
                  Rolling
                </span>
              )}
              {distro.lts && (
                <span className="rounded border border-panel-border text-ink-100 px-1.5 py-0.5 uppercase tracking-wider">
                  LTS
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded border border-panel-border px-2 py-1 text-ink-400
                       hover:text-ink-50 hover:border-ink-600 transition-colors
                       font-mono text-[11px]"
          >
            esc
          </button>
        </div>
      </header>

      <div className="px-5 py-4 space-y-4">
        <FieldRow label="Description">
          <p className="text-ink-100 leading-relaxed">{distro.description}</p>
        </FieldRow>

        {activeCategories.length > 0 && (
          <FieldRow label="Categories">
            <div className="flex flex-wrap gap-1">
              {activeCategories.map((c) => (
                <span
                  key={c.key as string}
                  className="rounded border border-panel-border px-1.5 py-0.5
                             text-[11px] font-mono text-ink-100"
                >
                  {c.label}
                </span>
              ))}
            </div>
          </FieldRow>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="First released">
            {distro.first_release ?? <span className="text-ink-500">—</span>}
          </FieldRow>
          <FieldRow label="Latest release">
            {distro.latest_release ?? <span className="text-ink-500">—</span>}
          </FieldRow>
        </div>

        <FieldRow label="Based on">
          {distro.based_on ?? (
            <span className="text-ink-500 italic">Root — every distro descends.</span>
          )}
        </FieldRow>

        <FieldRow label="Parent">
          {distro.parent ? (
            <span className="font-mono text-[12.5px]">{distro.parent}</span>
          ) : (
            <span className="text-ink-500 italic">Root of the family tree.</span>
          )}
        </FieldRow>

        {distro.parents && distro.parents.length > 1 && (
          <FieldRow label="All parents">
            <div className="flex flex-wrap gap-1">
              {distro.parents.map((p) => (
                <span
                  key={p}
                  className="rounded border border-panel-border px-1.5 py-0.5
                             text-[11px] font-mono text-ink-100"
                >
                  {p}
                </span>
              ))}
            </div>
          </FieldRow>
        )}

        {distro.children && distro.children.length > 0 && (
          <FieldRow label={`Direct children (${distro.children.length})`}>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {distro.children.slice(0, 60).map((c) => (
                <span
                  key={c}
                  className="rounded border border-panel-border px-1.5 py-0.5
                             text-[11px] font-mono text-ink-100"
                >
                  {c}
                </span>
              ))}
              {distro.children.length > 60 && (
                <span className="text-[11px] font-mono text-ink-500">
                  +{distro.children.length - 60} more
                </span>
              )}
            </div>
          </FieldRow>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Release model">{distro.release_model}</FieldRow>
          <FieldRow label="Init system">{distro.init_system}</FieldRow>
          <FieldRow label="Package manager">{distro.package_manager}</FieldRow>
          <FieldRow label="Package format">{distro.package_format}</FieldRow>
        </div>

        <FieldRow label="Desktop environments">
          {distro.desktop_defaults && distro.desktop_defaults.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {distro.desktop_defaults.map((de) => (
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

        <FieldRow label="Architecture">
          {distro.architecture && distro.architecture.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {distro.architecture.map((a) => (
                <span
                  key={a}
                  className="rounded border border-panel-border px-1.5 py-0.5
                             text-[11px] font-mono text-ink-100"
                >
                  {a}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-ink-500">—</span>
          )}
        </FieldRow>

        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Country">
            {distro.country ?? <span className="text-ink-500">—</span>}
          </FieldRow>
          <FieldRow label="License">{distro.license}</FieldRow>
        </div>

        <FieldRow label="Developer">
          {distro.developer ?? <span className="text-ink-500">—</span>}
        </FieldRow>

        {distro.maintainer && (
          <FieldRow label="Maintainer">
            <span className="font-mono text-[12.5px]">{distro.maintainer}</span>
          </FieldRow>
        )}

        <FieldRow label="Official website">
          {distro.website ? (
            <a
              href={distro.website}
              target="_blank"
              rel="noreferrer"
              className="text-ink-50 underline underline-offset-2 hover:no-underline break-all"
            >
              {distro.website}
            </a>
          ) : (
            <span className="text-ink-500">—</span>
          )}
        </FieldRow>

        {distro.source_code && (
          <FieldRow label="Source code">
            <a
              href={distro.source_code}
              target="_blank"
              rel="noreferrer"
              className="text-ink-50 underline underline-offset-2 hover:no-underline break-all"
            >
              {distro.source_code}
            </a>
          </FieldRow>
        )}

        <FieldRow label="Wikipedia">
          <a
            href={distro.wiki_url}
            target="_blank"
            rel="noreferrer"
            className="text-ink-50 underline underline-offset-2 hover:no-underline break-all"
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
              className="font-mono text-[12px] text-ink-50 underline underline-offset-2 hover:no-underline"
            >
              {distro.qid}
            </a>
          </FieldRow>
        )}

        <div className="pt-3 mt-1 border-t border-panel-border">
          <a
            href={`/api/og/${distro.slug}.svg`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-ink-400 hover:text-ink-50"
          >
            og image ↗
          </a>
          {' · '}
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${distro.name} — ${distro.short_desc}`)}&url=${encodeURIComponent(`https://distromap.app/?d=${distro.slug}`)}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-ink-400 hover:text-ink-50"
          >
            share ↗
          </a>
        </div>
      </div>
    </aside>
  );
}
