import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

// DistroMap frontend — React + TypeScript + React Flow + Tailwind v3 + Framer Motion.
// No Vue (per the design brief). Build configs are plain JS so Vite doesn't
// need ts-node at startup.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // v0.5 — proxy suggestion-API calls to the optional FastAPI
    // backend (see ../backend/app.py and ../serve_backend.sh). If
    // uvicorn isn't running, /api/* calls will 404 and the frontend
    // silently falls back to localStorage + a JSON download.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
