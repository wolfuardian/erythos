import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  HttpAssetClient,
  AssetClientError,
  AssetQuotaExceededError,
} from './HttpAssetClient';
import { AssetNotFoundError, AssetHashMismatchError } from './AssetSyncClient';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://erythos.app/api';

type FetchMockInit = {
  status: number;
  body?: unknown;
  bodyRaw?: BodyInit;
  ok?: boolean;
};

function mockFetch(responses: FetchMockInit[]): void {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const r = responses[Math.min(call++, responses.length - 1)];
      const ok = r.ok ?? (r.status >= 200 && r.status < 300);
      return Promise.resolve({
        ok,
        status: r.status,
        json: () => Promise.resolve(r.body ?? null),
        blob: () =>
          Promise.resolve(
            r.bodyRaw instanceof Blob
              ? r.bodyRaw
              : new Blob([String(r.body ?? '')], { type: 'application/octet-stream' }),
          ),
      });
    }),
  );
}

function mockFetchSingle(status: number, body?: unknown): void {
  mockFetch([{ status, body }]);
}

function mockFetchNetworkError(message = 'Connection refused'): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── headHash ────────────────────────────────────────────────────────────────

describe('HttpAssetClient.headHash', () => {
  it('200 → returns true (asset exists)', async () => {
    mockFetchSingle(200);
    const client = new HttpAssetClient(BASE_URL);
    expect(await client.headHash('abc123')).toBe(true);
  });

  it('404 → returns false (asset not found)', async () => {
    mockFetchSingle(404);
    const client = new HttpAssetClient(BASE_URL);
    expect(await client.headHash('deadbeef')).toBe(false);
  });

  it('500 → throws AssetClientError with status', async () => {
    mockFetchSingle(500);
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.headHash('abc')).rejects.toThrow(AssetClientError);
    await expect(client.headHash('abc')).rejects.toMatchObject({ status: 500 });
  });

  it('network error → throws AssetClientError with Network error prefix', async () => {
    mockFetchNetworkError('Connection refused');
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.headHash('abc')).rejects.toThrow(AssetClientError);
    await expect(client.headHash('abc')).rejects.toThrow('Network error');
  });

  it('calls HEAD /assets/:hash with credentials: include', async () => {
    mockFetchSingle(200);
    const client = new HttpAssetClient(BASE_URL);
    await client.headHash('myhash');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/assets/myhash`,
      expect.objectContaining({ method: 'HEAD', credentials: 'include' }),
    );
  });
});

// ─── upload ───────────────────────────────────────────────────────────────────

describe('HttpAssetClient.upload', () => {
  const fakeBlob = new Blob(['hello'], { type: 'application/octet-stream' });
  const fakeHash = 'abc'.repeat(21) + 'a'; // 64-char dummy hash

  it('201 → returns { hash, url }', async () => {
    const payload = { hash: fakeHash, url: `assets://${fakeHash}/hello.bin` };
    mockFetchSingle(201, payload);
    const client = new HttpAssetClient(BASE_URL);
    const result = await client.upload(fakeBlob, fakeHash);
    expect(result.hash).toBe(fakeHash);
    expect(result.url).toBe(payload.url);
  });

  it('200 (dedup) → returns { hash, url }', async () => {
    const payload = { hash: fakeHash, url: `assets://${fakeHash}/hello.bin`, deduped: true };
    mockFetchSingle(200, payload);
    const client = new HttpAssetClient(BASE_URL);
    const result = await client.upload(fakeBlob, fakeHash);
    expect(result.hash).toBe(fakeHash);
  });

  it('401 → throws AssetClientError with status 401 and formatted message', async () => {
    mockFetchSingle(401, { error: 'Not signed in', code: 'E1206 ERR_ASSET_UNAUTHORIZED' });
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toThrow(AssetClientError);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toMatchObject({ status: 401 });
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toMatchObject({
      message: 'Not signed in (E1206 ERR_ASSET_UNAUTHORIZED)',
    });
  });

  it('400 hash_mismatch (new error code shape) → throws AssetHashMismatchError', async () => {
    mockFetchSingle(400, { error: 'Asset hash mismatch', code: 'E1203 ERR_ASSET_HASH_MISMATCH' });
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toThrow(AssetHashMismatchError);
  });

  it('413 → throws AssetQuotaExceededError with formatted message', async () => {
    mockFetchSingle(413, { error: 'Asset exceeds 50 MB per-file limit', code: 'E1201 ERR_ASSET_PER_FILE_QUOTA_EXCEEDED' });
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toThrow(AssetQuotaExceededError);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toMatchObject({ status: 413 });
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toMatchObject({
      message: 'Asset exceeds 50 MB per-file limit (E1201 ERR_ASSET_PER_FILE_QUOTA_EXCEEDED)',
    });
  });

  it('500 → throws AssetClientError with status 500', async () => {
    mockFetchSingle(500, { error: 'Internal Server Error' });
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toThrow(AssetClientError);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toMatchObject({ status: 500 });
  });

  it('network error → throws AssetClientError', async () => {
    mockFetchNetworkError('ECONNREFUSED');
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toThrow(AssetClientError);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toThrow('Network error');
  });

  it('calls POST /assets with credentials: include and FormData body', async () => {
    const payload = { hash: fakeHash, url: `assets://${fakeHash}/hello.bin` };
    mockFetchSingle(201, payload);
    const client = new HttpAssetClient(BASE_URL);
    await client.upload(fakeBlob, fakeHash);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/assets`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const callArgs = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(callArgs.body).toBeInstanceOf(FormData);
  });

  it('400 non-hash-mismatch (with code) → throws AssetClientError with formatted message', async () => {
    mockFetchSingle(400, { error: "Missing 'file' field", code: 'E1205 ERR_ASSET_MISSING_FILE_FIELD' });
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toThrow(AssetClientError);
    await expect(client.upload(fakeBlob, fakeHash)).rejects.toMatchObject({
      message: "Missing 'file' field (E1205 ERR_ASSET_MISSING_FILE_FIELD)",
    });
  });
});

// ─── download ─────────────────────────────────────────────────────────────────

describe('HttpAssetClient.download', () => {
  it('200 → returns Blob', async () => {
    const contentBlob = new Blob(['binary data'], { type: 'model/gltf-binary' });
    mockFetch([{ status: 200, bodyRaw: contentBlob }]);
    const client = new HttpAssetClient(BASE_URL);
    const result = await client.download('myhash');
    expect(result).toBeInstanceOf(Blob);
  });

  it('404 → throws AssetNotFoundError', async () => {
    mockFetchSingle(404, { error: 'Not Found' });
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.download('missinghash')).rejects.toThrow(AssetNotFoundError);
    await expect(client.download('missinghash')).rejects.toMatchObject({ hash: 'missinghash' });
  });

  it('500 → throws AssetClientError with status 500', async () => {
    mockFetchSingle(500, { error: 'Internal Server Error' });
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.download('myhash')).rejects.toThrow(AssetClientError);
    await expect(client.download('myhash')).rejects.toMatchObject({ status: 500 });
  });

  it('network error → throws AssetClientError', async () => {
    mockFetchNetworkError('Connection timed out');
    const client = new HttpAssetClient(BASE_URL);
    await expect(client.download('myhash')).rejects.toThrow(AssetClientError);
    await expect(client.download('myhash')).rejects.toThrow('Network error');
  });

  it('calls GET /assets/:hash with credentials: include', async () => {
    const contentBlob = new Blob(['data']);
    mockFetch([{ status: 200, bodyRaw: contentBlob }]);
    const client = new HttpAssetClient(BASE_URL);
    await client.download('testhash');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${BASE_URL}/assets/testhash`,
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('AssetNotFoundError contains the requested hash', async () => {
    const hash = 'c'.repeat(64);
    mockFetchSingle(404, { error: 'Not Found' });
    const client = new HttpAssetClient(BASE_URL);
    let caught: unknown;
    try {
      await client.download(hash);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AssetNotFoundError);
    expect((caught as AssetNotFoundError).hash).toBe(hash);
  });
});
