/**
 * Unit tests for /me routes — GDPR endpoints (refs #931, #1095 G1).
 *
 * Strategy: mock db module so no real Postgres connection is needed.
 * Hono app exercised via app.request() — no network required.
 *
 * Covered:
 *   GET    /me/export         — 200 happy path (JSON shape + Content-Disposition)
 *   GET    /me/export         — 401 anonymous
 *   DELETE /me                — 200 schedules deletion (G1 grace period)
 *   DELETE /me                — 200 idempotent (already scheduled)
 *   DELETE /me                — 401 anonymous
 *   DELETE /me                — 404 user not found
 *   POST   /me/cancel-delete  — 200 cancels pending deletion
 *   POST   /me/cancel-delete  — 401 anonymous
 *   POST   /me/cancel-delete  — 404 no pending deletion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    delete: mockDelete,
    update: mockUpdate,
    transaction: mockTransaction,
  },
  pool: {},
}));

// resolveSession — default null (unauthenticated)
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
const mockDeleteSession = vi.fn<() => Promise<void>>();

vi.mock('../auth.js', () => ({
  resolveSession: (...args: unknown[]) => mockResolveSession(...(args as [])),
  deleteSession: (...args: unknown[]) => mockDeleteSession(...(args as [])),
  SESSION_COOKIE: 'session',
}));

// recordAudit is fire-and-forget; mock it out so it doesn't hit db.insert
// or cause flaky call-count assertions in these route tests.
const mockRecordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../audit/recordAudit.js', () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
  extractActorIp: vi.fn().mockReturnValue(''),
  maskEmail: vi.fn().mockReturnValue(''),
}));

// ---------------------------------------------------------------------------
// Import router under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { meRoutes } = await import('../routes/me.js');

const app = new Hono();
const api = new Hono();
api.route('/me', meRoutes);
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
const FAKE_USER: NonNullable<AuthUser> = {
  id: 'user-uuid-1',
  github_id: 42,
  github_login: 'alice',
  email: 'alice@example.com',
  avatar_url: 'https://avatars.githubusercontent.com/u/42',
  handle: 'alice',
  storage_used: 0,
};

/** Build a select chain that returns rows on final await (no limit) */
function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** Build a select chain that resolves directly (no .limit()) */
function selectChainNoLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

// ---------------------------------------------------------------------------
// GET /me/export
// ---------------------------------------------------------------------------

