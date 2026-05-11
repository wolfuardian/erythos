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
 *   GET /auth/github/callback — state cookie missing → 302 auth_error=invalid_state
 *   GET /auth/github/callback — HMAC mismatch → 302 auth_error=invalid_state
 *   GET /auth/github/callback — state expired (TTL) → 302 auth_error=invalid_state
 *   GET /auth/github/callback — code query missing → 302 auth_error=missing_code
 *   GET /auth/github/callback — GitHub token exchange fail → 302 auth_error=oauth_failed
 *   GET /auth/github/callback — happy path → 302 / + Set-Cookie session
 *
 * Note: The callback route uses 302 redirects with auth_error query params for all
 * error states (not 400/502 status codes as originally spec'd in issue #941).
 * Tests assert the actual implementation behavior.
 *
 * Note: verifyOAuthState() pure unit tests are skipped — the symbol is not
 * exported from auth.ts. Coverage is achieved via the callback integration tests above.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const api = new Hono();
api.route('/auth', authRoutes);
app.route('/api', api);

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
      makeRequest('/api/auth/me', { cookie: 'session=valid-token-hex' }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: 'user-uuid-1',
      github_login: 'alice',
      email: 'alice@example.com',
      avatar_url: 'https://avatars.githubusercontent.com/u/12345',
    });
    expect(body).not.toHaveProperty('github_id');
    expect(body).not.toHaveProperty('handle');
    expect(body).not.toHaveProperty('storage_used');
    // storage quota field — exposed as camelCase (refs #957)
    expect(body['storageUsed']).toBeTypeOf('number');
    expect(body['storageUsed']).toBeGreaterThanOrEqual(0);
  });

  it('returns 401 when no session cookie is present', async () => {
    // No db call should be made — the resolver exits early on missing cookie
    const res = await app.request(makeRequest('/api/auth/me'));
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
      makeRequest('/api/auth/me', { cookie: 'session=unknown-token' }),
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
      makeRequest('/api/auth/me', { cookie: 'session=expired-token' }),
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
      makeRequest('/api/auth/signout', { method: 'POST', cookie: 'session=some-valid-token' }),
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
      makeRequest('/api/auth/signout', { method: 'POST' }),
    );

    expect(res.status).toBe(200);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /auth/github/callback
//
// The route always responds with 302 redirects:
//   - Errors  → /?auth_error=<code>
//   - Success → /
//
// Env setup: SESSION_SECRET and GitHub OAuth credentials are required by
// createOAuthState / verifyOAuthState / exchangeCodeForToken.
// ---------------------------------------------------------------------------

/** Build a valid signed OAuth state for a given SESSION_SECRET */
function buildValidState(secret: string): string {
  const { createHmac, randomBytes } = require('node:crypto') as typeof import('node:crypto');
  const timestamp = Date.now().toString(36);
  const nonce = randomBytes(16).toString('hex');
  const payload = `${timestamp}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** Build an expired OAuth state (timestamp 11 minutes in the past) */
function buildExpiredState(secret: string): string {
  const { createHmac, randomBytes } = require('node:crypto') as typeof import('node:crypto');
  const past = Date.now() - 11 * 60 * 1000; // 11 minutes ago, beyond 10-min TTL
  const timestamp = past.toString(36);
  const nonce = randomBytes(16).toString('hex');
  const payload = `${timestamp}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

const TEST_SECRET = 'test-session-secret-for-vitest';
const FAKE_CLIENT_ID = 'fake-github-client-id';
const FAKE_CLIENT_SECRET = 'fake-github-client-secret';

describe('GET /auth/github/callback', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    // Set required env vars
    process.env = {
      ...originalEnv,
      SESSION_SECRET: TEST_SECRET,
      GITHUB_CLIENT_ID: FAKE_CLIENT_ID,
      GITHUB_CLIENT_SECRET: FAKE_CLIENT_SECRET,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('redirects to /?auth_error=missing_code when code query param is absent', async () => {
    const state = buildValidState(TEST_SECRET);

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?state=${encodeURIComponent(state)}`, {
        cookie: `oauth_state=${state}`,
      }),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('auth_error=missing_code');
  });

  it('redirects to /?auth_error=invalid_state when state cookie is missing', async () => {
    const state = buildValidState(TEST_SECRET);

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?code=some-code&state=${encodeURIComponent(state)}`),
      // No cookie header — state cookie absent
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('auth_error=invalid_state');
  });

  it('redirects to /?auth_error=invalid_state when HMAC is wrong', async () => {
    const validState = buildValidState(TEST_SECRET);
    // Tamper the signature by replacing it with garbage
    const parts = validState.split('.');
    const tampered = `${parts[0]}.${parts[1]}.deadbeef`;

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?code=some-code&state=${encodeURIComponent(tampered)}`, {
        cookie: `oauth_state=${validState}`,
      }),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('auth_error=invalid_state');
  });

  it('redirects to /?auth_error=invalid_state when state TTL is expired', async () => {
    const expiredState = buildExpiredState(TEST_SECRET);

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?code=some-code&state=${encodeURIComponent(expiredState)}`, {
        cookie: `oauth_state=${expiredState}`,
      }),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('auth_error=invalid_state');
  });

  it('redirects to /?auth_error=oauth_failed when GitHub token exchange fails', async () => {
    const state = buildValidState(TEST_SECRET);

    // Mock fetch: GitHub returns 401 on token exchange
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'bad_verification_code' }),
      }),
    );

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?code=bad-code&state=${encodeURIComponent(state)}`, {
        cookie: `oauth_state=${state}`,
      }),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('auth_error=oauth_failed');
  });

  it('happy path → 302 redirect to / with Set-Cookie session', async () => {
    const state = buildValidState(TEST_SECRET);

    const fakeAccessToken = 'gho_fake_access_token';
    const fakeGitHubUser = {
      id: 99999,
      login: 'testuser',
      avatar_url: 'https://avatars.githubusercontent.com/u/99999',
      email: 'testuser@example.com',
    };

    // Mock fetch calls in order:
    // 1. POST GITHUB_TOKEN_URL → access_token
    // 2. GET GITHUB_USER_URL → user info
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: fakeAccessToken, token_type: 'bearer', scope: 'user:email' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(fakeGitHubUser),
        }),
    );

    // Mock db.insert chain (createSession also inserts into sessions table)
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoUpdate: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'new-user-uuid' }]),
    };
    // Second insert: sessions table (no returning needed, just resolves)
    const sessionInsertChain = {
      values: vi.fn().mockResolvedValue(undefined),
    };
    mockInsert
      .mockReturnValueOnce(insertChain)       // users upsert
      .mockReturnValueOnce(sessionInsertChain); // sessions insert

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?code=valid-code&state=${encodeURIComponent(state)}`, {
        cookie: `oauth_state=${state}`,
      }),
    );

    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toBe('/');

    // Verify session cookie was set
    const setCookieHeader = res.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toMatch(/session=/);
  });
});
