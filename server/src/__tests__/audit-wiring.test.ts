/**
 * Audit wiring smoke test — G2-1 (refs #1086)
 *
 * Verifies that the scene.create event path produces a recordAudit() call
 * with the expected shape. This is a wiring test: it asserts that the route
 * calls the audit helper, not that the helper writes to DB (covered by
 * recordAudit.test.ts).
 *
 * Strategy: mock db.js, auth.js, and audit/recordAudit.js. Exercise
 * POST /scenes and assert recordAudit was called once with event_type =
 * 'scene.create' and the expected metadata shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: vi.fn(),
    delete: vi.fn(),
    transaction: mockTransaction,
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

// Spy on recordAudit so we can assert it was called correctly.
const mockRecordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../audit/recordAudit.js', () => ({
  recordAudit: (...args: unknown[]) => mockRecordAudit(...args),
  extractActorIp: vi.fn().mockReturnValue('1.2.3.4'),
  maskEmail: vi.fn().mockReturnValue('a1b2c3d4'),
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

const FAKE_USER: NonNullable<AuthUser> = {
  id: 'user-uuid-1',
  github_id: 1,
  github_login: 'alice',
  email: 'alice@example.com',
  avatar_url: null,
  handle: 'alice',
  storage_used: 0,
};

function makeRequest(
  path: string,
  options: RequestInit & { cookie?: string } = {},
): Request {
  const { cookie, ...init } = options;
  const headers = new Headers(init.headers as Record<string, string> | undefined);
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

// ---------------------------------------------------------------------------
// Smoke test: scene.create emits recordAudit
// ---------------------------------------------------------------------------

describe('audit wiring — scene.create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
  });

  it('calls recordAudit("scene.create", ...) with correct shape after POST /scenes', async () => {
    // Plan query: user plan
    const selectPlanChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ plan: 'free' }]),
    };
    // Scene count query
    const selectCountChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ count: 0 }]),
    };
    mockSelect
      .mockReturnValueOnce(selectPlanChain)   // plan lookup
      .mockReturnValueOnce(selectCountChain); // scene count

    // Transaction: insert scene + scene_versions
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const mockTx = {
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
      };
      await fn(mockTx);
    });

    const res = await app.request(
      makeRequest('/api/scenes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:5173',
        },
        cookie: 'session=valid-token',
        body: JSON.stringify({ name: 'Test Scene', body: { nodes: [] } }),
      }),
    );

    expect(res.status).toBe(201);

    // Assert recordAudit was called exactly once
    expect(mockRecordAudit).toHaveBeenCalledOnce();

    // Assert event_type and key opts shape
    const [eventType, opts] = mockRecordAudit.mock.calls[0] as [string, Record<string, unknown>];
    expect(eventType).toBe('scene.create');
    expect(opts.actor_id).toBe(FAKE_USER.id);
    expect(opts.resource_type).toBe('scene');
    expect(opts.success).toBe(true);
    expect((opts.metadata as Record<string, unknown>)['title']).toBe('Test Scene');
  });
});
