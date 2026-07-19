export default function Footer() {
  return (
    <footer className="border-t border-panel-border bg-bg/60">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-ink-500">
        <div className="flex flex-wrap items-center gap-3">
          <span>data:</span>
          <a
            className="text-ink-100 hover:text-ink-50 underline underline-offset-2 hover:no-underline"
            href="https://en.wikipedia.org/api/rest_v1/"
            target="_blank"
            rel="noreferrer"
          >
            wikipedia REST
          </a>
          <span className="text-ink-600">·</span>
          <a
            className="text-ink-100 hover:text-ink-50 underline underline-offset-2 hover:no-underline"
            href="https://www.wikidata.org/wiki/Wikidata:Data_access"
            target="_blank"
            rel="noreferrer"
          >
            wikidata SPARQL
          </a>
          <span className="text-ink-600">·</span>
          <span className="text-ink-400">CC-BY-SA 4.0</span>
        </div>
        <div className="text-ink-500">Explore the Linux ecosystem.</div>
      </div>
    </footer>
  );
}
