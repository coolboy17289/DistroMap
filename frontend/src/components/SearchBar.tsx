import { forwardRef, useId } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (q: string) => void;
  onClear: () => void;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar({ value, onChange, onClear }, ref) {
    const id = useId();
    return (
      <div className="relative flex-1 max-w-2xl mx-2 sm:mx-4">
        <label htmlFor={id} className="sr-only">
          Search Linux distributions
        </label>
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" strokeLinecap="round" />
        </svg>
        <input
          ref={ref}
          id={id}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search Linux distributions…"
          className="w-full bg-bg border border-panel-border rounded-md pl-9 pr-12 py-2
                     text-sm text-ink-50 placeholder-ink-400 outline-none
                     focus:border-ink-50 transition-colors duration-150"
        />
        {value ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded
                       text-[10px] font-mono uppercase tracking-wider text-ink-400
                       hover:text-ink-50 transition-colors"
          >
            clear
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline
                       text-[10px] font-mono text-ink-500 pointer-events-none"
          >
            <kbd className="px-1.5 py-0.5 rounded border border-panel-border bg-panel">
              /
            </kbd>
          </span>
        )}
      </div>
    );
  },
);

export default SearchBar;
