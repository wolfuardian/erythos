/**
 * Unit tests for asset routes (F-1c).
 *
 * Strategy: mock db module (no real Postgres), mock storage/s3 module (no real S3).
 * Hono app exercised via app.request() — no network required.
 *
 * S3 mock: vi.mock('../storage/s3.js') returning a fake getAssetsS3Client()
 * whose .send() is a vi.fn(). This mocks the thin wrapper, not @aws-sdk/client-s3
 * directly — cleaner and decoupled from AWS SDK internals.
 *
 * Covered:
 *   HEAD /assets/:hash  — 200 (exists), 404 (not found)
 *   POST /assets        — 201 (new upload), 200 (dedup), 400 (hash_mismatch),
 *                         413 (per-file quota), 413 (total quota), 401 (unauth)
 *   GET  /assets/:hash  — 200 (stream), 404 (not found)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Mocks — must be registered before any module-under-test import
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockTransaction = vi.fn();

vi.mock('../db.js', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    transaction: mockTransaction,
  },
  pool: {},
}));

// resolveSession — by default returns null (unauthenticated)
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

// S3 mock — mock our thin wrapper, not the AWS SDK directly
const mockS3Send = vi.fn();
const mockGetAssetsS3Client = vi.fn(() => ({ send: mockS3Send }));

vi.mock('../storage/s3.js', () => ({
  getAssetsS3Client: () => mockGetAssetsS3Client(),
  S3_ASSETS_BUCKET: 'test-bucket',
  S3_REGION: 'ap-south-1',
  S3_ENDPOINT: 'https://test-endpoint.example.com',
  buildAssetStorageUrl: (hash: string, filename: string) =>
    `https://test-endpoint.example.com/test-bucket/${hash}/${encodeURIComponent(filename)}`,
}));

// ---------------------------------------------------------------------------
// Import router under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { assetRoutes } = await import('../routes/assets.js');

const app = new Hono();
const api = new Hono();
api.route('/assets', assetRoutes);
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

/** Fake authenticated user with 0 storage_used */
const FAKE_USER = {
  id: 'user-1',
  github_id: 1,
  github_login: 'alice',
  email: 'alice@example.com',
  avatar_url: 'https://avatars.githubusercontent.com/u/1',
  handle: 'alice',
  storage_used: 0,
};

/** Build a select chain that returns given rows on final await */
function selectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** Build a chainable update mock */
function updateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
}

/** Minimal fake asset row */
function fakeAsset(overrides: Record<string, unknown> = {}) {
  const hash = 'a'.repeat(64);
  return {
    hash,
    filename: 'test.hdr',
    mimeType: 'image/vnd.radiance',
    size: BigInt(1024),
    storageUrl: `https://test-endpoint.example.com/test-bucket/${hash}/test.hdr`,
    uploadedBy: FAKE_USER.id,
    uploadedAt: new Date(),
    refCount: 0,
    ...overrides,
  };
}

/** Build a valid multipart FormData with a file and expected_hash */
async function buildFormData(content: Uint8Array, filename = 'test.hdr'): Promise<FormData> {
  const hash = createHash('sha256').update(content).digest('hex');
  const fd = new FormData();
  fd.append('file', new File([content], filename, { type: 'image/vnd.radiance' }));
  fd.append('expected_hash', hash);
  return fd;
}

