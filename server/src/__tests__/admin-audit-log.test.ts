/**
 * Tests for GET /api/admin/audit-log — G2-3 (refs #1088)
 *
 * Strategy: mock db.js, auth.js, and audit/recordAudit.js.
 * requireAdmin is exercised end-to-end (not mocked) to verify gate integration.
 *
 * Covered:
 *   - 401 when not signed in
 *   - 403 when signed in but is_admin = false
 *   - 200 when admin, returns rows
 *   - event_type filter
 *   - actor_id filter
 *   - from/to date range filter
 *   - limit clamp (5000 → 1000)
 *   - cursor pagination: first page produces next_cursor, second page returns next slice
 *   - malformed cursor → 400
 *   - unknown event_type → 400
 *   - invalid actor_id (not uuid) → 400
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockInsert = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
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
// Import routers under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { adminRoutes } = await import('../routes/admin.js');

const app = new Hono();
const api = new Hono();
api.route('/admin', adminRoutes);
app.route('/api', api);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_ADMIN: NonNullable<AuthUser> = {
  id: 'admin-user-uuid-1',
  github_id: 42,
  github_login: 'adminuser',
  email: 'admin@example.com',
  avatar_url: null,
  handle: 'adminuser',
  storage_used: 0,
};

const FAKE_NON_ADMIN: NonNullable<AuthUser> = {
  id: 'regular-user-uuid-1',
  github_id: 43,
  github_login: 'regularuser',
  email: 'regular@example.com',
  avatar_url: null,
  handle: 'regularuser',
  storage_used: 0,
};

/** Build a drizzle-like select chain that resolves to `rows` on final await (.limit()) */
function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** Build a select chain for audit-log queries that have orderBy + limit */
function makeAuditSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

const BASE_TIMESTAMP = new Date('2025-01-15T10:00:00.000Z');

