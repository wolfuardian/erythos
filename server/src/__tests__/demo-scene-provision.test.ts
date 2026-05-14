/**
 * Demo scene provisioning — server unit tests
 *
 * Verifies that provisionDemoScene() fires on user CREATE in both auth paths
 * (GitHub OAuth callback + magic-link verify) and does NOT fire on FIND
 * (existing-user login).
 *
 * Strategy: mock db module; inspect mockTransaction call count and the inserts
 * that go through it. The provisioner inserts one scenes row + one scene_versions
 * row inside the same transaction as the user-insert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { Resend } from 'resend';

// ---------------------------------------------------------------------------
// Mock db BEFORE importing modules that depend on it
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: mockTransaction,
  },
  pool: {},
}));

// Mock Resend so magic-link tests don't hit the network
vi.mock('resend', () => ({
  Resend: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import routers under test AFTER mocks
// ---------------------------------------------------------------------------

const { authRoutes } = await import('../routes/auth.js');
const { magicLinkRoutes } = await import('../routes/magic-link.js');
const { _resetRateLimit } = await import('../middleware/rate-limit.js');

const app = new Hono();
const api = new Hono();
api.route('/auth', authRoutes);
api.route('/auth/magic-link', magicLinkRoutes);
app.route('/api', api);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, options: RequestInit & { cookie?: string; ip?: string } = {}): Request {
  const { cookie, ip, ...init } = options;
  const headers = new Headers(init.headers as Record<string, string> | undefined);
  if (cookie) headers.set('Cookie', cookie);
  if (ip) headers.set('X-Forwarded-For', ip);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

/** Build a select chain that resolves to given rows */
function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** insert chain: values().returning() */
function insertReturning(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

/** insert chain: values() (no returning) */
function insertNoReturn() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

/** update chain: set().where() */
function updateChain() {
  return {
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  };
}

/** update chain with atomic returning (magic-link Phase 1 claim) */
function updateReturningChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

const TEST_SECRET = 'test-session-secret-for-provision';

function buildValidState(secret: string): string {
  const { createHmac, randomBytes } = require('node:crypto') as typeof import('node:crypto');
  const timestamp = Date.now().toString(36);
  const nonce = randomBytes(16).toString('hex');
  const payload = `${timestamp}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const originalEnv = process.env;

beforeEach(() => {
  vi.resetAllMocks();
  _resetRateLimit();
  vi.mocked(Resend).mockImplementation(
    () => ({ emails: { send: vi.fn().mockResolvedValue({ id: 'x' }) } }) as unknown as Resend,
  );
  process.env = {
    ...originalEnv,
    SESSION_SECRET: TEST_SECRET,
    GITHUB_CLIENT_ID: 'fake-client-id',
    GITHUB_CLIENT_SECRET: 'fake-client-secret',
  };
});

// ---------------------------------------------------------------------------
// GitHub OAuth path
// ---------------------------------------------------------------------------

describe('GitHub OAuth — demo scene provisioning', () => {
  function stubGitHubFetch(user: { id: number; login: string; email: string; avatar_url: null }) {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'gho_fake', token_type: 'bearer', scope: 'user:email' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(user),
        }),
    );
  }

  it('fires provisionDemoScene when user is new (inserted=true)', async () => {
    const state = buildValidState(TEST_SECRET);
    stubGitHubFetch({ id: 1001, login: 'newuser', email: 'new@example.com', avatar_url: null });

    // inserted=true → new user
    let insertCalls = 0;
    mockInsert.mockImplementation(() => {
      insertCalls++;
      if (insertCalls === 1) {
        // users upsert inside tx
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'new-user-uuid', inserted: true }]),
            }),
          }),
        };
      }
      // scenes (2) + scene_versions (3) inside tx, sessions (4) outside tx
      return insertNoReturn();
    });

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = { insert: mockInsert };
      return cb(fakeTx);
    });

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?code=valid-code&state=${encodeURIComponent(state)}`, {
        cookie: `oauth_state=${state}`,
      }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // 4 inserts: users(1) + scenes(2) + scene_versions(3) inside tx, sessions(4) outside
    expect(mockInsert).toHaveBeenCalledTimes(4);
  });

  it('does NOT fire provisionDemoScene when user already exists (inserted=false)', async () => {
    const state = buildValidState(TEST_SECRET);
    stubGitHubFetch({ id: 2002, login: 'existinguser', email: 'existing@example.com', avatar_url: null });

    let insertCalls = 0;
    mockInsert.mockImplementation(() => {
      insertCalls++;
      if (insertCalls === 1) {
        // users upsert inside tx — existing user
        return {
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'existing-user-uuid', inserted: false }]),
            }),
          }),
        };
      }
      // sessions insert outside tx
      return insertNoReturn();
    });

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = { insert: mockInsert };
      return cb(fakeTx);
    });

    const res = await app.request(
      makeRequest(`/api/auth/github/callback?code=valid-code&state=${encodeURIComponent(state)}`, {
        cookie: `oauth_state=${state}`,
      }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Only 2 inserts: users upsert (in tx) + sessions (outside tx)
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Magic-link path
// ---------------------------------------------------------------------------

describe('Magic-link — demo scene provisioning', () => {
  const future = () => new Date(Date.now() + 60_000);

  function claimedTokenRow(email: string) {
    return {
      id: 'tok-1',
      tokenHash: 'somehex',
      email,
      userId: null,
      expiresAt: future(),
      usedAt: new Date(),
      createdAt: new Date(),
    };
  }

  it('fires provisionDemoScene when user is new (no existing user row)', async () => {
    // Phase 1: atomic UPDATE claims the token
    let updateCalls = 0;
    mockUpdate.mockImplementation(() => {
      updateCalls++;
      if (updateCalls === 1) return updateReturningChain([claimedTokenRow('brand-new@example.com')]);
      return updateChain();
    });
    // Phase 3: SELECT user lookup — empty (new user)
    mockSelect.mockReturnValue(selectChain([]));

    let insertCalls = 0;
    mockInsert.mockImplementation(() => {
      insertCalls++;
      if (insertCalls === 1) {
        // users insert inside tx
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'fresh-user-uuid' }]),
          }),
        };
      }
      // scenes (2) + scene_versions (3) inside tx, sessions (4) outside tx
      return insertNoReturn();
    });

    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = { insert: mockInsert };
      return cb(fakeTx);
    });

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=abc123', { ip: '1.2.3.4' }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // users(1) + scenes(2) + scene_versions(3) inside tx, sessions(4) outside tx
    expect(mockInsert).toHaveBeenCalledTimes(4);
  });

  it('does NOT fire provisionDemoScene when user already exists (FIND path)', async () => {
    // Phase 1: atomic UPDATE claims the token
    let updateCalls = 0;
    mockUpdate.mockImplementation(() => {
      updateCalls++;
      if (updateCalls === 1) return updateReturningChain([claimedTokenRow('existing@example.com')]);
      return updateChain();
    });
    // Phase 3: SELECT user lookup — found (existing user)
    mockSelect.mockReturnValue(selectChain([{ id: 'existing-user-uuid' }]));

    // Only sessions insert runs (createSession), no user or scene inserts
    mockInsert.mockReturnValue(insertNoReturn());

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=abc456', { ip: '5.6.7.8' }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    // No transaction for FIND path
    expect(mockTransaction).not.toHaveBeenCalled();
    // Only 1 insert: sessions (createSession)
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
