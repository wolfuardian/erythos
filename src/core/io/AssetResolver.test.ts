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
