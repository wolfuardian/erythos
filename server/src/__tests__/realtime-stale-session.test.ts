/**
 * Unit tests for realtime/server.ts — stale session disconnect (L3-A4).
 *
 * Strategy: extract the `connected` hook from a createRealtimeServer() call,
 * invoke it with a synthetic payload including a mock connection, then assert
 * that connection.close() is called when resolveSessionByToken returns null.
 *
 * Mock strategy mirrors realtime-auth.test.ts (vi.hoisted + vi.mock).
 *
 * Spec ref: docs/realtime-co-edit-spec.md § L3-A scope
 * Issue: #1067 (L3-A4)
 *
 * Covered:
 *   - connected hook sets an interval that calls resolveSessionByToken
 *   - when session is still valid → connection.close() NOT called
 *   - when session expires (resolveSessionByToken returns null) → close() called
 *   - onDisconnect hook clears the interval (no timer leak)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted mocks (same pattern as realtime-auth.test.ts)
// ---------------------------------------------------------------------------

const { mockSelect, mockPool, mockResolveSessionByToken } = vi.hoisted(() => {
  const mockLimit = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockPool = { query: vi.fn() };
  const mockResolveSessionByToken = vi.fn();
  return { mockSelect, mockPool, mockResolveSessionByToken };
});

vi.mock('../db.js', () => ({
  db: { select: mockSelect },
  pool: mockPool,
}));

vi.mock('../auth.js', () => ({
  SESSION_COOKIE: 'session',
  resolveSessionByToken: mockResolveSessionByToken,
}));

vi.mock('../middleware/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import { createRealtimeServer } from '../realtime/server.js';
import type { Server, Hocuspocus, connectedPayload, onDisconnectPayload } from '@hocuspocus/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getConnectedHook(server: InstanceType<typeof Server>) {
  const inner: Hocuspocus = server.hocuspocus;
  // connectedPayload hook is typed as optional on Configuration
  const hook = inner.configuration.connected as
    | ((data: connectedPayload) => Promise<unknown>)
    | undefined;
  return hook;
}

function getOnDisconnectHook(server: InstanceType<typeof Server>) {
  const inner: Hocuspocus = server.hocuspocus;
  const hook = inner.configuration.onDisconnect as
    | ((data: onDisconnectPayload) => Promise<unknown>)
    | undefined;
  return hook;
}

/** Minimal mock Connection */
function makeConnection() {
  return { close: vi.fn() };
}

/** Minimal connected payload with mutable context */
function makeConnectedPayload(context: Record<string, unknown>) {
  return {
    context,
    connection: makeConnection(),
    documentName: 'scene-abc',
    instance: {} as never,
    request: new Request('http://localhost'),
    requestHeaders: new Headers(),
    requestParameters: new URLSearchParams(),
    socketId: 'test-socket',
    connectionConfig: { readOnly: false, isAuthenticated: true },
    providerVersion: null,
  } as unknown as connectedPayload;
}

const fakeUser = {
  id: 'user-uuid',
  github_id: 12345,
  github_login: 'testuser',
  email: 'test@example.com',
  avatar_url: null as string | null,
  handle: null as string | null,
  storage_used: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('realtime stale session disconnect (L3-A4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('connected hook exists on Server configuration', () => {
    const server = createRealtimeServer();
    const hook = getConnectedHook(server);
    expect(hook).toBeDefined();
  });

  it('onDisconnect hook exists on Server configuration', () => {
    const server = createRealtimeServer();
    const hook = getOnDisconnectHook(server);
    expect(hook).toBeDefined();
  });

  it('does NOT close connection when session is still valid after interval', async () => {
    const server = createRealtimeServer();
    const connectedHook = getConnectedHook(server)!;
    mockResolveSessionByToken.mockResolvedValue(fakeUser);

    const context = { userId: 'user-uuid', rawToken: 'valid-token' };
    const payload = makeConnectedPayload(context);

    await connectedHook(payload);

    // Advance 60s to trigger one interval tick
    await vi.advanceTimersByTimeAsync(60_000);

    expect(payload.connection.close).not.toHaveBeenCalled();
  });

  it('closes connection when session is expired (resolveSessionByToken returns null)', async () => {
    const server = createRealtimeServer();
    const connectedHook = getConnectedHook(server)!;
    // First call: session still valid; second call (after 60s): expired
    mockResolveSessionByToken
      .mockResolvedValueOnce(fakeUser)   // first interval — still valid
      .mockResolvedValueOnce(null);      // second interval — expired

    const context = { userId: 'user-uuid', rawToken: 'expiring-token' };
    const payload = makeConnectedPayload(context);

    await connectedHook(payload);

    // Advance past first tick (valid) — should NOT close yet
    await vi.advanceTimersByTimeAsync(60_000);
    expect(payload.connection.close).not.toHaveBeenCalled();

    // Advance past second tick (expired) — should close
    await vi.advanceTimersByTimeAsync(60_000);
    expect(payload.connection.close).toHaveBeenCalledOnce();
  });

  it('closes connection immediately on first tick if session is already expired', async () => {
    const server = createRealtimeServer();
    const connectedHook = getConnectedHook(server)!;
    mockResolveSessionByToken.mockResolvedValue(null);

    const context = { userId: 'user-uuid', rawToken: 'stale-token' };
    const payload = makeConnectedPayload(context);

    await connectedHook(payload);

    // Advance 60s — first interval fires; session already invalid
    await vi.advanceTimersByTimeAsync(60_000);

    expect(payload.connection.close).toHaveBeenCalledOnce();
  });

  it('onDisconnect clears the interval so it does not fire after disconnect', async () => {
    const server = createRealtimeServer();
    const connectedHook = getConnectedHook(server)!;
    const disconnectHook = getOnDisconnectHook(server)!;

    // Session becomes invalid on second call
    mockResolveSessionByToken
      .mockResolvedValueOnce(fakeUser)
      .mockResolvedValueOnce(null);

    const context = { userId: 'user-uuid', rawToken: 'token' };
    const payload = makeConnectedPayload(context);

    await connectedHook(payload);

    // Advance one tick (valid, no close)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(payload.connection.close).not.toHaveBeenCalled();

    // Simulate disconnect — this should clear the interval
    await disconnectHook({ context } as unknown as onDisconnectPayload);

    // Advance another 60s — interval should be cleared, resolve NOT called again
    const callsBefore = mockResolveSessionByToken.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockResolveSessionByToken.mock.calls.length).toBe(callsBefore);
    expect(payload.connection.close).not.toHaveBeenCalled();
  });
});
