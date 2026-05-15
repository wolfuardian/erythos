/**
 * Unit tests for realtime/server.ts — onAuthenticate hook logic.
 *
 * Strategy: mock db and auth modules so no real Postgres connection is
 * needed.  We extract the onAuthenticate callback from a createRealtimeServer()
 * call and invoke it directly with synthetic payloads.
 *
 * Covered:
 *   - missing token AND missing Cookie header → throws "Unauthorized: missing"
 *   - invalid/expired session token → throws "Unauthorized: invalid"
 *   - valid session, scene not found → throws "Not Found"
 *   - valid session, private scene, non-owner → throws "Forbidden"
 *   - valid session, owner of private scene → resolves OK
 *   - valid session, non-owner of public scene → resolves OK
 *   - Cookie header fallback (no token field) → resolves OK
 *
 * Note: HocusPocus Server.listen() is NOT called — we only construct the
 * Server to extract its onAuthenticate configuration without binding a port.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// vi.hoisted ensures mock variables are available when vi.mock factories run
// (vi.mock is hoisted to the top of the file by vitest transforms)
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
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------

import { createRealtimeServer } from '../realtime/server.js';
import type { Server, Hocuspocus } from '@hocuspocus/server';
import type { onAuthenticatePayload } from '@hocuspocus/server';

// ---------------------------------------------------------------------------
// Helper: build a minimal onAuthenticatePayload
// ---------------------------------------------------------------------------

function makePayload(
  overrides: { token: string; documentName: string; requestHeaders?: Headers },
): onAuthenticatePayload {
  return {
    context: {},
    instance: {} as never,
    requestParameters: new URLSearchParams(),
    request: new Request('http://localhost'),
    socketId: 'test-socket',
    connectionConfig: { readOnly: false, isAuthenticated: false },
    providerVersion: null,
    requestHeaders: new Headers(),
    ...overrides,
  } as onAuthenticatePayload;
}

// ---------------------------------------------------------------------------
// Helper: pull onAuthenticate out of a fresh Server instance and call it
// ---------------------------------------------------------------------------

async function callOnAuthenticate(
  server: InstanceType<typeof Server>,
  payload: { token: string; documentName: string; requestHeaders?: Headers },
) {
  // HocusPocus Server wraps Hocuspocus internally; the onAuthenticate hook
  // ends up on hocuspocus.configuration (the inner instance).
  // Both `hocuspocus` and `configuration` are publicly typed in @hocuspocus/server.
  const inner: Hocuspocus = server.hocuspocus;
  const hook = inner.configuration.onAuthenticate as
    | ((data: onAuthenticatePayload) => Promise<unknown>)
    | undefined;

  if (!hook) throw new Error('onAuthenticate not found — check HocusPocus internals');
  return hook(makePayload(payload));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeUser = {
  id: 'user-uuid',
  github_id: 12345,
  github_login: 'testuser',
  email: 'test@example.com',
  avatar_url: null as string | null,
  handle: null as string | null,
  storage_used: 0,
};

/** Build a mock db.select() chain that returns `rows` from .limit() */
function dbReturns(rows: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('realtime onAuthenticate', () => {
  let server: InstanceType<typeof Server>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createRealtimeServer();
    // Default: DB returns no rows
    dbReturns([]);
  });

  it('throws when token is empty and Cookie header is absent', async () => {
    await expect(
      callOnAuthenticate(server, {
        token: '',
        documentName: 'scene-123',
        requestHeaders: new Headers(),
      }),
    ).rejects.toThrow('Unauthorized: missing session token');
  });

  it('throws when session token is invalid or expired', async () => {
    mockResolveSessionByToken.mockResolvedValue(null);

    await expect(
      callOnAuthenticate(server, {
        token: 'bad-token',
        documentName: 'scene-123',
      }),
    ).rejects.toThrow('Unauthorized: invalid or expired session');
  });

  it('throws when scene does not exist', async () => {
    mockResolveSessionByToken.mockResolvedValue(fakeUser);
    dbReturns([]); // no scene row

    await expect(
      callOnAuthenticate(server, {
        token: 'valid-token',
        documentName: 'nonexistent-scene',
      }),
    ).rejects.toThrow('Not Found: scene does not exist');
  });

  it('throws when scene is private and user is not the owner', async () => {
    mockResolveSessionByToken.mockResolvedValue(fakeUser);
    dbReturns([{ owner_id: 'other-user', visibility: 'private' }]);

    await expect(
      callOnAuthenticate(server, {
        token: 'valid-token',
        documentName: 'private-scene',
      }),
    ).rejects.toThrow('Forbidden: no access to this scene');
  });

  it('allows the owner of a private scene', async () => {
    mockResolveSessionByToken.mockResolvedValue(fakeUser);
    dbReturns([{ owner_id: fakeUser.id, visibility: 'private' }]);

    const result = await callOnAuthenticate(server, {
      token: 'valid-token',
      documentName: 'my-private-scene',
    });

    expect(result).toMatchObject({ userId: fakeUser.id, githubLogin: fakeUser.github_login });
  });

  it('allows non-owner access to a public scene', async () => {
    mockResolveSessionByToken.mockResolvedValue(fakeUser);
    dbReturns([{ owner_id: 'other-user', visibility: 'public' }]);

    const result = await callOnAuthenticate(server, {
      token: 'valid-token',
      documentName: 'public-scene',
    });

    expect(result).toMatchObject({ userId: fakeUser.id });
  });

  it('falls back to Cookie header when token field is empty', async () => {
    mockResolveSessionByToken.mockResolvedValue(fakeUser);
    dbReturns([{ owner_id: fakeUser.id, visibility: 'private' }]);

    const result = await callOnAuthenticate(server, {
      token: '',
      documentName: 'scene-via-cookie',
      requestHeaders: new Headers({ cookie: 'session=cookie-token-value; Path=/' }),
    });

    expect(mockResolveSessionByToken).toHaveBeenCalledWith('cookie-token-value');
    expect(result).toMatchObject({ userId: fakeUser.id });
  });
});
