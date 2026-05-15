/**
 * ShareTokenClient unit tests
 *
 * Mocks globalThis.fetch per the HttpSyncEngine.test.ts pattern.
 * Covers generate / list / revoke × happy + 401 + 404 + network error + unexpected status.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { ShareTokenClient, ShareTokenError } from './ShareTokenClient';

// ── Setup ─────────────────────────────────────────────────────────────────────

const BASE = 'http://test.example.com/api';
const SCENE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11';
const TOKEN_STR = 'abc123deadbeef00abc123deadbeef00';

function makeClient(): ShareTokenClient {
  return new ShareTokenClient(BASE);
}

function mockResponse(status: number, body: unknown): Response {
  const json = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(json)),
    text: () => Promise.resolve(json),
  } as unknown as Response;
}

let fetchSpy: Mock<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.fn<typeof fetch>();
  globalThis.fetch = fetchSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── generate() ────────────────────────────────────────────────────────────────

describe('ShareTokenClient.generate()', () => {
  it('returns GeneratedToken on 201', async () => {
    const payload = {
      token: TOKEN_STR,
      url: `http://localhost:5173/scenes/${SCENE_ID}?share_token=${TOKEN_STR}`,
      created_at: '2026-01-01T00:00:00.000Z',
    };
    fetchSpy.mockResolvedValueOnce(mockResponse(201, payload));

    const result = await makeClient().generate(SCENE_ID);
    expect(result.token).toBe(TOKEN_STR);
    expect(result.url).toContain(SCENE_ID);
    expect(typeof result.created_at).toBe('string');
  });

  it('calls POST /scenes/:id/share-tokens with credentials', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(201, { token: TOKEN_STR, url: 'u', created_at: 't' }));
    await makeClient().generate(SCENE_ID);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/scenes/${SCENE_ID}/share-tokens`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('throws ShareTokenError(401) on 401', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { error: 'Unauthorized' }));
    await expect(makeClient().generate(SCENE_ID)).rejects.toMatchObject({
      name: 'ShareTokenError',
      status: 401,
    });
  });

  it('throws ShareTokenError(404) on 404', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404, { error: 'Not Found' }));
    await expect(makeClient().generate(SCENE_ID)).rejects.toMatchObject({
      name: 'ShareTokenError',
      status: 404,
    });
  });

  it('throws ShareTokenError on unexpected status (e.g. 500)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(500, { error: 'Server Error' }));
    await expect(makeClient().generate(SCENE_ID)).rejects.toBeInstanceOf(ShareTokenError);
  });

  it('throws ShareTokenError on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(makeClient().generate(SCENE_ID)).rejects.toMatchObject({
      name: 'ShareTokenError',
      message: expect.stringContaining('Network error'),
    });
  });
});

// ── list() ────────────────────────────────────────────────────────────────────

describe('ShareTokenClient.list()', () => {
  const activeToken  = { token: TOKEN_STR,   created_at: '2026-01-01T00:00:00.000Z', revoked_at: null };
  const revokedToken = { token: 'revoked000', created_at: '2026-01-01T00:00:00.000Z', revoked_at: '2026-02-01T00:00:00.000Z' };

  it('returns ShareToken[] including revoked on 200', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { tokens: [activeToken, revokedToken] }));
    const tokens = await makeClient().list(SCENE_ID);
    expect(tokens).toHaveLength(2);
    expect(tokens[0].revoked_at).toBeNull();
    expect(tokens[1].revoked_at).toBe('2026-02-01T00:00:00.000Z');
  });

  it('calls GET /scenes/:id/share-tokens with credentials', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { tokens: [] }));
    await makeClient().list(SCENE_ID);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/scenes/${SCENE_ID}/share-tokens`,
      expect.objectContaining({ credentials: 'include' }),
    );
    // No method override — defaults to GET
    const callOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(callOptions.method).toBeUndefined();
  });

  it('returns empty array when no tokens', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { tokens: [] }));
    const tokens = await makeClient().list(SCENE_ID);
    expect(tokens).toEqual([]);
  });

  it('throws ShareTokenError(401) on 401', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(401, {}));
    await expect(makeClient().list(SCENE_ID)).rejects.toMatchObject({
      name: 'ShareTokenError',
      status: 401,
    });
  });

  it('throws ShareTokenError(404) on 404', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404, {}));
    await expect(makeClient().list(SCENE_ID)).rejects.toMatchObject({
      name: 'ShareTokenError',
      status: 404,
    });
  });

  it('throws ShareTokenError on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(makeClient().list(SCENE_ID)).rejects.toMatchObject({
      name: 'ShareTokenError',
      message: expect.stringContaining('Network error'),
    });
  });
});

// ── revoke() ─────────────────────────────────────────────────────────────────

describe('ShareTokenClient.revoke()', () => {
  it('resolves (void) on 204', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(204, ''));
    await expect(makeClient().revoke(SCENE_ID, TOKEN_STR)).resolves.toBeUndefined();
  });

  it('calls DELETE /scenes/:id/share-tokens/:token with credentials', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(204, ''));
    await makeClient().revoke(SCENE_ID, TOKEN_STR);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE}/scenes/${SCENE_ID}/share-tokens/${TOKEN_STR}`,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
  });

  it('resolves on 204 for an already-revoked token (idempotent)', async () => {
    // Server returns 204 even for already-revoked — idempotent by spec
    fetchSpy.mockResolvedValueOnce(mockResponse(204, ''));
    await expect(makeClient().revoke(SCENE_ID, TOKEN_STR)).resolves.toBeUndefined();
  });

  it('throws ShareTokenError(401) on 401', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(401, {}));
    await expect(makeClient().revoke(SCENE_ID, TOKEN_STR)).rejects.toMatchObject({
      name: 'ShareTokenError',
      status: 401,
    });
  });

  it('throws ShareTokenError(404) on 404', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404, {}));
    await expect(makeClient().revoke(SCENE_ID, TOKEN_STR)).rejects.toMatchObject({
      name: 'ShareTokenError',
      status: 404,
    });
  });

  it('throws ShareTokenError on unexpected status (e.g. 500)', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(500, {}));
    await expect(makeClient().revoke(SCENE_ID, TOKEN_STR)).rejects.toBeInstanceOf(ShareTokenError);
  });

  it('throws ShareTokenError on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('net::ERR_FAILED'));
    await expect(makeClient().revoke(SCENE_ID, TOKEN_STR)).rejects.toMatchObject({
      name: 'ShareTokenError',
      message: expect.stringContaining('Network error'),
    });
  });
});

// ── ShareTokenError ───────────────────────────────────────────────────────────

describe('ShareTokenError', () => {
  it('has name "ShareTokenError" and optional status', () => {
    const err = new ShareTokenError('bad', 403);
    expect(err.name).toBe('ShareTokenError');
    expect(err.status).toBe(403);
    expect(err.message).toBe('bad');
    expect(err).toBeInstanceOf(Error);
  });

  it('status is undefined when not provided', () => {
    const err = new ShareTokenError('network fail');
    expect(err.status).toBeUndefined();
  });
});
