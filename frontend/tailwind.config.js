// DistroMap minimal Tailwind v3 config. Strict 3-color palette:
// white (ink-50), greys (ink scale), black (bg).  No accent color.
// All glow / pulse / slide animations are gone — motion is 200 ms
// opacity or border-color only.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg:               '#0d1117', // deep black/charcoal (main bg)
        panel:            '#161b22', // card/panel
        'panel-strong':   '#21262d', // elevated panel
        'panel-border':   '#30363d', // subtle border
        ink: {
          50:  '#e6edf3', // primary white-equivalent text
          100: '#cbd5e1', // body text secondary
          400: '#8b949e', // muted/dimmed text
          500: '#6e7681', // placeholders
          600: '#484f58', // very dimmed / decorative
          800: '#30363d', // dimmed border
          900: '#21262d', // strong background
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
