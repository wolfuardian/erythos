/**
 * Unit tests for scene routes (D4 + G3).
 *
 * Strategy: mock db module so no real Postgres connection is needed.
 * Hono app exercised via app.request() — no network required.
 *
 * Covered:
 *   GET  /scenes         — happy 200 (caller-owned list), 401 (no auth) [G3]
 *   GET  /scenes/:id     — happy path (public), 404 (not found), 404 (private, not owner),
 *                          200 (private, owner), 401-not-applicable (GET is anonymous-friendly)
 *   PUT  /scenes/:id     — happy, 409 version mismatch, 412 format wrong, 428 missing header,
 *                          401 (no auth), 404 (non-owner, no-leak consistency)
 *   POST /scenes         — happy 201, 401 (no auth)
 *   PATCH /scenes/:id/visibility — happy 200, 401 (no auth), 404 (non-owner)
 *   POST /scenes/:id/fork — happy 201, 401 (no auth), 404 (private non-owner source)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    transaction: mockTransaction,
  },
  pool: {},
}));

// resolveSession — by default returns null (unauthenticated)
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
// Import router under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { sceneRoutes } = await import('../routes/scenes.js');

const app = new Hono();
const api = new Hono();
api.route('/scenes', sceneRoutes);
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

/** Fake authenticated user */
const FAKE_USER = {
  id: 'user-1',
  github_id: 1,
  github_login: 'alice',
  email: 'alice@example.com',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  handle: 'alice',
  storage_used: 0,
};
/** A different user id (for non-owner tests) */
const OTHER_USER_ID = 'user-other';

/** Build a select chain that returns a given array on final await */
function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** Build a chainable update mock */
function updateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
}

