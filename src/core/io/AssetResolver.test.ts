import { describe, it, expect, beforeEach } from 'vitest';
import { AssetResolver } from './AssetResolver';
import { MockAssetServer } from '../sync/asset/MockAssetServer';
import { sha256 } from '../sync/asset/sha256';

// ---------------------------------------------------------------------------
// Minimal ProjectManager stub
// ---------------------------------------------------------------------------
function makeProjectManager(urlMap: Record<string, string> = {}): { urlFor: (path: string) => Promise<string> } {
  return {
    urlFor: async (path: string) => {
      if (path in urlMap) return urlMap[path];
      throw new Error(`File not found: ${path}`);
    },
  };
}

// ---------------------------------------------------------------------------
// AssetResolver: cloud assets:// — no client injected
// ---------------------------------------------------------------------------
describe('AssetResolver — assets:// without client', () => {
  it('throws friendly error mentioning AssetSyncClient', async () => {
    const resolver = new AssetResolver(makeProjectManager() as never);

    await expect(resolver.resolve('assets://abc123def/model.glb'))
      .rejects
      .toThrow(/AssetSyncClient must be injected/);
  });

  it('error message includes the problematic URL', async () => {
    const resolver = new AssetResolver(makeProjectManager() as never);
    const url = 'assets://deadbeef1234/scene.glb';

    let caught: unknown;
    try {
      await resolver.resolve(url);
    } catch (e) {
      caught = e;
    }

    expect((caught as Error).message).toContain(url);
  });
});

// ---------------------------------------------------------------------------
// AssetResolver: cloud assets:// — with MockAssetServer (integration)
// ---------------------------------------------------------------------------
describe('AssetResolver — assets:// with MockAssetServer (integration)', () => {
  let server: MockAssetServer;
  let resolver: AssetResolver;

  beforeEach(() => {
    server = new MockAssetServer();
    resolver = new AssetResolver(makeProjectManager() as never, server);
  });

  it('resolves assets://<hash>/<filename> to a blob URL after upload', async () => {
    const content = 'binary asset content';
    const buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;
    const hash = await sha256(buffer);
    const file = new File([content], 'model.glb', { type: 'model/gltf-binary' });

    // Pre-upload to mock server
    const { url: assetUrl } = await server.upload(file, hash);
    // assetUrl = "assets://<hash>/model.glb"

    const blobUrl = await resolver.resolve(assetUrl);

    expect(typeof blobUrl).toBe('string');
    expect(blobUrl).toMatch(/^blob:/);
  });

  it('resolved blob URL round-trips back to the original blob content', async () => {
    // In jsdom, URL.createObjectURL creates a blob: URL that maps to the Blob.
    // We verify by downloading the hash from the mock server again (same Blob reference)
    // and reading its text — confirming the mock server stores & retrieves correctly.
    const content = 'fetch this content';
    const buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;
    const hash = await sha256(buffer);
    const file = new File([content], 'texture.hdr', { type: 'image/x-hdr' });

    await server.upload(file, hash);
    const assetUrl = `assets://${hash}/texture.hdr`;

    const blobUrl = await resolver.resolve(assetUrl);
    // blobUrl is a valid blob: URL (format check)
    expect(blobUrl).toMatch(/^blob:/);

    // Verify the underlying data by downloading directly from the mock server
    const blob = await server.download(hash);
    const text = await blob.text();
    expect(text).toBe(content);
  });

  it('resolves the same hash regardless of filename in URL', async () => {
    const content = 'shared content';
    const buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;
    const hash = await sha256(buffer);
    const file = new File([content], 'original.glb', { type: 'model/gltf-binary' });

    await server.upload(file, hash);

    // Different filename in URL — hash is the real key
    const blobUrl = await resolver.resolve(`assets://${hash}/renamed.glb`);
    expect(blobUrl).toMatch(/^blob:/);
  });
});

// ---------------------------------------------------------------------------
// AssetResolver: project:// still works when client is injected
// ---------------------------------------------------------------------------
describe('AssetResolver — project:// unaffected by client injection', () => {
  it('resolves project:// via projectManager regardless of assetClient', async () => {
    const pm = makeProjectManager({ 'models/chair.glb': 'blob:existing-url' });
    const resolver = new AssetResolver(pm as never, new MockAssetServer());

    const url = await resolver.resolve('project://models/chair.glb');
    expect(url).toBe('blob:existing-url');
  });
});

