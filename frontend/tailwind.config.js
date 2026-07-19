// DistroMap minimal Tailwind v3 config. One accent (cyan). All glow,
// pulse, and slide keyframes are deleted — node + edge motion is
// 200 ms opacity or border-color only.
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
          50:  '#e6edf3',
          100: '#cbd5e1',
          400: '#8b949e',
          500: '#6e7681',
          600: '#484f58',
          800: '#30363d',
          900: '#21262d',
        },
        accent: {
          cyan:   '#22d3ee',
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
