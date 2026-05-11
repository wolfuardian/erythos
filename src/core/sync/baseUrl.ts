/**
 * baseUrl.ts
 *
 * Shared helper that resolves the default sync/auth base URL from the Vite
 * build-time env variable `VITE_SYNC_BASE_URL`.
 *
 * Resolution order:
 *   1. `VITE_SYNC_BASE_URL` env var (set at build time or in .env files) —
 *      MUST include the `/api` suffix when overriding (e.g. `https://my-host/api`)
 *   2. Production fallback: `https://erythos.eoswolf.com/api`
 *   3. Dev / test fallback:  `http://localhost:3000/api`
 *
 * The `/api` prefix isolates server API namespace from the client SPA route
 * `/scenes/:id` so Caddy can route them apart at the edge (Phase E E7).
 *
 * Never throws — a missing or empty env var is treated as "use the fallback".
 *
 * Spec ref: docs/sync-protocol.md § D6 client baseUrl env-driven
 */
export function defaultBaseUrl(): string {
  // `import.meta.env` may be undefined in test environments (Vitest replaces
  // it with a minimal stub that doesn't include VITE_* vars by default).
  const fromEnv = import.meta.env?.VITE_SYNC_BASE_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv;
  }
  // import.meta.env.PROD is true in `vite build` output, false/undefined in dev.
  return import.meta.env?.PROD
    ? 'https://erythos.eoswolf.com/api'
    : 'http://localhost:3000/api';
}
