/**
 * Unit tests for share token routes (G5, refs #1012).
 *
 * Covered:
 *   POST   /scenes/:id/share-tokens      — happy 201, 401 no-auth, 404 non-owner/missing
 *   GET    /scenes/:id/share-tokens      — happy 200 (active+revoked), 401 no-auth, 404 non-owner
 *   DELETE /scenes/:id/share-tokens/:tok — happy 204 (fresh), 204 (already revoked idempotent),
 *                                          401 no-auth, 404 non-owner, 404 token missing
 *
 *   GET /scenes/:id?share_token=<tok>  — valid token bypasses visibility on private scene (200),
 *                                        invalid/revoked token → 404,
 *                                        no token on private → 404 (existing behaviour preserved)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    transaction: vi.fn(),
  },
  pool: {},
}));

type AuthUser = {
  id: string;
  github_id: number;
  github_login: string;
  email: string;
  avatar_url: string | null;
  handle: string | null;
  storage_used: number;
} | null;
const mockResolveSession = vi.fn<() => Promise<AuthUser>>();

vi.mock('../auth.js', () => ({
  resolveSession: (...args: unknown[]) => mockResolveSession(...(args as [])),
  SESSION_COOKIE: 'session',
}));

// ---------------------------------------------------------------------------
// Import routers under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { shareTokenRoutes } = await import('../routes/share-tokens.js');
const { sceneRoutes } = await import('../routes/scenes.js');

const app = new Hono();
const api = new Hono();
api.route('/scenes', sceneRoutes);
api.route('/scenes', shareTokenRoutes);
app.route('/api', api);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  path: string,
  options: RequestInit & { cookie?: string } = {},
): Request {
  const { cookie, ...init } = options;
  const headers = new Headers(init.headers as Record<string, string> | undefined);
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const FAKE_USER = {
  id: 'user-1',
  github_id: 1,
  github_login: 'alice',
  email: 'alice@example.com',
  avatar_url: null,
  handle: 'alice',
  storage_used: 0,
};
const OTHER_USER_ID = 'user-other';

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
}

function fakeScene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
    owner_id: FAKE_USER.id,
    name: 'My Scene',
    version: 5,
    body: Buffer.from(JSON.stringify({ nodes: [] }), 'utf8'),
    body_size: 12,
    visibility: 'private',
    forked_from: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function fakeToken(overrides: Record<string, unknown> = {}) {
  return {
    token: 'abc123deadbeef00abc123deadbeef00',
    scene_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
    created_by: FAKE_USER.id,
    created_at: new Date(),
    revoked_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /scenes/:id/share-tokens
// ---------------------------------------------------------------------------

describe('POST /scenes/:id/share-tokens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('returns 201 with token, url, created_at on success', async () => {
    // First select: scenes lookup; second: won't be called (insert only)
    mockSelect.mockReturnValueOnce(selectChain([fakeScene()]));
    mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.token).toBe('string');
    expect((body.token as string).length).toBe(32); // 16 bytes = 32 hex chars
    expect(typeof body.url).toBe('string');
    expect((body.url as string)).toContain('/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11?share_token=');
    expect(typeof body.created_at).toBe('string');
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when scene does not exist', async () => {
    mockSelect.mockReturnValue(selectChain([]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa99/share-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when caller is not the scene owner', async () => {
    mockResolveSession.mockResolvedValue({ ...FAKE_USER, id: OTHER_USER_ID });
    mockSelect.mockReturnValue(selectChain([fakeScene()])); // owner is FAKE_USER.id

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        cookie: 'session=other-token',
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /scenes/:id/share-tokens
// ---------------------------------------------------------------------------

describe('GET /scenes/:id/share-tokens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('returns 200 with token list (including revoked)', async () => {
    // First select: scenes; second: tokens
    mockSelect
      .mockReturnValueOnce(selectChain([fakeScene()]))
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          fakeToken({ revoked_at: null }),
          fakeToken({ token: 'revoked000', revoked_at: new Date('2026-01-01') }),
        ]),
      });

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens', {
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { tokens: unknown[] };
    expect(Array.isArray(body.tokens)).toBe(true);
    expect(body.tokens.length).toBe(2);
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);
    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when caller is not the scene owner', async () => {
    mockResolveSession.mockResolvedValue({ ...FAKE_USER, id: OTHER_USER_ID });
    mockSelect.mockReturnValue(selectChain([fakeScene()]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens', {
        cookie: 'session=other-token',
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /scenes/:id/share-tokens/:token
// ---------------------------------------------------------------------------

describe('DELETE /scenes/:id/share-tokens/:token', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('returns 204 when token is successfully revoked', async () => {
    mockSelect
      .mockReturnValueOnce(selectChain([fakeScene()]))           // owner check
      .mockReturnValueOnce(selectChain([fakeToken()]));           // token existence check
    mockUpdate.mockReturnValue(updateChain());

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens/abc123deadbeef00abc123deadbeef00', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:5173' },
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(204);
  });

  it('returns 204 (idempotent) when token is already revoked', async () => {
    const revokedToken = fakeToken({ revoked_at: new Date('2026-01-01') });
    mockSelect
      .mockReturnValueOnce(selectChain([fakeScene()]))
      .mockReturnValueOnce(selectChain([revokedToken]));
    mockUpdate.mockReturnValue(updateChain());

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens/abc123deadbeef00abc123deadbeef00', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:5173' },
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(204);
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);
    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens/sometoken', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:5173' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when scene does not exist or caller is not owner', async () => {
    mockSelect.mockReturnValue(selectChain([])); // scene not found

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens/sometoken', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:5173' },
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when token does not exist for this scene', async () => {
    mockSelect
      .mockReturnValueOnce(selectChain([fakeScene()]))  // owner check passes
      .mockReturnValueOnce(selectChain([]));            // token not found

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/share-tokens/nosuchtoken', {
        method: 'DELETE',
        headers: { Origin: 'http://localhost:5173' },
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /scenes/:id?share_token=<token>  (extended scene route)
// ---------------------------------------------------------------------------

describe('GET /scenes/:id?share_token', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(null); // anonymous by default
  });

  it('returns 200 when valid active share_token provided for private scene', async () => {
    mockSelect
      .mockReturnValueOnce(selectChain([fakeScene({ visibility: 'private' })]))  // scene lookup
      .mockReturnValueOnce(selectChain([fakeToken()]));                           // token lookup

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11?share_token=abc123deadbeef00abc123deadbeef00'),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11');
    expect(body.visibility).toBe('private');
  });

  it('returns 404 when share_token is invalid (not found in DB)', async () => {
    mockSelect
      .mockReturnValueOnce(selectChain([fakeScene({ visibility: 'private' })]))
      .mockReturnValueOnce(selectChain([])); // token not found

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11?share_token=invalidtoken'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when share_token is revoked', async () => {
    const revokedToken = fakeToken({ revoked_at: new Date('2026-01-01') });
    // The DB query uses isNull(revoked_at), so revoked tokens won't match — simulate with empty array
    mockSelect
      .mockReturnValueOnce(selectChain([fakeScene({ visibility: 'private' })]))
      .mockReturnValueOnce(selectChain([])); // revoked token filtered out by isNull condition

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11?share_token=revokedtoken'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for private scene without share_token (existing behaviour preserved)', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene({ visibility: 'private' })]));

    const res = await app.request(makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11'));
    expect(res.status).toBe(404);
  });
});
