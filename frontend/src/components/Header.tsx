import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';
import GithubButton from './GithubButton';

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClearQuery: () => void;
  total: number;
  onSuggestClick: () => void;
}

export default function Header({
  query,
  onQueryChange,
  onClearQuery,
  total,
  onSuggestClick,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-panel-border bg-bg/85 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
        <a href="/" className="flex items-center gap-3 shrink-0" aria-label="DistroMap home">
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
        <SearchBar value={query} onChange={onQueryChange} onClear={onClearQuery} />
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="hidden md:inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-400 mr-2"
            aria-label={`Tracking ${total} distributions`}
          >
            <span className="px-1.5 py-0.5 rounded bg-panel border border-panel-border text-cyan-300">
              {total}
            </span>
            distros
          </span>
          <button
            type="button"
            onClick={onSuggestClick}
            aria-label="Suggest a distribution"
            title="Suggest a distribution (v0.5)"
            className="rounded-md border border-cyan-500/40 px-2.5 py-1.5
                       text-[12px] font-mono uppercase tracking-wider
                       text-cyan-300 bg-cyan-500/5
                       hover:bg-cyan-500/15 hover:text-cyan-200 hover:border-cyan-400
                       transition-all"
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
