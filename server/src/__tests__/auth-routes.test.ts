/**
 * Unit tests for auth routes.
 *
 * Strategy: mock the db module so no real Postgres connection is needed.
 * The Hono app is exercised via `app.request()` — no network required.
 *
 * Covered:
 *   GET /auth/me  — happy path (valid session cookie → 200 + user payload)
 *   GET /auth/me  — 401 path (no cookie / unknown session)
 *   POST /auth/signout — happy path (cookie present → 200 + deletes session)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mock the db module BEFORE importing anything that depends on it.
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockInsert = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    delete: mockDelete,
    insert: mockInsert,
  },
  pool: {},
}));

// ---------------------------------------------------------------------------
// Import the router under test AFTER the mock is registered.
// ---------------------------------------------------------------------------

const { authRoutes } = await import('../routes/auth.js');

// Build a minimal Hono app that mirrors index.ts mounting
const app = new Hono();
app.route('/auth', authRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Request with an optional Cookie header */
function makeRequest(path: string, options: RequestInit & { cookie?: string } = {}): Request {
  const { cookie, ...init } = options;
  const headers = new Headers(init.headers);
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

// ---------------------------------------------------------------------------
// /auth/me
// ---------------------------------------------------------------------------

describe('GET /auth/me', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with user payload when session is valid', async () => {
    const fakeExpiry = new Date(Date.now() + 60_000); // 1 minute in the future

    // db.select() is called as a chained builder: .from().innerJoin().where().limit()
    // We simulate the full chain returning a resolved row.
    const chainResult = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: 'user-uuid-1',
          github_id: 12345,
          github_login: 'alice',
          email: 'alice@example.com',
          avatar_url: 'https://avatars.githubusercontent.com/u/12345',
          handle: 'alice',
          storage_used: 0,
          expires_at: fakeExpiry,
        },
      ]),
    };
    mockSelect.mockReturnValue(chainResult);

    const res = await app.request(
      makeRequest('/auth/me', { cookie: 'session=valid-token-hex' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: 'user-uuid-1',
      github_login: 'alice',
      email: 'alice@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345',
    });
    expect(body).not.toHaveProperty('github_id');
    expect(body).not.toHaveProperty('handle');
    expect(body).not.toHaveProperty('storage_used');
  });

  it('returns 401 when no session cookie is present', async () => {
    // No db call should be made — the resolver exits early on missing cookie
    const res = await app.request(makeRequest('/auth/me'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns 401 when session token is not found in db', async () => {
    const chainResult = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // empty result
    };
    mockSelect.mockReturnValue(chainResult);

    const res = await app.request(
      makeRequest('/auth/me', { cookie: 'session=unknown-token' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when session is expired', async () => {
    const pastExpiry = new Date(Date.now() - 1000); // 1 second in the past

    const chainResult = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: 'user-uuid-1',
          github_id: 12345,
          github_login: 'alice',
          email: 'alice@example.com',
          avatar_url: null,
          handle: null,
          storage_used: 0,
          expires_at: pastExpiry,
        },
      ]),
    };
    mockSelect.mockReturnValue(chainResult);

    const res = await app.request(
      makeRequest('/auth/me', { cookie: 'session=expired-token' }),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/signout
// ---------------------------------------------------------------------------

describe('POST /auth/signout', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 and clears the cookie when session exists', async () => {
    // db.delete() chain: .where() returns a promise
    const deleteChain = {
      where: vi.fn().mockResolvedValue(undefined),
    };
    mockDelete.mockReturnValue(deleteChain);

    const res = await app.request(
      makeRequest('/auth/signout', { method: 'POST', cookie: 'session=some-valid-token' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });

    // Verify db.delete was called (session row removed)
    expect(mockDelete).toHaveBeenCalledTimes(1);

    // Verify Set-Cookie clears the session (max-age=0 or expires in past)
    const setCookieHeader = res.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toMatch(/session=/);
    expect(setCookieHeader).toMatch(/max-age=0/i);
  });

  it('returns 200 even when no session cookie is present', async () => {
    // No db.delete call — deleteSession no-ops without a cookie
    const res = await app.request(
      makeRequest('/auth/signout', { method: 'POST' }),
    );

    expect(res.status).toBe(200);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
