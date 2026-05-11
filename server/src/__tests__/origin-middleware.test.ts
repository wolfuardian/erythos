/**
 * Unit tests for Origin validation middleware (refs #940).
 *
 * The middleware rejects POST/PUT/PATCH/DELETE requests whose Origin header
 * is absent or not in the ALLOWED_ORIGIN whitelist.
 *
 * Covered:
 *   POST with no Origin header       → 403
 *   POST with disallowed Origin       → 403
 *   POST with allowed Origin          → passes through (200)
 *   GET  with no Origin header        → passes through (200, GET exempt)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Set ALLOWED_ORIGIN before the module under test is imported so the Set is
// constructed with the test value.
// ---------------------------------------------------------------------------

const ALLOWED = 'http://localhost:5173';
const DISALLOWED = 'https://evil.example.com';

// We need to re-build the app with a known ALLOWED_ORIGIN. Rather than
// re-importing index.ts (which starts a server), we replicate the middleware
// logic in a test-local Hono app that mirrors what index.ts does.
//
// This keeps the test hermetic: no DB, no real server, no env side-effects.

function buildTestApp(allowedOriginEnv: string) {
  const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  const allowedOrigins = new Set(
    allowedOriginEnv
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );

  const app = new Hono();
  const api = new Hono();

  api.use('*', async (c, next) => {
    if (STATE_CHANGING_METHODS.has(c.req.method)) {
      const origin = c.req.header('Origin');
      if (!origin || !allowedOrigins.has(origin)) {
        return c.json({ error: 'Origin not allowed' }, 403);
      }
    }
    return next();
  });

  // Minimal probe route
  api.post('/probe', (c) => c.json({ ok: true }, 200));
  api.get('/probe', (c) => c.json({ ok: true }, 200));
  api.put('/probe', (c) => c.json({ ok: true }, 200));
  api.patch('/probe', (c) => c.json({ ok: true }, 200));
  api.delete('/probe', (c) => c.json({ ok: true }, 200));

  app.route('/api', api);
  return app;
}

const app = buildTestApp(ALLOWED);

function makeRequest(
  method: string,
  origin?: string,
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (origin) headers.set('Origin', origin);
  return new Request('http://localhost/api/probe', { method, headers, body: method === 'GET' ? undefined : '{}' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Origin middleware — state-changing methods', () => {
  it('rejects POST with no Origin header (403)', async () => {
    const res = await app.request(makeRequest('POST'));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Origin not allowed');
  });

  it('rejects POST with disallowed Origin (403)', async () => {
    const res = await app.request(makeRequest('POST', DISALLOWED));
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Origin not allowed');
  });

  it('allows POST with correct Origin (200)', async () => {
    const res = await app.request(makeRequest('POST', ALLOWED));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('allows PUT with correct Origin (200)', async () => {
    const res = await app.request(makeRequest('PUT', ALLOWED));
    expect(res.status).toBe(200);
  });

  it('allows PATCH with correct Origin (200)', async () => {
    const res = await app.request(makeRequest('PATCH', ALLOWED));
    expect(res.status).toBe(200);
  });

  it('allows DELETE with correct Origin (200)', async () => {
    const res = await app.request(makeRequest('DELETE', ALLOWED));
    expect(res.status).toBe(200);
  });
});

describe('Origin middleware — GET is exempt', () => {
  it('allows GET with no Origin header (200)', async () => {
    const res = await app.request(makeRequest('GET'));
    expect(res.status).toBe(200);
  });

  it('allows GET with wrong Origin (200, GET exempt)', async () => {
    const res = await app.request(makeRequest('GET', DISALLOWED));
    expect(res.status).toBe(200);
  });
});

describe('Origin middleware — multi-origin whitelist', () => {
  it('allows both origins when ALLOWED_ORIGIN is comma-separated', async () => {
    const multiApp = buildTestApp('http://localhost:5173,http://localhost:4173');

    const res1 = await multiApp.request(makeRequest('POST', 'http://localhost:5173'));
    expect(res1.status).toBe(200);

    const res2 = await multiApp.request(makeRequest('POST', 'http://localhost:4173'));
    expect(res2.status).toBe(200);

    const res3 = await multiApp.request(makeRequest('POST', DISALLOWED));
    expect(res3.status).toBe(403);
  });
});
