import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL as NodeURL } from 'node:url';

// DistroMap frontend — React + TypeScript + React Flow + Tailwind v3.

// In ESM there is no `__dirname` — `frontend/package.json` has
// `"type": "module"`. Resolve an ABSOLUTE path for the `@` alias
// against this config file's location. A relative string (`'@':
// './src'`) leaves the alias with the project-root prefix only
// at resolve-time, which Rollup's parallel module loader can race
// the extension-resolution plugin on, surfacing as
// `vite:load-fallback` ENOENT on a non-deterministic component
// during `vite build`. An absolute path ties the alias to a real
// file URL so the resolver chain keeps its hands on the path.
const SRC_ABS = fileURLToPath(new NodeURL('./src', import.meta.url));
// Build configs are plain JS so Vite doesn't need ts-node at startup.

/**
 * In-process API plugin — serves `/api/*` from the SAME Vite dev server
 * that serves the SPA, by loading `api/index.ts` through Vite's SSR
 * module graph and calling its default export directly.
 *
 * Why this exists:
 *   The backend is a TypeScript serverless function at `api/index.ts`
 *   (deployed to Vercel as a `@vercel/node` function in production).
 *   In dev we want `npm run dev` to run BOTH the frontend and the API
 *   as one process — no second `npm run backend`, no port 8765, no
 *   proxy. This plugin makes that happen: a request to
 *   `http://127.0.0.1:5173/api/health` is handled by the same
 *   `api/index.ts` handler that Vercel deploys.
 *
 * `server.ssrLoadModule` (Vite's recommended SSR loader) is used
 * instead of a static `import` so edits to `api/index.ts` hot-reload
 * without restarting the dev server, and so ESM/CJS interop is handled
 * by Vite rather than by us.
 */
function apiServerPlugin() {
  return {
    name: 'distromap-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        // Only intercept /api/* — everything else falls through to
        // Vite's default static/HMR middleware.
        if (!url.startsWith('/api')) {
          next();
          return;
        }
        try {
          // Load through Vite's SSR graph so HMR + TS transpilation
          // work without a restart. The path is relative to cwd
          // (frontend/), which is where vite runs from.
          const mod = await server.ssrLoadModule('/api/index.ts');
          const handler = mod.default;
          if (typeof handler !== 'function') {
            throw new Error('api/index.ts default export is not a function');
          }
          // The Vite dev server's req/res are standard Node.js
          // http.IncomingMessage / http.ServerResponse, which is what
          // the @vercel/node handler signature expects.
          await handler(req, res);
        } catch (err) {
          // Surface the error in the dev console + as a 500 so a
          // syntax error in api/index.ts is obvious immediately.
          console.error('[distromap-api] handler error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                detail: 'api handler error',
                error: err instanceof Error ? err.message : String(err),
              }),
            );
          }
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiServerPlugin()],
  resolve: {
    alias: {
      // Absolute path resolved against this config file's own URL.
      // ESM-safe (no __dirname). See the `SRC_ABS` declaration above
      // for why an absolute alias is required instead of a relative
      // string.
      '@': SRC_ABS,
    },
    // Belt-and-suspenders: declare the extension resolution list
    // explicitly so Rollup's loader never has to fall back to opening
    // a bare path like './src/components/Footer' (which manifested as
    // the `vite:load-fallback` ENOENT bug pre-fix). These match Vite's
    // default list — declaring them here costs nothing and removes any
    // ambiguity in plugins that shorten resolve.extensions.
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // No /api proxy anymore — the apiServerPlugin above serves /api/*
    // in-process on this same port (:5173). One command, one process.
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
