/**
 * Unit tests for requireAdmin() middleware — G2-2 (refs #1087)
 *
 * Strategy: mock auth.js, db.js, and audit/recordAudit.js. Mount the
 * middleware on a minimal Hono app with a downstream sentinel route to
 * verify next() is (or is not) called.
 *
 * Covered:
 *   - No session → 401, recordAudit NOT called
 *   - Session valid, is_admin = false → 403, recordAudit called once
 *     with event_type='admin.access_denied', success=false, actor_id=user.id
 *   - Session valid, is_admin = true → next() called, downstream response
 *   - recordAudit failure does not affect the 403 response (fire-and-forget)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  pool: {},
}));

type AuthUser = {
  id: string;
  github_id: number | null;
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

const mockRecordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../audit/recordAudit.js', () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
  extractActorIp: vi.fn().mockReturnValue('1.2.3.4'),
}));

// ---------------------------------------------------------------------------
// Import middleware under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { requireAdmin } = await import('../middleware/requireAdmin.js');

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

const FAKE_USER: NonNullable<AuthUser> = {
  id: 'user-uuid-admin-test',
  github_id: 99,
  github_login: 'bob',
  email: 'bob@example.com',
  avatar_url: null,
  handle: 'bob',
  storage_used: 0,
};

/** Build a select chain that resolves to `rows` on final await (.limit()) */
function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function buildApp() {
  const app = new Hono();
  app.use('/admin/*', requireAdmin());
  app.get('/admin/probe', (c) => c.json({ ok: true }, 200));
  return app;
}

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { Cookie: 'session=some-token' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireAdmin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordAudit.mockResolvedValue(undefined);
  });

  it('returns 401 and does NOT call recordAudit when there is no session', async () => {
    mockResolveSession.mockResolvedValue(null);

    const app = buildApp();
    const res = await app.request(makeRequest('/admin/probe'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('returns 403 and calls recordAudit when session is valid but is_admin = false', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: false }]));

    const app = buildApp();
    const res = await app.request(makeRequest('/admin/probe'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });

    // Give the fire-and-forget void promise a tick to be called
    await Promise.resolve();

    expect(mockRecordAudit).toHaveBeenCalledOnce();
    const [eventType, opts] = mockRecordAudit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventType).toBe('admin.access_denied');
    expect(opts.actor_id).toBe(FAKE_USER.id);
    expect(opts.success).toBe(false);
    expect(opts.actor_ip).toBe('1.2.3.4');
  });

  it('calls next() and returns downstream response when is_admin = true', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));

    const app = buildApp();
    const res = await app.request(makeRequest('/admin/probe'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('still returns 403 even when recordAudit rejects (fire-and-forget)', async () => {
    mockResolveSession.mockResolvedValue(FAKE_USER);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: false }]));
    mockRecordAudit.mockRejectedValue(new Error('db down'));

    const app = buildApp();
    const res = await app.request(makeRequest('/admin/probe'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });
});