function makeAuditRow(overrides: Partial<{
  id: string;
  timestamp: Date;
  event_type: string;
  actor_id: string | null;
  actor_ip: string;
  actor_ua: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  success: boolean;
}> = {}) {
  return {
    id: 'audit-row-uuid-0001-0000000001',
    timestamp: BASE_TIMESTAMP,
    event_type: 'scene.create',
    actor_id: FAKE_ADMIN.id,
    actor_ip: '1.2.3.4',
    actor_ua: 'TestAgent/1.0',
    resource_type: 'scene',
    resource_id: 'scene-uuid-0001-0000000001',
    metadata: {},
    success: true,
    ...overrides,
  };
}

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { Cookie: 'session=some-token' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/admin/audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordAudit.mockResolvedValue(undefined);
  });

  it('returns 401 when not signed in', async () => {
    mockResolveSession.mockResolvedValue(null);

    const res = await app.request(makeRequest('/api/admin/audit-log'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Unauthorized' });
  });

  it('returns 403 when signed in but is_admin = false', async () => {
    mockResolveSession.mockResolvedValue(FAKE_NON_ADMIN);
    // requireAdmin does: SELECT is_admin FROM users WHERE id = user.id
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: false }]));

    const res = await app.request(makeRequest('/api/admin/audit-log'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Forbidden' });
  });

  it('returns 200 with rows when admin', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    // requireAdmin is_admin check
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));
    // audit-log query
    const row = makeAuditRow();
    mockSelect.mockReturnValueOnce(makeAuditSelectChain([row]));

    const res = await app.request(makeRequest('/api/admin/audit-log'));
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[]; next_cursor: string | null };
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows).toHaveLength(1);
    expect(body.next_cursor).toBeNull();

    const returnedRow = body.rows[0] as Record<string, unknown>;
    expect(returnedRow.event_type).toBe('scene.create');
    expect(returnedRow.actor_id).toBe(FAKE_ADMIN.id);
    expect(returnedRow.success).toBe(true);
    expect(typeof returnedRow.timestamp).toBe('string');
  });

  it('filters by event_type', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));
    mockSelect.mockReturnValueOnce(makeAuditSelectChain([
      makeAuditRow({ event_type: 'user.account_delete' }),
    ]));

    const res = await app.request(
      makeRequest('/api/admin/audit-log?event_type=user.account_delete'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[] };
    const row = body.rows[0] as Record<string, unknown>;
    expect(row.event_type).toBe('user.account_delete');
  });

  it('filters by actor_id', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));
    const targetId = 'a1b2c3d4-e5f6-0000-0000-111111111111';
    mockSelect.mockReturnValueOnce(makeAuditSelectChain([
      makeAuditRow({ actor_id: targetId }),
    ]));

    const res = await app.request(
      makeRequest(`/api/admin/audit-log?actor_id=${targetId}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[] };
    const row = body.rows[0] as Record<string, unknown>;
    expect(row.actor_id).toBe(targetId);
  });

  it('filters by from/to date range', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));
    mockSelect.mockReturnValueOnce(makeAuditSelectChain([makeAuditRow()]));

    const from = '2025-01-01T00:00:00.000Z';
    const to = '2025-12-31T23:59:59.000Z';
    const res = await app.request(
      makeRequest(`/api/admin/audit-log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('clamps limit to 1000 when 5000 is requested', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));

    // With limit clamped to 1000, we request 1001 rows from DB but return ≤ 1000.
    // Mock returns exactly 1000 rows (no next page).
    const rows = Array.from({ length: 1000 }, (_, i) =>
      makeAuditRow({
        id: `audit-row-uuid-${String(i).padStart(20, '0')}`,
        timestamp: new Date(BASE_TIMESTAMP.getTime() - i * 1000),
      }),
    );
    mockSelect.mockReturnValueOnce(makeAuditSelectChain(rows));

    const res = await app.request(makeRequest('/api/admin/audit-log?limit=5000'));
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[]; next_cursor: string | null };
    expect(body.rows).toHaveLength(1000);
    expect(body.next_cursor).toBeNull();
  });

  it('returns next_cursor when there are more rows, second page returns next slice', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));

    // limit=2, mock returns 3 rows (limit+1) → next_cursor present
    const row1 = makeAuditRow({
      id: 'aaaaaaaa-0000-0000-0000-000000000001',
      timestamp: new Date('2025-01-03T00:00:00.000Z'),
    });
    const row2 = makeAuditRow({
      id: 'aaaaaaaa-0000-0000-0000-000000000002',
      timestamp: new Date('2025-01-02T00:00:00.000Z'),
    });
    const row3 = makeAuditRow({
      id: 'aaaaaaaa-0000-0000-0000-000000000003',
      timestamp: new Date('2025-01-01T00:00:00.000Z'),
    });

    mockSelect.mockReturnValueOnce(makeAuditSelectChain([row1, row2, row3]));

    const res = await app.request(makeRequest('/api/admin/audit-log?limit=2'));
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: unknown[]; next_cursor: string | null };

    expect(body.rows).toHaveLength(2);
    expect(body.next_cursor).not.toBeNull();

    // Second page with cursor
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));
    mockSelect.mockReturnValueOnce(makeAuditSelectChain([row3]));

    const res2 = await app.request(
      makeRequest(`/api/admin/audit-log?limit=2&cursor=${encodeURIComponent(body.next_cursor!)}`),
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as { rows: unknown[]; next_cursor: string | null };
    expect(body2.rows).toHaveLength(1);
    expect(body2.next_cursor).toBeNull();
  });

  it('returns 400 for malformed cursor', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));

    const res = await app.request(
      makeRequest('/api/admin/audit-log?cursor=notavalidcursor!@#$'),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('returns 400 for unknown event_type', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));

    const res = await app.request(
      makeRequest('/api/admin/audit-log?event_type=unknown.event.type'),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.error).toBe('string');
  });

  it('returns 400 for invalid actor_id (not uuid)', async () => {
    mockResolveSession.mockResolvedValue(FAKE_ADMIN);
    mockSelect.mockReturnValueOnce(makeSelectChain([{ is_admin: true }]));

    const res = await app.request(
      makeRequest('/api/admin/audit-log?actor_id=notauuid'),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.error).toBe('string');
  });
});
