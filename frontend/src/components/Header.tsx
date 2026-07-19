import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';
import GithubButton from './GithubButton';

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClearQuery: () => void;
  total: number;
}

export default function Header({
  query,
  onQueryChange,
  onClearQuery,
  total,
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
          <ThemeToggle />
          <GithubButton />
        </div>
      </div>
    </header>
  );
}