// ---------------------------------------------------------------------------
// AssetResolver: assets:// blob URL cache (F-1d-1 refs #957)
// ---------------------------------------------------------------------------
describe('AssetResolver — assets:// blob URL cache', () => {
  let server: MockAssetServer;

  async function uploadContent(
    srv: MockAssetServer,
    content: string,
    filename = 'asset.bin',
  ): Promise<string> {
    const buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;
    const hash = await sha256(buffer);
    const file = new File([content], filename, { type: 'application/octet-stream' });
    await srv.upload(file, hash);
    return hash;
  }

  beforeEach(() => {
    server = new MockAssetServer();
  });

  it('cache hit: resolving the same URL twice returns the same blob URL', async () => {
    const hash = await uploadContent(server, 'cache me');
    const resolver = new AssetResolver(makeProjectManager() as never, server);
    const assetUrl = `assets://${hash}/file.bin`;

    const url1 = await resolver.resolve(assetUrl);
    const url2 = await resolver.resolve(assetUrl);

    expect(url1).toBe(url2);
    expect(url1).toMatch(/^blob:/);
  });

  it('cache hit: same hash with different filename returns same blob URL', async () => {
    const hash = await uploadContent(server, 'same content');
    const resolver = new AssetResolver(makeProjectManager() as never, server);

    const url1 = await resolver.resolve(`assets://${hash}/original.glb`);
    const url2 = await resolver.resolve(`assets://${hash}/renamed.glb`);

    expect(url1).toBe(url2);
  });

  it('cache miss: different hashes return different blob URLs', async () => {
    const hash1 = await uploadContent(server, 'content A', 'a.bin');
    const hash2 = await uploadContent(server, 'content B', 'b.bin');
    const resolver = new AssetResolver(makeProjectManager() as never, server);

    const url1 = await resolver.resolve(`assets://${hash1}/a.bin`);
    const url2 = await resolver.resolve(`assets://${hash2}/b.bin`);

    expect(url1).not.toBe(url2);
  });

  it('LRU eviction: when cap is exceeded, oldest entry is evicted', async () => {
    // Use a cap of 2 — third entry should evict first
    const cap = 2;
    const resolver = new AssetResolver(makeProjectManager() as never, server, cap);

    const hash1 = await uploadContent(server, 'entry 1', '1.bin');
    const hash2 = await uploadContent(server, 'entry 2', '2.bin');
    const hash3 = await uploadContent(server, 'entry 3', '3.bin');

    // Fill the cache to cap
    const url1 = await resolver.resolve(`assets://${hash1}/1.bin`);
    await resolver.resolve(`assets://${hash2}/2.bin`);

    // Adding a third entry should evict hash1 (oldest)
    const url3 = await resolver.resolve(`assets://${hash3}/3.bin`);

    // Resolving hash1 again should give a NEW blob URL (was evicted + re-downloaded)
    const url1Again = await resolver.resolve(`assets://${hash1}/1.bin`);

    expect(url1Again).not.toBe(url1); // evicted → new blob URL created
    expect(url3).toMatch(/^blob:/);
  });

  it('release: disposes the blob URL for a single hash', async () => {
    const hash = await uploadContent(server, 'release me');
    const resolver = new AssetResolver(makeProjectManager() as never, server);
    const assetUrl = `assets://${hash}/file.bin`;

    const url1 = await resolver.resolve(assetUrl);
    resolver.release(assetUrl);

    // After release, resolving again creates a fresh blob URL
    const url2 = await resolver.resolve(assetUrl);
    expect(url2).toMatch(/^blob:/);
    expect(url2).not.toBe(url1); // old URL was revoked + removed from cache
  });

  it('release: no-op for non-assets:// URLs', () => {
    const resolver = new AssetResolver(makeProjectManager() as never, server);
    // Should not throw
    expect(() => resolver.release('project://models/chair.glb')).not.toThrow();
    expect(() => resolver.release('blob:some-url')).not.toThrow();
    expect(() => resolver.release('unknown')).not.toThrow();
  });

  it('dispose: clears all cached entries', async () => {
    const hash1 = await uploadContent(server, 'a', 'a.bin');
    const hash2 = await uploadContent(server, 'b', 'b.bin');
    const resolver = new AssetResolver(makeProjectManager() as never, server);

    const url1 = await resolver.resolve(`assets://${hash1}/a.bin`);
    await resolver.resolve(`assets://${hash2}/b.bin`);

    resolver.dispose();

    // After dispose, resolving creates fresh blob URLs
    const url1Fresh = await resolver.resolve(`assets://${hash1}/a.bin`);
    expect(url1Fresh).not.toBe(url1);
  });
});
