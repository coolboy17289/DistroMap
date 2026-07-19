import { useEffect, useState } from 'react';

const STORAGE_KEY = 'distromap-theme';

function readInitial(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light') return false;
    if (v === 'dark') return true;
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return true;
  }
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(readInitial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      window.localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [isDark]);

  return (
    <button
      type="button"
      onClick={() => setIsDark((v) => !v)}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className="rounded border border-panel-border px-2 py-1
                 text-[11px] font-mono uppercase tracking-wider
                 text-ink-400 hover:text-ink-50 hover:border-ink-600
                 transition-colors"
    >
      [{isDark ? 'dark' : 'light'}]
    </button>
  );
}
