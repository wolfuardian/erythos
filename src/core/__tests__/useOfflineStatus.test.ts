/**
 * useOfflineStatus.test.ts
 *
 * Tests for the useOfflineStatus reactive hook.
 *
 * Strategy:
 *   - Wrap calls in createRoot so SolidJS reactive context is available.
 *   - Control navigator.onLine via Object.defineProperty.
 *   - Control fetch via vi.stubGlobal.
 *   - Use vi.useFakeTimers to advance the 30-second ping interval.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { useOfflineStatus } from '../network/useOfflineStatus';

// Keep track of the current mocked onLine value.
let mockedOnLine = true;

Object.defineProperty(navigator, 'onLine', {
  configurable: true,
  enumerable: true,
  get: () => mockedOnLine,
});

/** Helper: dispatch a browser connectivity event on window. */
const dispatchConnectivity = (type: 'online' | 'offline') => {
  mockedOnLine = type === 'online';
  window.dispatchEvent(new Event(type));
};

describe('useOfflineStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedOnLine = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('initialises as online when navigator.onLine is true', () => {
    mockedOnLine = true;
    let offline!: boolean;
    createRoot((dispose) => {
      const { isOffline, dispose: d } = useOfflineStatus('http://localhost');
      offline = isOffline();
      d();
      dispose();
    });
    expect(offline).toBe(false);
  });

  it('initialises as offline when navigator.onLine is false', () => {
    mockedOnLine = false;
    let offline!: boolean;
    createRoot((dispose) => {
      const { isOffline, dispose: d } = useOfflineStatus('http://localhost');
      offline = isOffline();
      d();
      dispose();
    });
    expect(offline).toBe(true);
  });

  it('updates to offline when "offline" event fires', () => {
    mockedOnLine = true;
    let isOffline!: () => boolean;
    let cleanup!: () => void;
    createRoot((dispose) => {
      const handle = useOfflineStatus('http://localhost');
      isOffline = handle.isOffline;
      cleanup = () => { handle.dispose(); dispose(); };
    });

    expect(isOffline()).toBe(false);
    dispatchConnectivity('offline');
    expect(isOffline()).toBe(true);

    cleanup();
  });

  it('updates to online when "online" event fires after going offline', () => {
    mockedOnLine = false;
    let isOffline!: () => boolean;
    let cleanup!: () => void;
    createRoot((dispose) => {
      const handle = useOfflineStatus('http://localhost');
      isOffline = handle.isOffline;
      cleanup = () => { handle.dispose(); dispose(); };
    });

    expect(isOffline()).toBe(true);
    dispatchConnectivity('online');
    expect(isOffline()).toBe(false);

    cleanup();
  });

  it('dispose removes event listeners (no state changes after dispose)', () => {
    mockedOnLine = true;
    let isOffline!: () => boolean;
    let handle!: ReturnType<typeof useOfflineStatus>;
    createRoot((dispose) => {
      handle = useOfflineStatus('http://localhost');
      isOffline = handle.isOffline;
      dispose();
    });

    handle.dispose();

    // After dispose, event should not affect signal (no reactive context anyway,
    // but we verify the listener was actually removed by checking no error thrown).
    dispatchConnectivity('offline');
    // Signal reads outside reactive context return last computed value — still false
    // (the offline event was fired after dispose so no update happened).
    expect(isOffline()).toBe(false);
  });

  it('sets offline when ping fetch throws (network error)', async () => {
    mockedOnLine = true;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    let isOffline!: () => boolean;
    let cleanup!: () => void;
    createRoot((dispose) => {
      const handle = useOfflineStatus('http://localhost');
      isOffline = handle.isOffline;
      cleanup = () => { handle.dispose(); dispose(); };
    });

    expect(isOffline()).toBe(false);

    // Advance 30 seconds to trigger ping
    await vi.advanceTimersByTimeAsync(30_000);

    expect(isOffline()).toBe(true);
    cleanup();
  });

  it('sets online when ping fetch succeeds (200)', async () => {
    mockedOnLine = false; // start offline (navigator says so)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    let isOffline!: () => boolean;
    let cleanup!: () => void;
    createRoot((dispose) => {
      const handle = useOfflineStatus('http://localhost');
      isOffline = handle.isOffline;
      cleanup = () => { handle.dispose(); dispose(); };
    });

    expect(isOffline()).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(isOffline()).toBe(false);
    cleanup();
  });
});
