/**
 * AssetSyncClient — contract for cloud content-addressed asset operations.
 *
 * Mirrors the REST API in docs/asset-sync-protocol.md § REST API:
 *   HEAD /assets/:hash  → headHash()
 *   POST /assets        → upload()
 *   GET  /assets/:hash  → download()
 *
 * Implementations:
 *   - MockAssetServer  (in-memory, for tests and offline mode)
 *   - (Phase D) HttpAssetClient (real server, refs #843 Out-of-scope)
 */
export interface AssetSyncClient {
  /**
   * Returns true if the server already has an asset with the given sha256 hash.
   * Client should call this before upload to skip redundant transfers.
   */
  headHash(hash: string): Promise<boolean>;

  /**
   * Upload a blob. Client must pre-compute sha256 and pass it as `expectedHash`.
   * Server verifies the hash; throws if mismatched.
   *
   * Idempotent: uploading the same hash twice returns the existing record, not an error.
   *
   * @returns { hash, url } where url is `assets://<hash>/<filename>`
   */
  upload(blob: Blob, expectedHash: string): Promise<{ hash: string; url: string }>;

  /**
   * Download the blob for the given sha256 hash.
   * Throws AssetNotFoundError if the server does not have the asset.
   */
  download(hash: string): Promise<Blob>;
}

export class AssetNotFoundError extends Error {
  constructor(public readonly hash: string) {
    super(`AssetSyncClient: asset not found: ${hash}`);
    this.name = 'AssetNotFoundError';
  }
}

export class AssetHashMismatchError extends Error {
  constructor(
    public readonly expectedHash: string,
    public readonly actualHash: string,
  ) {
    super(
      `AssetSyncClient: hash mismatch — expected ${expectedHash}, got ${actualHash}`,
    );
    this.name = 'AssetHashMismatchError';
  }
}