describe('GET /api/me/export', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(makeRequest('/api/me/export'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns 200 with JSON payload and Content-Disposition attachment', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    const fakeUserRecord = {
      id: FAKE_USER.id,
      github_login: FAKE_USER.github_login,
      email: FAKE_USER.email,
      avatar_url: FAKE_USER.avatar_url,
      created_at: new Date('2025-01-01T00:00:00Z'),
    };

    const fakeScene = {
      id: 'scene-1',
      name: 'My Scene',
      visibility: 'public',
      forked_from: null,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-02T00:00:00Z'),
    };

    const fakeVersion = {
      scene_id: 'scene-1',
      version: 1,
      saved_by: FAKE_USER.id,
      saved_at: new Date('2025-01-01T12:00:00Z'),
    };

    // Three select calls:
    // 1. SELECT user record (.limit)
    // 2. SELECT scenes (.where resolves directly)
    // 3. SELECT scene_versions (.where resolves directly)
    mockSelect
      .mockReturnValueOnce(selectChain([fakeUserRecord]))      // user lookup
      .mockReturnValueOnce(selectChainNoLimit([fakeScene]))    // scenes
      .mockReturnValueOnce(selectChainNoLimit([fakeVersion])); // scene_versions

    const res = await app.request(
      makeRequest('/api/me/export', { cookie: 'session=valid-token' }),
    );

    expect(res.status).toBe(200);

    // Content-Type
    expect(res.headers.get('content-type')).toMatch(/application\/json/);

    // Content-Disposition attachment with filename
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toMatch(/attachment/);
    expect(disposition).toMatch(/filename="erythos-export-alice-/);
    expect(disposition).toMatch(/\.json"/);

    // JSON shape
    const body = await res.json() as {
      exported_at: string;
      user: Record<string, unknown>;
      scenes: Array<Record<string, unknown>>;
    };
    expect(body).toHaveProperty('exported_at');
    expect(body.user).toMatchObject({
      id: FAKE_USER.id,
      github_login: 'alice',
      email: 'alice@example.com',
    });
    // github_id, handle, storage_used must NOT be exposed
    expect(body.user).not.toHaveProperty('github_id');
    expect(body.user).not.toHaveProperty('handle');
    expect(body.user).not.toHaveProperty('storage_used');

    expect(Array.isArray(body.scenes)).toBe(true);
    expect(body.scenes).toHaveLength(1);
    expect(body.scenes[0]).toMatchObject({ id: 'scene-1', name: 'My Scene' });
    expect(body.scenes[0]).toHaveProperty('scene_versions');
    const versions = (body.scenes[0] as Record<string, unknown>)['scene_versions'] as unknown[];
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, saved_by: FAKE_USER.id });
    // body bytes must NOT be in export
    expect(body.scenes[0]).not.toHaveProperty('body');
  });

  it('returns empty scenes array when user has no scenes', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    const fakeUserRecord = {
      id: FAKE_USER.id,
      github_login: FAKE_USER.github_login,
      email: FAKE_USER.email,
      avatar_url: FAKE_USER.avatar_url,
      created_at: new Date(),
    };

    mockSelect
      .mockReturnValueOnce(selectChain([fakeUserRecord]))  // user lookup
      .mockReturnValueOnce(selectChainNoLimit([]));        // no scenes

    const res = await app.request(
      makeRequest('/api/me/export', { cookie: 'session=valid-token' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { scenes: unknown[] };
    expect(body.scenes).toHaveLength(0);
    // scene_versions select should NOT be called (sceneIds.length === 0)
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// DELETE /me — G1 grace period (refs #1095)
// ---------------------------------------------------------------------------

/** Build a update chain that resolves via .returning() */
function updateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

const SCHEDULED_AT = new Date('2026-06-15T00:00:00Z');

describe('DELETE /api/me', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(makeRequest('/api/me', { method: 'DELETE' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 200 and schedules deletion when not yet scheduled', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);
    mockDeleteSession.mockResolvedValue(undefined);

    // existence check (scheduled_delete_at = null → not yet scheduled)
    mockSelect
      .mockReturnValueOnce(selectChain([{ id: FAKE_USER.id, scheduled_delete_at: null }]))
      .mockReturnValueOnce(selectChainNoLimit([{ count: 0 }]))    // COUNT scenes
      .mockReturnValueOnce(selectChainNoLimit([]));               // scene IDs (empty → no token count)

    // db.update chain for setting scheduled_delete_at
    mockUpdate.mockReturnValueOnce(
      updateChain([{ scheduled_delete_at: SCHEDULED_AT }]),
    );

    const res = await app.request(
      makeRequest('/api/me', {
        method: 'DELETE',
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { scheduled_delete_at: string };
    expect(body).toHaveProperty('scheduled_delete_at');
    expect(new Date(body.scheduled_delete_at).getTime()).toBe(SCHEDULED_AT.getTime());

    // db.update was called (scheduled deletion set)
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // db.transaction is NOT called (no immediate cascade delete)
    expect(mockTransaction).not.toHaveBeenCalled();

    // Session was cleared
    expect(mockDeleteSession).toHaveBeenCalledTimes(1);

    // recordAudit called with user.account_delete_scheduled
    expect(mockRecordAudit).toHaveBeenCalledOnce();
    const [eventType, opts] = mockRecordAudit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventType).toBe('user.account_delete_scheduled');
    expect(opts.actor_id).toBe(FAKE_USER.id);
    expect(opts.success).toBe(true);
  });

  it('returns 200 idempotent when already scheduled (does not re-audit or clear session)', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    // scheduled_delete_at already set → idempotent path
    mockSelect.mockReturnValueOnce(
      selectChain([{ id: FAKE_USER.id, scheduled_delete_at: SCHEDULED_AT }]),
    );

    const res = await app.request(
      makeRequest('/api/me', {
        method: 'DELETE',
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { scheduled_delete_at: string };
    expect(body).toHaveProperty('scheduled_delete_at');

    // No DB update, no session clear, no audit on idempotent path
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('returns 404 when user does not exist (race condition)', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    // existence check returns empty
    mockSelect.mockReturnValueOnce(selectChain([]));

    const res = await app.request(
      makeRequest('/api/me', {
        method: 'DELETE',
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /me/cancel-delete — G1 cancel grace period (refs #1095)
// ---------------------------------------------------------------------------

/** Build a update chain that resolves without .returning() */
function updateChainNoReturn() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
}

describe('POST /api/me/cancel-delete', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(makeRequest('/api/me/cancel-delete', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 and clears scheduled_delete_at when pending deletion exists', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    mockSelect.mockReturnValueOnce(
      selectChain([{ id: FAKE_USER.id, scheduled_delete_at: SCHEDULED_AT }]),
    );
    mockUpdate.mockReturnValueOnce(updateChainNoReturn());

    const res = await app.request(
      makeRequest('/api/me/cancel-delete', {
        method: 'POST',
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });

    expect(mockUpdate).toHaveBeenCalledTimes(1);

    expect(mockRecordAudit).toHaveBeenCalledOnce();
    const [eventType, opts] = mockRecordAudit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventType).toBe('user.account_delete_cancelled');
    expect(opts.actor_id).toBe(FAKE_USER.id);
    expect(opts.success).toBe(true);
  });

  it('returns 404 when no pending deletion to cancel', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    mockSelect.mockReturnValueOnce(
      selectChain([{ id: FAKE_USER.id, scheduled_delete_at: null }]),
    );

    const res = await app.request(
      makeRequest('/api/me/cancel-delete', {
        method: 'POST',
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('returns 404 when user row not found', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    mockSelect.mockReturnValueOnce(selectChain([]));

    const res = await app.request(
      makeRequest('/api/me/cancel-delete', {
        method: 'POST',
        cookie: 'session=valid-token',
      }),
    );

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /me/export — filename sanitization (refs #940)
// ---------------------------------------------------------------------------

describe('GET /api/me/export — Content-Disposition filename sanitization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sanitizes special characters in github_login to underscores', async () => {
    // Simulate a DB value that somehow contains characters outside [a-zA-Z0-9-]
    // (not normally possible via GitHub OAuth, but defense-in-depth covers
    // future DB writes from other paths).
    const suspiciousLogin = 'alice\r\nX-Injected: evil';

    mockResolveSession.mockResolvedValue({
      ...FAKE_USER,
      github_login: suspiciousLogin,
    });

    const fakeUserRecord = {
      id: FAKE_USER.id,
      github_login: suspiciousLogin,
      email: FAKE_USER.email,
      avatar_url: FAKE_USER.avatar_url,
      created_at: new Date('2025-01-01T00:00:00Z'),
    };

    mockSelect
      .mockReturnValueOnce(selectChain([fakeUserRecord]))
      .mockReturnValueOnce(selectChainNoLimit([]));

    const res = await app.request(
      makeRequest('/api/me/export', { cookie: 'session=valid-token' }),
    );

    expect(res.status).toBe(200);

    const disposition = res.headers.get('content-disposition') ?? '';
    // The filename must not contain \r, \n, or any header-unsafe characters
    expect(disposition).not.toMatch(/\r/);
    expect(disposition).not.toMatch(/\n/);
    // Special chars replaced with underscores — colon, newlines, spaces → _
    expect(disposition).toMatch(/filename="erythos-export-/);
    // No raw colon or newline in the value
    expect(disposition).not.toContain(':');
  });

  it('keeps normal github_login unchanged in filename', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);

    const fakeUserRecord = {
      id: FAKE_USER.id,
      github_login: FAKE_USER.github_login, // 'alice'
      email: FAKE_USER.email,
      avatar_url: FAKE_USER.avatar_url,
      created_at: new Date('2025-01-01T00:00:00Z'),
    };

    mockSelect
      .mockReturnValueOnce(selectChain([fakeUserRecord]))
      .mockReturnValueOnce(selectChainNoLimit([]));

    const res = await app.request(
      makeRequest('/api/me/export', { cookie: 'session=valid-token' }),
    );

    expect(res.status).toBe(200);
    const disposition = res.headers.get('content-disposition') ?? '';
    // Normal alphanumeric login should appear unchanged
    expect(disposition).toMatch(/filename="erythos-export-alice-/);
    expect(disposition).toMatch(/\.json"/);
  });
});
