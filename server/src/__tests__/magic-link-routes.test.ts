/**
 * Unit tests for magic link routes (F-5 spec § REST API + § Rate Limit).
 *
 * Strategy: mock the db module so no real Postgres connection is needed.
 * App is exercised via app.request() — no network. Rate-limit state is
 * reset between tests via _resetRateLimit().
 *
 * Covered:
 *   POST /api/auth/magic-link/request
 *     - 200 ok with valid email + token stored as sha256 (not plaintext)
 *     - 400 invalid_email on malformed email
 *     - 400 on malformed JSON body
 *     - 200 silently absorbed on per-email rate-limit (anti-enumeration)
 *     - 429 rate_limited on per-IP rate-limit (>10/h)
 *     - 200 + Resend .emails.send called when RESEND_API_KEY is set (C3)
 *     - 200 + console.log stub when RESEND_API_KEY is unset (C3)
 *     - 200 even when Resend .emails.send throws (anti-enumeration, C3)
 *
 *   GET /api/auth/magic-link/verify  (atomic UPDATE pattern — refs #990)
 *     - 302 /?auth_error=invalid when no token query
 *     - 302 /?auth_error=invalid when token hash not in DB (0-row UPDATE + 0-row SELECT)
 *     - 302 /?auth_error=expired when expires_at past (claimed atomically, burned)
 *     - 302 /?auth_error=used when used_at already set (0-row UPDATE + row found with usedAt)
 *     - 302 / + Set-Cookie session on success (existing user)
 *     - 302 / + new user INSERT (github_id=null) when email new
 *     - 302 /?auth_error=rate_limited on per-IP verify limit (>20/min)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { Resend } from 'resend';

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

// Mock Resend SDK so tests don't make real HTTP calls.
// mockResendSend is the spy on emails.send; we restore the Resend constructor
// implementation after each vi.resetAllMocks() call in beforeEach.
const mockResendSend = vi.fn().mockResolvedValue({ id: 'mock-email-id' });

vi.mock('resend', () => ({
  Resend: vi.fn(),
}));

// recordAudit is fire-and-forget; mock it out so it doesn't hit db.insert
// or cause flaky call-count assertions in these route tests.
vi.mock('../audit/recordAudit.js', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined),
  extractActorIp: vi.fn().mockReturnValue(''),
  maskEmail: vi.fn().mockReturnValue(''),
}));

const { magicLinkRoutes } = await import('../routes/magic-link.js');
const { _resetRateLimit } = await import('../middleware/rate-limit.js');

const app = new Hono();
const api = new Hono();
api.route('/auth/magic-link', magicLinkRoutes);
app.route('/api', api);

function makeRequest(
  path: string,
  options: RequestInit & { ip?: string } = {},
): Request {
  const { ip, ...init } = options;
  const headers = new Headers(init.headers);
  if (ip) headers.set('X-Forwarded-For', ip);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

/** Build a select chain that resolves to a given array of rows */
function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** Build an insert chain that resolves (no .returning) */
function insertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

/** Build an insert chain with .returning() */
function insertReturningChain(returnRows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnRows),
    }),
  };
}

/** Build an update chain that resolves (no returning — used for bookkeeping Phase 4) */
function updateChain() {
  return {
    set: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  };
}

/** Build an update chain with .returning() — used for Phase 1 atomic claim */
function updateReturningChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  _resetRateLimit();
  // vi.resetAllMocks() clears the Resend constructor mock implementation.
  // Re-apply it so tests that set RESEND_API_KEY get a proper mock instance.
  mockResendSend.mockResolvedValue({ id: 'mock-email-id' });
  vi.mocked(Resend).mockImplementation(
    () => ({ emails: { send: mockResendSend } }) as unknown as Resend,
  );
  // Default transaction mock: execute the callback synchronously with a fake tx.
  // Tests that verify transaction internals override this per-test.
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const fakeTx = { insert: mockInsert, update: mockUpdate, select: mockSelect };
    return cb(fakeTx);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/magic-link/request
// ---------------------------------------------------------------------------

