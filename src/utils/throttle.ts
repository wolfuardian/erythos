/**
 * throttle.ts
 *
 * Leading + trailing throttle with cancel support.
 * The returned function fires immediately on the first call, then at most
 * once per `intervalMs` for subsequent calls (trailing-edge deferred).
 *
 * Used by RealtimeClient to throttle cursor broadcasts to 30 Hz (33 ms).
 * Selection changes are NOT throttled (dispatched on-change per spec).
 *
 * Spec ref: docs/realtime-co-edit-spec.md § Awareness payload 預算
 */
export function throttle<T extends unknown[]>(
  fn: (...args: T) => void,
  intervalMs: number,
): { (...args: T): void; cancel: () => void } {
  let lastCall = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: T | null = null;

  function flush() {
    timerId = null;
    if (pendingArgs !== null) {
      lastCall = Date.now();
      fn(...pendingArgs);
      pendingArgs = null;
    }
  }

  function throttled(...args: T): void {
    const now = Date.now();
    const remaining = intervalMs - (now - lastCall);

    if (remaining <= 0) {
      // Leading call — fire immediately
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      lastCall = now;
      fn(...args);
    } else {
      // Schedule trailing call
      pendingArgs = args;
      if (timerId === null) {
        timerId = setTimeout(flush, remaining);
      }
    }
  }

  throttled.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    pendingArgs = null;
  };

  return throttled;
}
