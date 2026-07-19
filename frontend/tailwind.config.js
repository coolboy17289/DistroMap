// Family accent palette — must match distros.json. Semantically stable.
const FAMILY_ACCENTS = {
  kernel:   '#22d3ee', // cyan (the glowing center)
  debian:   '#22d3ee',
  arch:     '#34d399', // Linux green
  fedora:   '#51a2da', // Fedora blue
  gentoo:   '#a78bfa', // purple
  slackware:'#f0883e', // amber
};

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
        family:  FAMILY_ACCENTS,
        accent: {
          cyan:   '#22d3ee',
          green:  '#34d399',
          purple: '#a78bfa',
          amber:  '#f0883e',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-cyan':   '0 0 24px rgba(34, 211, 238, 0.45)',
        'glow-green':  '0 0 24px rgba(52, 211, 153, 0.4)',
        'glow-purple': '0 0 24px rgba(167, 139, 250, 0.4)',
        'glow-amber':  '0 0 24px rgba(240, 136, 62, 0.4)',
      },
      keyframes: {
        'kernel-pulse': {
          '0%, 100%': { opacity: '0.65', transform: 'scale(1)' },
          '50%':       { opacity: '1',    transform: 'scale(1.03)' },
        },
        flow: {
          to: { strokeDashoffset: '-24' },
        },
        'panel-in': {
          from: { opacity: '0', transform: 'translateX(36px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'kernel-pulse': 'kernel-pulse 4s ease-in-out infinite',
        'panel-in':     'panel-in 0.32s ease-out',
        'slide-in':     'slide-in 0.32s ease-out',
      },
    },
  },
  plugins: [],
};
