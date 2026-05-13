/**
 * useOfflineStatus — reactive offline detection hook.
 *
 * Returns an Accessor<boolean> that is `true` when the client is offline.
 *
 * Two-layer detection:
 *   1. `navigator.onLine` for immediate initial value and fast event-based updates.
 *   2. Periodic `HEAD /api/health` fetch every 30 seconds to detect connectivity
 *      when `navigator.onLine` is unreliable (e.g. behind a captive portal that
 *      always reports `true`).
 *
 * The hook registers event listeners and the ping interval when called; the caller
 * is responsible for calling the returned `dispose` function to tear down.
 *
 * Design decisions:
 *   - Lives in src/core/network/ — browser APIs (window.addEventListener, fetch)
 *     are allowed in core (see AuthClient.ts, HttpSyncEngine.ts). JSX / solid-js/web
 *     / solid-js/store are not imported.
 *   - Returns `{ isOffline: Accessor<boolean>; dispose: () => void }` so App.tsx
 *     can manage lifecycle from onCleanup.
 *
 * Spec: docs/cloud-project-spec.md § Offline 策略 + § G6
 */

import { createSignal, type Accessor } from 'solid-js';
import { defaultBaseUrl } from '../sync/baseUrl';

const PING_INTERVAL_MS = 30_000;

export interface OfflineStatusHandle {
  /** Reactive boolean — true when the client is detected as offline. */
  isOffline: Accessor<boolean>;
  /** Tear down event listeners and the periodic ping interval. */
  dispose: () => void;
}

/**
 * Create a reactive offline status tracker.
 *
 * Must be called inside a SolidJS reactive scope (e.g. inside a component
 * function or `createRoot`) because it uses `createSignal`.
 *
 * @param baseUrl  API base URL for health ping (defaults to defaultBaseUrl()).
 */
export function useOfflineStatus(baseUrl: string = defaultBaseUrl()): OfflineStatusHandle {
  // Initialise from navigator.onLine — invert to get "is offline"
  const initiallyOffline =
    typeof navigator !== 'undefined' ? !navigator.onLine : false;

  const [isOffline, setIsOffline] = createSignal<boolean>(initiallyOffline);

  // --- Event listeners (fast path) -----------------------------------------

  const onOnline = () => setIsOffline(false);
  const onOffline = () => setIsOffline(true);

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  // --- Active ping (slow path) ---------------------------------------------
  // Pings HEAD /api/health every 30 s to catch false navigator.onLine states.

  const healthUrl = `${baseUrl.replace(/\/+$/, '')}/health`;

  const ping = async () => {
    try {
      const res = await fetch(healthUrl, {
        method: 'HEAD',
        // No credentials — health endpoint is public, and we want to avoid
        // a 401 being misinterpreted as connectivity loss.
        credentials: 'omit',
        // Short timeout — if the server is unreachable we find out quickly.
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok || res.status < 500) {
        // Any non-5xx response means the server is reachable.
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }
    } catch {
      // fetch threw (network error / timeout) — treat as offline.
      setIsOffline(true);
    }
  };

  const intervalId = setInterval(() => { void ping(); }, PING_INTERVAL_MS);

  // --- Dispose ---------------------------------------------------------------

  const dispose = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    }
    clearInterval(intervalId);
  };

  return { isOffline, dispose };
}
