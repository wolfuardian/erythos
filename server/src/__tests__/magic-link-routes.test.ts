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
 *
 *   GET /api/auth/magic-link/verify
 *     - 302 /?auth_error=invalid when no token query
 *     - 302 /?auth_error=invalid when token hash not in DB
 *     - 302 /?auth_error=expired when expires_at past
 *     - 302 /?auth_error=used when used_at set
 *     - 302 / + Set-Cookie session on success (existing user)
 *     - 302 / + new user INSERT (github_id=null) when email new
 *     - 302 /?auth_error=rate_limited on per-IP verify limit (>20/min)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  pool: {},
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

/** Build an update chain that resolves */
function updateChain() {
  return {
    set: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  _resetRateLimit();
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
    mockSelect.mockReturnValue(selectChain([])); // token lookup empty

    const res = await app.request(
      makeRequest('/api/auth/magic-link/verify?token=fakehex', {
        ip: '8.8.8.8',
      }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/?auth_error=invalid');
  });

  it('redirects to /?auth_error=expired when expires_at is past', async () => {
    mockSelect.mockReturnValue(
      selectChain([
        {
          id: 'token-id-1',
          tokenHash: 'somehex',
          email: 'expired@example.com',
          userId: null,
          expiresAt: past(),
          usedAt: null,
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
    let selectCalls = 0;
    mockSelect.mockImplementation(() => {
      selectCalls++;
      if (selectCalls === 1) {
        // First select — token lookup
        return selectChain([
          {
            id: 'token-id-1',
            tokenHash: 'somehex',
            email: 'existing@example.com',
            userId: null,
            expiresAt: future(),
            usedAt: null,
            createdAt: new Date(),
          },
        ]);
      }
      // Second select — user lookup (found)
      return selectChain([{ id: 'user-uuid-1' }]);
    });
    // Two inserts will happen: createSession (sessions table)
    mockInsert.mockReturnValue(insertChain());
    mockUpdate.mockReturnValue(updateChain());

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
    let selectCalls = 0;
    mockSelect.mockImplementation(() => {
      selectCalls++;
      if (selectCalls === 1) {
        return selectChain([
          {
            id: 'token-id-2',
            tokenHash: 'newhex',
            email: 'new@example.com',
            userId: null,
            expiresAt: future(),
            usedAt: null,
            createdAt: new Date(),
          },
        ]);
      }
      // User lookup — empty (new user path)
      return selectChain([]);
    });

    // First insert: INSERT users with .returning()
    // Second insert: createSession (no .returning)
    let insertCalls = 0;
    const userInsertValuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'new-user-uuid' }]),
    });
    mockInsert.mockImplementation(() => {
      insertCalls++;
      if (insertCalls === 1) {
        return { values: userInsertValuesSpy };
      }
      return insertChain();
    });
    mockUpdate.mockReturnValue(updateChain());

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
  });

  it('redirects to /?auth_error=rate_limited on per-IP verify limit (>20/min)', async () => {
    mockSelect.mockReturnValue(selectChain([])); // every verify lookup empty (invalid)

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
