import { describe, it, expect, beforeEach } from 'vitest';
import { sha256 } from './sha256';
import { MockAssetServer } from './MockAssetServer';
import { AssetNotFoundError, AssetHashMismatchError } from './AssetSyncClient';

// ---------------------------------------------------------------------------
// sha256 util
// ---------------------------------------------------------------------------
describe('sha256', () => {
  it('returns a 64-character lowercase hex string', async () => {
    const buf = new TextEncoder().encode('hello').buffer as ArrayBuffer;
    const hash = await sha256(buf);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('matches known RFC vector: sha256("") = e3b0c44...', async () => {
    // SHA-256 of empty string — NIST / RFC known vector
    const hash = await sha256(new ArrayBuffer(0));
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches known vector: sha256("abc")', async () => {
    const buf = new TextEncoder().encode('abc').buffer as ArrayBuffer;
    const hash = await sha256(buf);
    // SHA-256 of 'abc' (verified against Node crypto + Python hashlib)
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

// ---------------------------------------------------------------------------
// MockAssetServer
// ---------------------------------------------------------------------------
describe('MockAssetServer', () => {
  let server: MockAssetServer;

  beforeEach(() => {
    server = new MockAssetServer();
  });

  // Helpers
  function makeBlob(content: string, filename = 'test.bin'): File {
    return new File([content], filename, { type: 'application/octet-stream' });
  }

  async function hashOf(content: string): Promise<string> {
    const buf = new TextEncoder().encode(content).buffer as ArrayBuffer;
    return sha256(buf);
  }

  it('headHash returns false for unknown hash', async () => {
    expect(await server.headHash('deadbeef')).toBe(false);
  });

  it('upload stores asset and headHash returns true', async () => {
    const content = 'my asset data';
    const hash = await hashOf(content);
    const blob = makeBlob(content, 'asset.bin');

    const result = await server.upload(blob, hash);

    expect(result.hash).toBe(hash);
    expect(result.url).toBe(`assets://${hash}/asset.bin`);
    expect(await server.headHash(hash)).toBe(true);
  });

  it('upload is idempotent: second upload with same hash returns same url', async () => {
    const content = 'idempotent data';
    const hash = await hashOf(content);
    const blob1 = makeBlob(content, 'file.bin');
    const blob2 = makeBlob(content, 'file.bin');

    const first = await server.upload(blob1, hash);
    const second = await server.upload(blob2, hash);

    expect(first.url).toBe(second.url);
    // Store should still contain exactly one entry.
    expect(server.size).toBe(1);
  });

  it('upload throws AssetHashMismatchError when expectedHash does not match blob content', async () => {
    const blob = makeBlob('real content', 'file.bin');
    const wrongHash = 'a'.repeat(64); // definitely wrong

    await expect(server.upload(blob, wrongHash)).rejects.toThrow(AssetHashMismatchError);
  });

  it('download returns the blob after upload', async () => {
    const content = 'downloadable content';
    const hash = await hashOf(content);
    const blob = makeBlob(content, 'download.bin');

    await server.upload(blob, hash);
    const fetched = await server.download(hash);

    const text = await fetched.text();
    expect(text).toBe(content);
  });

  it('download throws AssetNotFoundError for unknown hash', async () => {
    await expect(server.download('0'.repeat(64))).rejects.toThrow(AssetNotFoundError);
  });

  it('POST hash mismatch: actualHash appears in error message', async () => {
    const blob = makeBlob('actual data', 'file.bin');
    const wrongHash = 'b'.repeat(64);

    let caught: unknown;
    try {
      await server.upload(blob, wrongHash);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AssetHashMismatchError);
    const err = caught as AssetHashMismatchError;
    expect(err.expectedHash).toBe(wrongHash);
    // actualHash should be the real sha256 of 'actual data'
    const realHash = await hashOf('actual data');
    expect(err.actualHash).toBe(realHash);
  });

  it('GET 404: AssetNotFoundError contains the requested hash', async () => {
    const missingHash = 'c'.repeat(64);

    let caught: unknown;
    try {
      await server.download(missingHash);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AssetNotFoundError);
    expect((caught as AssetNotFoundError).hash).toBe(missingHash);
  });
});
