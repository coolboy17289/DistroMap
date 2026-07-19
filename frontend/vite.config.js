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
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