/** Build a Request with FormData body (multipart) */
async function multipartRequest(
  path: string,
  formData: FormData,
  cookie?: string,
): Promise<Request> {
  const init: RequestInit = { method: 'POST', body: formData };
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

// ---------------------------------------------------------------------------
// HEAD /assets/:hash
// ---------------------------------------------------------------------------

describe('HEAD /api/assets/:hash', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with Content-Length and ETag when asset exists', async () => {
    mockSelect.mockReturnValue(selectChain([fakeAsset()]));

    const res = await app.request(
      makeRequest(`/api/assets/${'a'.repeat(64)}`, { method: 'HEAD' }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe('1024');
    expect(res.headers.get('ETag')).toBe(`"${'a'.repeat(64)}"`);
  });

  it('returns 404 when asset does not exist', async () => {
    mockSelect.mockReturnValue(selectChain([]));

    const res = await app.request(
      makeRequest(`/api/assets/${'b'.repeat(64)}`, { method: 'HEAD' }),
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /assets
// ---------------------------------------------------------------------------

describe('POST /api/assets', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveSession.mockResolvedValue(FAKE_USER);
    mockS3Send.mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
        update: vi.fn().mockReturnValue(updateChain()),
      };
      return fn(tx);
    });
  });

  it('returns 201 with hash and url on new upload', async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const expectedHash = createHash('sha256').update(content).digest('hex');
    const fd = await buildFormData(content, 'test.hdr');

    // First select: users plan lookup; second select: dedup check (asset not found)
    mockSelect
      .mockReturnValueOnce(selectChain([{ plan: 'free' }]))    // users plan
      .mockReturnValueOnce(selectChain([]));                    // asset dedup check

    const res = await app.request(await multipartRequest('/api/assets', fd, 'session=tok'));

    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.hash).toBe(expectedHash);
    expect(body.url).toBe(`assets://${expectedHash}/test.hdr`);
    expect(mockS3Send).toHaveBeenCalledOnce();
  });

  it('returns 200 with deduped:true when same hash is uploaded again', async () => {
    const content = new Uint8Array([1, 2, 3]);
    const hash = createHash('sha256').update(content).digest('hex');
    const fd = await buildFormData(content, 'test.hdr');

    // First select: users plan lookup; second select: dedup check returns existing asset
    mockSelect
      .mockReturnValueOnce(selectChain([{ plan: 'free' }]))
      .mockReturnValueOnce(selectChain([fakeAsset({ hash, filename: 'test.hdr' })]));

    const res = await app.request(await multipartRequest('/api/assets', fd, 'session=tok'));

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.deduped).toBe(true);
    // S3 should NOT be called on dedup
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('returns 400 when server-computed hash does not match expected_hash', async () => {
    const content = new Uint8Array([1, 2, 3]);
    const fd = new FormData();
    fd.append('file', new File([content], 'test.hdr', { type: 'image/vnd.radiance' }));
    fd.append('expected_hash', 'wrong_hash_value_that_does_not_match');

    // Plan lookup
    mockSelect.mockReturnValueOnce(selectChain([{ plan: 'free' }]));

    const res = await app.request(await multipartRequest('/api/assets', fd, 'session=tok'));

    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('hash_mismatch');
  });

  it('returns 413 when file exceeds per-file limit for free plan (50 MB)', async () => {
    // Create a buffer just over 50 MB
    const overLimit = 50 * 1024 * 1024 + 1;
    // Don't actually allocate 50 MB — mock the File size instead by creating
    // a minimal content but mocking formData parsing
    // Instead, we test by creating actual formData and verifying the limit check.
    // We use a 1-byte file and fake the plan limit to 0 to trigger the per-file check.
    const content = new Uint8Array(1);
    const fd = new FormData();
    // Override: we create a custom File-like object with a large size
    // Vitest environment supports File API
    const largeFakeBuffer = Buffer.alloc(overLimit);
    const hash = createHash('sha256').update(largeFakeBuffer).digest('hex');
    fd.append('file', new File([largeFakeBuffer], 'big.hdr', { type: 'image/vnd.radiance' }));
    fd.append('expected_hash', hash);

    mockSelect.mockReturnValueOnce(selectChain([{ plan: 'free' }]));

    const res = await app.request(await multipartRequest('/api/assets', fd, 'session=tok'));

    expect(res.status).toBe(413);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('quota_exceeded');
  }, 15000); // extended timeout for large buffer creation

  it('returns 413 when total storage quota would be exceeded', async () => {
    const content = new Uint8Array([1, 2, 3]);
    const fd = await buildFormData(content, 'test.hdr');

    // User is at 499 MB storage_used, file is 3 bytes → total is within 500 MB limit,
    // so let's set storage_used to just under total quota - 2 bytes to force exceed
    const nearLimitUser = {
      ...FAKE_USER,
      storage_used: 500 * 1024 * 1024 - 2, // 500MB - 2 bytes
    };
    mockResolveSession.mockResolvedValue(nearLimitUser);

    // Plan lookup
    mockSelect.mockReturnValueOnce(selectChain([{ plan: 'free' }]));
    // Dedup check: not found
    mockSelect.mockReturnValueOnce(selectChain([]));

    const res = await app.request(await multipartRequest('/api/assets', fd, 'session=tok'));

    expect(res.status).toBe(413);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('quota_exceeded');
  });

  it('returns 401 when not authenticated', async () => {
    mockResolveSession.mockResolvedValue(null);

    const content = new Uint8Array([1]);
    const fd = await buildFormData(content, 'test.hdr');

    const res = await app.request(await multipartRequest('/api/assets', fd));

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /assets/:hash
// ---------------------------------------------------------------------------

describe('GET /api/assets/:hash', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with content-type, cache-control, etag headers and streams body', async () => {
    const hash = 'a'.repeat(64);
    mockSelect.mockReturnValue(selectChain([fakeAsset({ hash })]));

    // Mock S3 GetObject response with a simple readable stream
    const { Readable } = await import('node:stream');
    const fakeBody = Readable.from([Buffer.from('fake-binary-content')]);
    mockS3Send.mockResolvedValue({ Body: fakeBody });

    const res = await app.request(makeRequest(`/api/assets/${hash}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('image/vnd.radiance');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('ETag')).toBe(`"${hash}"`);

    const text = await res.text();
    expect(text).toBe('fake-binary-content');
  });

  it('returns 404 when asset does not exist in DB', async () => {
    mockSelect.mockReturnValue(selectChain([]));

    const res = await app.request(makeRequest(`/api/assets/${'c'.repeat(64)}`));

    expect(res.status).toBe(404);
  });

  it('returns 404 when S3 returns no Body', async () => {
    mockSelect.mockReturnValue(selectChain([fakeAsset()]));
    mockS3Send.mockResolvedValue({ Body: null });

    const res = await app.request(makeRequest(`/api/assets/${'a'.repeat(64)}`));

    expect(res.status).toBe(404);
  });
});
