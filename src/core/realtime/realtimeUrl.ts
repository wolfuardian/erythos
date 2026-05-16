/**
 * realtimeUrl.ts
 *
 * Resolves the WebSocket base URL for the HocusPocus realtime server.
 *
 * Resolution order:
 *   1. `VITE_REALTIME_URL` env var (must NOT include trailing slash or sceneId)
 *   2. Production fallback: `wss://erythos.eoswolf.com/realtime`
 *   3. Dev fallback: `ws://localhost:3001`
 *
 * Usage: `${realtimeUrl()}/<sceneId>`
 *
 * Note: The realtime server runs on REST_PORT+1 (default 3001) because
 * HocusPocus manages its own http.Server internally.
 * In production, Caddy proxies `wss://erythos.eoswolf.com/realtime/...` → `ws://localhost:3001/...`
 *
 * Spec ref: docs/realtime-co-edit-spec.md § L3-A scope > Client integration
 */
export function realtimeUrl(): string {
  const fromEnv = import.meta.env?.VITE_REALTIME_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv;
  }
  return import.meta.env?.PROD
    ? 'wss://erythos.eoswolf.com/realtime'
    : 'ws://localhost:3001';
}
