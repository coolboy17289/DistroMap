/// <reference types="vite/client" />
//
// `import.meta.env.VITE_API_URL` is read at build time by lib/suggestions.ts
// and must be declared so strict TypeScript can resolve it. Empty string
// is the typed shape when the env var is unset, so callers fall back to
// the dev-time "/api" Vite proxy.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