describe('POST /api/auth/magic-link/request', () => {
  it('returns 200 with valid email and stores sha256 hash (not plaintext)', async () => {
    mockSelect.mockReturnValue(selectChain([])); // user lookup empty
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });

    const res = await app.request(
      makeRequest('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com' }),
        ip: '1.1.1.1',
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(valuesSpy).toHaveBeenCalled();
    const row = valuesSpy.mock.calls[0][0] as {
      tokenHash: string;
      email: string;
      userId: string | null;
      expiresAt: Date;
    };
    // sha256 hex is 64 lowercase hex chars
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.email).toBe('alice@example.com');
    expect(row.userId).toBeNull();
    expect(row.expiresAt).toBeInstanceOf(Date);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns 400 invalid_email on malformed email', async () => {
    const res = await app.request(
      makeRequest('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
        ip: '1.1.1.1',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_email' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed JSON body', async () => {
    const res = await app.request(
      makeRequest('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
        ip: '1.1.1.1',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_email' });
  });

  it('silently absorbs per-email rate-limit on 2nd hit within 60s (still 200, anti-enumeration)', async () => {
    mockSelect.mockReturnValue(selectChain([]));
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });

    // First call — token issued
    const res1 = await app.request(
      makeRequest('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@example.com' }),
        ip: '2.2.2.2',
      }),
    );
    expect(res1.status).toBe(200);
    expect(valuesSpy).toHaveBeenCalledTimes(1);

    // Second call — same email, different IP. Per-email limit applies even
    // across IPs (spec § Rate Limit "per email").
    const res2 = await app.request(
      makeRequest('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@example.com' }),
        ip: '3.3.3.3',
      }),
    );
    expect(res2.status).toBe(200); // not 429 — silently absorbed
    expect(await res2.json()).toEqual({ ok: true });
    expect(valuesSpy).toHaveBeenCalledTimes(1); // still 1 — no new token
  });

  it('returns 429 rate_limited on per-IP limit (>10 distinct emails / hour)', async () => {
    mockSelect.mockReturnValue(selectChain([]));
    mockInsert.mockReturnValue(insertChain());

    const sameIP = '5.5.5.5';
    // Saturate: 10 distinct emails from same IP
    for (let i = 0; i < 10; i++) {
      const res = await app.request(
        makeRequest('/api/auth/magic-link/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `user${i}@example.com` }),
          ip: sameIP,
        }),
      );
      expect(res.status).toBe(200);
    }

    // 11th request from same IP — surfaces 429
    const res = await app.request(
      makeRequest('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'eleventh@example.com' }),
        ip: sameIP,
      }),
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/magic-link/request — Resend SDK integration (C3)
// ---------------------------------------------------------------------------

describe('POST /api/auth/magic-link/request — Resend SDK (C3)', () => {
  /** Shared helper: issue one valid request from a fresh IP. */
  async function requestFor(email: string, ip: string) {
    mockSelect.mockReturnValue(selectChain([]));
    mockInsert.mockReturnValue(insertChain());
    return app.request(
      makeRequest('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        ip,
      }),
    );
  }

  it('calls Resend .emails.send when RESEND_API_KEY is set', async () => {
    const originalKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'test-resend-key';
    try {
      const res = await requestFor('resend-user@example.com', '30.30.30.30');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
      const sendArgs = mockResendSend.mock.calls[0][0] as {
        to: string;
        subject: string;
        html: string;
        text: string;
      };
      expect(sendArgs.to).toBe('resend-user@example.com');
      expect(sendArgs.subject).toBe('Your Erythos sign-in link');
      expect(sendArgs.html).toContain('href=');
      expect(sendArgs.text).toContain('http');
    } finally {
      if (originalKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = originalKey;
      }
    }
  });

  it('does NOT call Resend when RESEND_API_KEY is unset (console.log stub)', async () => {
    const originalKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const res = await requestFor('stub-user@example.com', '31.31.31.31');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockResendSend).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[magic-link][STUB]'),
      );
    } finally {
      consoleSpy.mockRestore();
      if (originalKey !== undefined) {
        process.env.RESEND_API_KEY = originalKey;
      }
    }
  });

  it('returns 200 even when Resend .emails.send throws (anti-enumeration)', async () => {
    const originalKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'test-resend-key-fail';
    mockResendSend.mockRejectedValue(new Error('Resend network error'));
    try {
      const res = await requestFor('fail-user@example.com', '32.32.32.32');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(mockResendSend).toHaveBeenCalledTimes(1);
    } finally {
      if (originalKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = originalKey;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/magic-link/verify
// ---------------------------------------------------------------------------

describe('GET /api/auth/magic-link/verify', () => {
  const future = () => new Date(Date.now() + 60_000);
  const past = () => new Date(Date.now() - 60_000);

  it('redirects to /?auth_error=invalid when no token query', async () => {
    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify', { ip: '7.7.7.7' }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/?auth_error=invalid');
  });

  it('redirects to /?auth_error=invalid when token hash not found in DB', async () => {
    // Phase 1: atomic UPDATE returns 0 rows (hash unknown)
    mockUpdate.mockReturnValue(updateReturningChain([]));
    // Phase 1 fallback SELECT: also 0 rows → 'invalid'
    mockSelect.mockReturnValue(selectChain([]));

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=fakehex', {
        ip: '8.8.8.8',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/?auth_error=invalid');
  });

  it('redirects to /?auth_error=expired when expires_at is past', async () => {
    // Phase 1: atomic UPDATE claims the token (returns it), but expiresAt is past.
    // Token is burned (used_at set) even though no session is issued.
    mockUpdate.mockReturnValue(
      updateReturningChain([
        {
          id: 'token-id-1',
          tokenHash: 'somehex',
          email: 'expired@example.com',
          userId: null,
          expiresAt: past(),
          usedAt: new Date(),
          createdAt: new Date(),
        },
      ]),
    );

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=anyhex', {
        ip: '9.9.9.9',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/?auth_error=expired');
  });

  it('redirects to /?auth_error=used when used_at is set', async () => {
    // Phase 1: atomic UPDATE returns 0 rows — another request already claimed it.
    mockUpdate.mockReturnValue(updateReturningChain([]));
    // Phase 1 fallback SELECT: row exists with usedAt set → 'used'
    mockSelect.mockReturnValue(
      selectChain([
        {
          id: 'token-id-1',
          tokenHash: 'somehex',
          email: 'used@example.com',
          userId: 'user-uuid-1',
          expiresAt: future(),
          usedAt: new Date(),
          createdAt: new Date(),
        },
      ]),
    );

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=anyhex', {
        ip: '10.10.10.10',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/?auth_error=used');
  });

  it('redirects to / + Set-Cookie session on success with existing user', async () => {
    // Phase 1: atomic UPDATE claims the token
    let updateCalls = 0;
    mockUpdate.mockImplementation(() => {
      updateCalls++;
      if (updateCalls === 1) {
        // Phase 1 — atomic claim, returns the claimed row
        return updateReturningChain([
          {
            id: 'token-id-1',
            tokenHash: 'somehex',
            email: 'existing@example.com',
            userId: null,
            expiresAt: future(),
            usedAt: new Date(),
            createdAt: new Date(),
          },
        ]);
      }
      // Phase 4 — bookkeeping update (no returning)
      return updateChain();
    });
    // Phase 3: SELECT user lookup (found)
    mockSelect.mockReturnValue(selectChain([{ id: 'user-uuid-1' }]));
    // createSession INSERT
    mockInsert.mockReturnValue(insertChain());

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=hex', {
        ip: '11.11.11.11',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    expect(res.headers.get('Set-Cookie')).toMatch(/^session=/);
  });

  it('INSERTs new user with github_id=null when email is new', async () => {
    // Phase 1: atomic UPDATE claims the token
    let updateCalls = 0;
    mockUpdate.mockImplementation(() => {
      updateCalls++;
      if (updateCalls === 1) {
        // Phase 1 — atomic claim
        return updateReturningChain([
          {
            id: 'token-id-2',
            tokenHash: 'newhex',
            email: 'new@example.com',
            userId: null,
            expiresAt: future(),
            usedAt: new Date(),
            createdAt: new Date(),
          },
        ]);
      }
      // Phase 4 — bookkeeping update (no returning)
      return updateChain();
    });
    // Phase 3: SELECT user lookup — empty (new user path)
    mockSelect.mockReturnValue(selectChain([]));

    // Phase 3 (CREATE): transaction wraps user-insert + demo-scene-inserts.
    // insertCalls sequence inside tx: 1=users, 2=scenes, 3=scene_versions
    // insertCalls outside tx: 4=sessions (createSession)
    let insertCalls = 0;
    const userInsertValuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-user-uuid' }]),
    });
    mockInsert.mockImplementation(() => {
      insertCalls++;
      if (insertCalls === 1) {
        // users insert (inside tx via mockTransaction default)
        return { values: userInsertValuesSpy };
      }
      // scenes, scene_versions (inside tx), sessions (outside tx)
      return insertChain();
    });

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=hex', {
        ip: '12.12.12.12',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    expect(userInsertValuesSpy).toHaveBeenCalled();
    const newUserRow = userInsertValuesSpy.mock.calls[0][0] as {
      github_id: number | null;
      email: string;
      github_login: string;
    };
    expect(newUserRow.github_id).toBeNull();
    expect(newUserRow.email).toBe('new@example.com');
    expect(newUserRow.github_login).toBe('');
    // transaction was used for atomicity
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('redirects to /?auth_error=rate_limited on per-IP verify limit (>20/min)', async () => {
    // Phase 1: atomic UPDATE returns 0 rows (unknown token hash)
    mockUpdate.mockReturnValue(updateReturningChain([]));
    // Phase 1 fallback SELECT: also 0 rows → 'invalid'
    mockSelect.mockReturnValue(selectChain([]));

    const sameIP = '20.20.20.20';
    // Saturate 20 attempts
    for (let i = 0; i < 20; i++) {
      const res = await app.request(
        makeRequest(`/api/auth/magic-link/verify?token=t${i}`, { ip: sameIP }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/?auth_error=invalid');
    }

    // 21st — rate-limited (302 with different auth_error)
    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=t21', { ip: sameIP }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/?auth_error=rate_limited');
  });
});

// ---------------------------------------------------------------------------
// verifyMagicLink() unit tests — atomic UPDATE race semantics (refs #990)
// ---------------------------------------------------------------------------
// These tests exercise verifyMagicLink() directly (not via HTTP) to verify
// the atomic claim logic and 0-row fallback branches in isolation.
// Dynamic import is required here because vi.mock() is hoisted and the mock
// vars are not yet initialised at static import time.

const { verifyMagicLink } = await import('../auth/magic-link.js');

describe('verifyMagicLink() — atomic UPDATE race semantics', () => {
  const future = () => new Date(Date.now() + 60_000);

  it('returns { error: "used" } for the second caller when first already claimed the token', async () => {
    // Simulate: first caller already ran Phase 1 UPDATE → used_at set.
    // Second caller: Phase 1 UPDATE returns 0 rows; Phase 1 fallback SELECT
    // returns row with usedAt set.
    mockUpdate.mockReturnValue(updateReturningChain([]));
    mockSelect.mockReturnValue(
      selectChain([
        {
          id: 'token-id-race',
          tokenHash: 'racehex',
          email: 'race@example.com',
          userId: 'user-uuid-winner',
          expiresAt: future(),
          usedAt: new Date(), // already claimed by first caller
          createdAt: new Date(),
        },
      ]),
    );

    const result = await verifyMagicLink('any-plaintext-token');
    expect(result).toEqual({ error: 'used' });
  });

  it('returns { error: "invalid" } when token never existed (0-row UPDATE + 0-row SELECT)', async () => {
    mockUpdate.mockReturnValue(updateReturningChain([]));
    mockSelect.mockReturnValue(selectChain([]));

    const result = await verifyMagicLink('nonexistent-token');
    expect(result).toEqual({ error: 'invalid' });
  });

  it('returns { error: "expired" } when atomic claim succeeds but token is past expiresAt', async () => {
    // Token claimed atomically but expiresAt is in the past — burned, no session.
    mockUpdate.mockReturnValue(
      updateReturningChain([
        {
          id: 'token-id-exp',
          tokenHash: 'exphex',
          email: 'exp@example.com',
          userId: null,
          expiresAt: new Date(Date.now() - 60_000),
          usedAt: new Date(),
          createdAt: new Date(),
        },
      ]),
    );

    const result = await verifyMagicLink('expired-plaintext-token');
    expect(result).toEqual({ error: 'expired' });
  });

  it('returns { userId } on happy path (atomic claim + existing user + bookkeeping)', async () => {
    let updateCalls = 0;
    mockUpdate.mockImplementation(() => {
      updateCalls++;
      if (updateCalls === 1) {
        return updateReturningChain([
          {
            id: 'token-id-ok',
            tokenHash: 'okhex',
            email: 'ok@example.com',
            userId: null,
            expiresAt: future(),
            usedAt: new Date(),
            createdAt: new Date(),
          },
        ]);
      }
      return updateChain(); // Phase 4 bookkeeping
    });
    mockSelect.mockReturnValue(selectChain([{ id: 'user-uuid-ok' }]));
    mockInsert.mockReturnValue(insertChain());

    const result = await verifyMagicLink('valid-plaintext-token');
    expect(result).toEqual({ userId: 'user-uuid-ok' });
  });
});
