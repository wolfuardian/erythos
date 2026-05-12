/**
 * In-memory sliding-window rate limiter (refs F-5 spec § Rate Limit).
 *
 * Restart wipes state — acceptable for v0. High-load future path:
 * migrate to Postgres or Redis (spec § Rate Limit v0 implementation).
 *
 * Memory: O(N * maxCount) where N = unique active keys. Cleanup is lazy
 * (each check drops timestamps older than windowMs). Cold keys never
 * accessed again leak indefinitely — minor; acceptable for v0.
 */

const buckets = new Map<string, number[]>();

/**
 * Returns true if the request is allowed under the limit, false if the
 * caller should be rate-limited.
 *
 * Sliding window: a request is allowed when fewer than `maxCount`
 * timestamps fall within the past `windowMs`.
 */
export function checkRateLimit(
  key: string,
  windowMs: number,
  maxCount: number,
): boolean {
  const now = Date.now();
  const previous = buckets.get(key) ?? [];
  const fresh: number[] = [];
  for (const ts of previous) {
    if (now - ts < windowMs) fresh.push(ts);
  }
  if (fresh.length >= maxCount) {
    buckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  buckets.set(key, fresh);
  return true;
}

/**
 * Test helper: reset all rate-limit state.
 *
 * The buckets Map is a module singleton, so test files importing routes
 * that call checkRateLimit() must call this in beforeEach() to avoid
 * cross-test bleed.
 */
export function _resetRateLimit(): void {
  buckets.clear();
}
