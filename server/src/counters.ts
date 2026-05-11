/**
 * In-memory counters for /metrics endpoint.
 *
 * Counters are incremented by:
 *   - logger middleware (req_total by status code)
 *   - auth routes (auth_signin_total, auth_signout_total)
 *   - scene routes (scene_push_total, scene_create_total, scene_fork_total)
 *
 * These are intentionally simple — no prom-client dependency.
 * Reset on process restart (acceptable for F-4 observability baseline).
 */

export interface Counters {
  req_total: Record<string, number>;
  auth_signin_total: number;
  auth_signout_total: number;
  scene_push_total: number;
  scene_create_total: number;
  scene_fork_total: number;
}

export const counters: Counters = {
  req_total: {},
  auth_signin_total: 0,
  auth_signout_total: 0,
  scene_push_total: 0,
  scene_create_total: 0,
  scene_fork_total: 0,
};

export const startEpochMs = Date.now();

/** Increment req_total for a given HTTP status code */
export function incReqTotal(status: number): void {
  const key = String(status);
  counters.req_total[key] = (counters.req_total[key] ?? 0) + 1;
}
