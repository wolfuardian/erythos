/**
 * MockAssetServer — in-memory implementation of AssetSyncClient.
 *
 * Simulates HEAD / POST (idempotent + hash verification) / GET.
 * Intended for unit tests and offline development; not for production.
 *
 * Spec: docs/asset-sync-protocol.md § REST API
 */
import type { AssetSyncClient } from './AssetSyncClient';
import { AssetNotFoundError, AssetHashMismatchError } from './AssetSyncClient';
import { sha256 } from './sha256';

interface AssetRecord {
  blob: Blob;
  filename: string;
}

export class MockAssetServer implements AssetSyncClient {
  private readonly store = new Map<string, AssetRecord>();

  /** Expose the internal store for test introspection if needed. */
  get size(): number {
    return this.store.size;
  }

  /**
   * HEAD /assets/:hash — true if asset already stored.
   */
  async headHash(hash: string): Promise<boolean> {
    return this.store.has(hash);
  }

  /**
   * POST /assets — upload with hash verification.
   *
   * - If `expectedHash` doesn't match the actual sha256 of `blob` → throws AssetHashMismatchError (400).
   * - If hash already stored → returns existing record immediately (idempotent, 200 OK).
   * - Otherwise stores the blob and returns url (201 Created).
   */
  async upload(blob: Blob, expectedHash: string): Promise<{ hash: string; url: string }> {
    const buffer = await blob.arrayBuffer();
    const actualHash = await sha256(buffer);

    if (actualHash !== expectedHash) {
      throw new AssetHashMismatchError(expectedHash, actualHash);
    }

    // Idempotent: same hash already present → return success without re-storing.
    if (this.store.has(actualHash)) {
      const existing = this.store.get(actualHash)!;
      return { hash: actualHash, url: `assets://${actualHash}/${existing.filename}` };
    }

    // Derive filename from blob.name if available (File extends Blob and has .name).
    const filename = (blob as File).name ?? 'asset';
    this.store.set(actualHash, { blob, filename });
    return { hash: actualHash, url: `assets://${actualHash}/${filename}` };
  }

  /**
   * GET /assets/:hash — download the blob for the given hash.
   * Throws AssetNotFoundError (404) if not present.
   */
  async download(hash: string): Promise<Blob> {
    const record = this.store.get(hash);
    if (!record) throw new AssetNotFoundError(hash);
    return record.blob;
  }
}
