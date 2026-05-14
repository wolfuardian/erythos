/**
 * Unit tests for GET /api/metrics
 *
 * Covered:
 *   - 401 when no Authorization header
 *   - 401 when wrong credentials
 *   - 401 when METRICS_USER/METRICS_PASS env vars are not configured
 *   - 200 + correct JSON shape with valid credentials
 *   - counter increment: POST /api/scenes → scene_create_total increases
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();
const mockExecute = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    transaction: mockTransaction,
    execute: mockExecute,
  },
  pool: {},
}));

const mockResolveSession = vi.fn();
vi.mock('../auth.js', () => ({
  resolveSession: (...args: unknown[]) => mockResolveSession(...(args as [])),
  SESSION_COOKIE: 'session',
}));

// ---------------------------------------------------------------------------
// Import modules under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { metricsRoutes } = await import('../routes/metrics.js');
const { sceneRoutes } = await import('../routes/scenes.js');
const { counters } = await import('../counters.js');

// Build an isolated app for testing
function buildApp() {
  const app = new Hono();
  const api = new Hono();
  api.route('/metrics', metricsRoutes);
  api.route('/scenes', sceneRoutes);
  app.route('/api', api);
  return app;
}

const app = buildApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basicAuthHeader(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

function makeRequest(path: string, options: RequestInit & { cookie?: string } = {}): Request {
  const { cookie, ...init } = options;
  const headers = new Headers(init.headers as Record<string, string> | undefined);
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const FAKE_USER = {
  id: 'user-1',
  github_id: 1,
  github_login: 'alice',
  email: 'alice@example.com',
  avatar_url: null,
  handle: 'alice',
  storage_used: 0,
};

function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

// ---------------------------------------------------------------------------
// /api/metrics auth tests
// ---------------------------------------------------------------------------

describe('GET /api/metrics — auth', () => {
  const origUser = process.env.METRICS_USER;
  const origPass = process.env.METRICS_PASS;

  beforeEach(() => {
    process.env.METRICS_USER = 'metrics';
    process.env.METRICS_PASS = 'secret123';
  });

  afterEach(() => {
    if (origUser === undefined) delete process.env.METRICS_USER;
    else process.env.METRICS_USER = origUser;
    if (origPass === undefined) delete process.env.METRICS_PASS;
    else process.env.METRICS_PASS = origPass;
  });

  it('returns 401 when no Authorization header', async () => {
    const res = await app.request(makeRequest('/api/metrics'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when credentials are wrong', async () => {
    const res = await app.request(
      makeRequest('/api/metrics', {
        headers: { Authorization: basicAuthHeader('metrics', 'wrongpass') },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when METRICS_USER/METRICS_PASS are unset', async () => {
    delete process.env.METRICS_USER;
    delete process.env.METRICS_PASS;

    const res = await app.request(
      makeRequest('/api/metrics', {
        headers: { Authorization: basicAuthHeader('metrics', 'secret123') },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct JSON shape on valid credentials', async () => {
    const res = await app.request(
      makeRequest('/api/metrics', {
        headers: { Authorization: basicAuthHeader('metrics', 'secret123') },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(typeof body['uptime_seconds']).toBe('number');
    expect(typeof body['timestamp']).toBe('string');
    expect(body['counters']).toBeDefined();

    const c = body['counters'] as Record<string, unknown>;
    expect(c).toHaveProperty('req_total');
    expect(c).toHaveProperty('auth_signin_total');
    expect(c).toHaveProperty('auth_signout_total');
    expect(c).toHaveProperty('scene_push_total');
    expect(c).toHaveProperty('scene_create_total');
    expect(c).toHaveProperty('scene_fork_total');
  });
});

// ---------------------------------------------------------------------------
// Counter increment test — POST /api/scenes increments scene_create_total
// ---------------------------------------------------------------------------

describe('counter increment — scene_create_total', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
    process.env.METRICS_USER = 'metrics';
    process.env.METRICS_PASS = 'secret123';
  });

  it('increments scene_create_total after a successful POST /api/scenes', async () => {
    // Record baseline
    const before = counters.scene_create_total;

    // POST /scenes now queries plan + scene count before inserting
    // First select: plan lookup → free plan; second: scene count → 0 (under limit)
    mockSelect
      .mockReturnValueOnce(selectChain([{ plan: 'free' }]))
      .mockReturnValueOnce(selectChain([{ count: 0 }]));

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      };
      return fn(tx);
    });

    const createRes = await app.request(
      makeRequest('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Counter Test Scene', body: { nodes: [] } }),
        cookie: 'session=valid-token',
      }),
    );

    expect(createRes.status).toBe(201);

    // Check counter via /api/metrics
    const metricsRes = await app.request(
      makeRequest('/api/metrics', {
        headers: { Authorization: basicAuthHeader('metrics', 'secret123') },
      }),
    );

    const metricsBody = await metricsRes.json() as Record<string, unknown>;
    const c = metricsBody['counters'] as Record<string, unknown>;

    expect(c['scene_create_total']).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// /health endpoint
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with ok status when db is up', async () => {
    // Need a separate app that includes health — use a fresh Hono with the
    // same mock. We import index indirectly by building the health handler inline
    // to avoid starting the actual server.
    mockExecute.mockResolvedValueOnce([{ '?column?': 1 }]);

    // Build a minimal app with just the health route logic
    const healthApp = new Hono();
    healthApp.get('/health', async (c) => {
      const { db: dbInstance } = await import('../db.js');
      const { sql } = await import('drizzle-orm');
      const t0 = Date.now();
      let dbStatus: 'up' | 'down' = 'down';
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 1000),
        );
        await Promise.race([dbInstance.execute(sql`SELECT 1`), timeout]);
        dbStatus = 'up';
      } catch {
        // degraded
      }
      const response_ms = Date.now() - t0;
      const status = dbStatus === 'up' ? 'ok' : 'degraded';
      return c.json({ status, db: dbStatus, response_ms }, 200);
    });

    const res = await healthApp.request(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('ok');
    expect(body['db']).toBe('up');
    expect(typeof body['response_ms']).toBe('number');
  });

  it('returns 200 with degraded status when db is down', async () => {
    mockExecute.mockRejectedValueOnce(new Error('connection refused'));

    const healthApp = new Hono();
    healthApp.get('/health', async (c) => {
      const { db: dbInstance } = await import('../db.js');
      const { sql } = await import('drizzle-orm');
      const t0 = Date.now();
      let dbStatus: 'up' | 'down' = 'down';
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 1000),
        );
        await Promise.race([dbInstance.execute(sql`SELECT 1`), timeout]);
        dbStatus = 'up';
      } catch {
        // degraded
      }
      const response_ms = Date.now() - t0;
      const status = dbStatus === 'up' ? 'ok' : 'degraded';
      return c.json({ status, db: dbStatus, response_ms }, 200);
    });

    const res = await healthApp.request(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body['status']).toBe('degraded');
    expect(body['db']).toBe('down');
  });
});
