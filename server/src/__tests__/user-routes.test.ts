/**
 * Unit tests for GET /api/users/:id (#1017 owner resolver).
 *
 * Strategy: mock db module — no real Postgres connection needed.
 * Hono app exercised via app.request().
 *
 * Covered:
 *   GET /users/:id — happy path (200 + public-safe fields)
 *   GET /users/:id — 404 (user not found)
 *   GET /users/:id — PII field whitelist (email / storage_used etc. NOT in response)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be registered before module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
  },
  pool: {},
}));

// ---------------------------------------------------------------------------
// Import router under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { userRoutes } = await import('../routes/users.js');

const app = new Hono();
const api = new Hono();
api.route('/users', userRoutes);
app.route('/api', api);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, options: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, options);
}

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------

describe('GET /api/users/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with public-safe fields for a known user', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
              github_login: 'octocat',
              avatar_url: 'https://github.com/octocat.png',
            },
          ]),
        }),
      }),
    });

    const res = await app.request(makeRequest('/api/users/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
    expect(body.github_login).toBe('octocat');
    expect(body.avatar_url).toBe('https://github.com/octocat.png');
  });

  it('returns 200 with avatar_url null when not set', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
              github_login: 'ghost',
              avatar_url: null,
            },
          ]),
        }),
      }),
    });

    const res = await app.request(makeRequest('/api/users/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.avatar_url).toBeNull();
  });

  it('returns 404 for an unknown user id', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const res = await app.request(makeRequest('/api/users/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa9'));
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Not Found');
  });

  it('returns 400 with error code for non-UUID id (e.g. /users/me)', async () => {
    // Regression: pre-fix, the Postgres uuid column threw on non-UUID input
    // and surfaced as opaque 500 (refs prod observation 2026-05-13). Now 400
    // with explicit code so callers can distinguish "bad input" from
    // "server fault".
    const res = await app.request(makeRequest('/api/users/me'));
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toMatch(/UUID/i);
    expect(body.code).toBe('E1001 ERR_USER_ID_FORMAT');

    // DB query must not be reached when validation fails up-front
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('does NOT expose PII fields (email, storage_used, plan, handle, github_id)', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
              github_login: 'testuser',
              avatar_url: null,
            },
          ]),
        }),
      }),
    });

    const res = await app.request(makeRequest('/api/users/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    // Verify PII fields are absent
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('storage_used');
    expect(body).not.toHaveProperty('plan');
    expect(body).not.toHaveProperty('handle');
    expect(body).not.toHaveProperty('github_id');
    expect(body).not.toHaveProperty('created_at');

    // Only allowed fields present
    expect(Object.keys(body).sort()).toEqual(['avatar_url', 'github_login', 'id']);
  });
});
