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
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onSuggestClick}
            aria-label="Suggest a distribution"
            className="rounded border border-panel-border px-2 py-1
                       text-[11px] font-mono uppercase tracking-wider
                       text-ink-400 hover:text-cyan-300 hover:border-cyan-500/40
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