/** A minimal fake scene row */
function fakeScene(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
    owner_id: FAKE_USER.id,
    name: 'My Scene',
    version: 5,
    body: Buffer.from(JSON.stringify({ nodes: [] }), 'utf8'),
    body_size: 12,
    visibility: 'public',
    forked_from: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /scenes/:id
// ---------------------------------------------------------------------------

describe('GET /scenes/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(null); // anonymous by default
  });

  it('returns 200 with scene payload for public scene (anonymous)', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene()]));

    const res = await app.request(makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11'));

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
      owner_id: FAKE_USER.id,
      name: 'My Scene',
      version: 5,
      visibility: 'public',
      forked_from: null,
    });
    // body should be parsed JSON object, not Buffer
    expect(typeof body['body']).toBe('object');
    expect(res.headers.get('ETag')).toBe('"5"');
  });

  it('returns 404 when scene does not exist', async () => {
    mockSelect.mockReturnValue(selectChain([]));

    const res = await app.request(makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa99'));
    expect(res.status).toBe(404);
  });

  it('returns 400 with error code when id is not a UUID (e.g. /scenes/me)', async () => {
    // Pre-middleware behaviour: bad id → Postgres uuid driver throws → opaque 500.
    // Now caught at route entry with explicit code so callers / agents can pin it.
    const res = await app.request(makeRequest('/api/scenes/me'));
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.code).toBe('E1002 ERR_SCENE_ID_FORMAT');
    expect(body.error).toMatch(/UUID/i);
    // Middleware short-circuits before DB call
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns 404 for private scene when caller is not owner (anonymous)', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene({ visibility: 'private' })]));

    const res = await app.request(makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11'));
    expect(res.status).toBe(404);
  });

  it('returns 200 for private scene when caller is the owner', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);
    mockSelect.mockReturnValue(selectChain([fakeScene({ visibility: 'private' })]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', { cookie: 'session=valid-token' }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 for private scene when caller is a different user', async () => {
    mockResolveSession.mockResolvedValue({ ...FAKE_USER, id: OTHER_USER_ID });
    mockSelect.mockReturnValue(selectChain([fakeScene({ visibility: 'private' })]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', { cookie: 'session=other-token' }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /scenes/:id
// ---------------------------------------------------------------------------

describe('PUT /scenes/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('returns 200 with new version on successful push', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene({ version: 5 })]));
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn().mockReturnValue(updateChain()),
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      };
      return fn(tx);
    });

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"5"',
        },
        body: JSON.stringify({ nodes: [{ id: 'n1' }] }),
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ version: 6 });
    expect(res.headers.get('ETag')).toBe('"6"');
  });

  it('returns 409 when server version is ahead of base version', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene({ version: 7 })]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"5"', // client thinks version is 5, server is at 7
        },
        body: JSON.stringify({ nodes: [] }),
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(409);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ current_version: 7 });
    expect(typeof body.current_body).toBe('object');
    expect(res.headers.get('ETag')).toBe('"7"');
  });

  it('returns 412 when If-Match header is malformed (unquoted)', async () => {
    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '5' }, // unquoted
        body: JSON.stringify({ nodes: [] }),
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(412);
  });

  it('returns 412 when If-Match contains non-integer', async () => {
    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"abc"' },
        body: JSON.stringify({ nodes: [] }),
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(412);
  });

  it('returns 428 when If-Match header is missing', async () => {
    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: [] }),
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(428);
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': '"5"' },
        body: JSON.stringify({ nodes: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when caller is not the owner (no existence leak)', async () => {
    mockResolveSession.mockResolvedValue({ ...FAKE_USER, id: OTHER_USER_ID });
    mockSelect.mockReturnValue(selectChain([fakeScene({ version: 5 })]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"5"',
        },
        body: JSON.stringify({ nodes: [] }),
        cookie: 'session=other-token',
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /scenes
// ---------------------------------------------------------------------------

describe('POST /scenes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('returns 201 with id and version=0 on successful create', async () => {
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      };
      return fn(tx);
    });

    const res = await app.request(
      makeRequest('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Scene', body: { nodes: [] } }),
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('string');
    expect(body.version).toBe(0);
    expect(res.headers.get('Location')).toMatch(/^\/api\/scenes\//);
    expect(res.headers.get('ETag')).toBe('"0"');
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(
      makeRequest('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Scene', body: { nodes: [] } }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.request(
      makeRequest('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: { nodes: [] } }),
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /scenes/:id/visibility
// ---------------------------------------------------------------------------

describe('PATCH /scenes/:id/visibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('returns 200 on successful visibility change', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene({ visibility: 'public' })]));
    mockUpdate.mockReturnValue(updateChain());

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'private' }),
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', visibility: 'private' });
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when caller is not the owner (no existence leak)', async () => {
    mockResolveSession.mockResolvedValue({ ...FAKE_USER, id: OTHER_USER_ID });
    mockSelect.mockReturnValue(selectChain([fakeScene()]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'public' }),
        cookie: 'session=other-token',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid visibility value', async () => {
    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'unlisted' }),
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /scenes/:id/fork
// ---------------------------------------------------------------------------

describe('POST /scenes/:id/fork', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('returns 201 with new id, version=0, forked_from on successful fork of public scene', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene({ visibility: 'public' })]));
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      };
      return fn(tx);
    });

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Fork' }),
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('string');
    expect(body.version).toBe(0);
    expect(body.forked_from).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11');
    expect(res.headers.get('Location')).toMatch(/^\/api\/scenes\//);
    expect(res.headers.get('ETag')).toBe('"0"');
  });

  it('returns 201 when owner forks own private scene', async () => {
    mockSelect.mockReturnValue(
      selectChain([fakeScene({ visibility: 'private', owner_id: FAKE_USER.id })]),
    );
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      };
      return fn(tx);
    });

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(201);
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when source scene is private and caller is not owner', async () => {
    mockResolveSession.mockResolvedValue({ ...FAKE_USER, id: OTHER_USER_ID });
    mockSelect.mockReturnValue(
      selectChain([fakeScene({ visibility: 'private', owner_id: FAKE_USER.id })]),
    );

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        cookie: 'session=other-token',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when source scene does not exist', async () => {
    mockSelect.mockReturnValue(selectChain([]));

    const res = await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa99/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        cookie: 'session=valid-token',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('uses source name + " (fork)" when no name is provided', async () => {
    mockSelect.mockReturnValue(selectChain([fakeScene({ name: 'Cool Scene', visibility: 'public' })]));

    // Capture all calls to tx.insert(...).values(...) — first call is scenes insert
    const insertedValues: unknown[] = [];
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockImplementation((vals: unknown) => {
            insertedValues.push(vals);
            return Promise.resolve(undefined);
          }),
        }),
      };
      return fn(tx);
    });

    await app.request(
      makeRequest('/api/scenes/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // no name
        cookie: 'session=valid-token',
      }),
    );

    // First insert is the scenes row — check its name field
    const scenesInsertArgs = insertedValues[0] as { name?: string };
    expect(scenesInsertArgs.name).toBe('Cool Scene (fork)');
  });
});

// ---------------------------------------------------------------------------
// GET /scenes — cloud project list (G3)
// ---------------------------------------------------------------------------

describe('GET /api/scenes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with caller-owned scenes when authenticated', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);
    const fakeNow = new Date().toISOString();
    const fakeSceneRows = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11',
        name: 'My Scene',
        version: 3,
        visibility: 'private',
        forked_from: null,
        created_at: fakeNow,
        updated_at: fakeNow,
      },
    ];
    // selectChain for list: from → where → resolves (no limit call)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(fakeSceneRows),
      }),
    });

    const res = await app.request(
      makeRequest('/api/scenes', { cookie: 'session=valid-token' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { scenes: unknown[] };
    expect(Array.isArray(body.scenes)).toBe(true);
    expect(body.scenes).toHaveLength(1);
    expect((body.scenes[0] as Record<string, unknown>).id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11');
  });

  it('returns 200 with empty array when user has no scenes', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await app.request(
      makeRequest('/api/scenes', { cookie: 'session=valid-token' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { scenes: unknown[] };
    expect(body.scenes).toHaveLength(0);
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(makeRequest('/api/scenes'));
    expect(res.status).toBe(401);
  });
});
