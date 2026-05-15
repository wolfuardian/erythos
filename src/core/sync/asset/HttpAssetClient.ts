/**
 * HttpAssetClient — HTTP implementation of AssetSyncClient.
 *
 * Communicates with the three asset REST endpoints (Phase F refs #957):
 *   HEAD /assets/:hash  → headHash()
 *   POST /assets        → upload()
 *   GET  /assets/:hash  → download()
 *
 * Default base URL is resolved from `defaultBaseUrl()` which already includes
 * the `/api` prefix (see src/core/sync/baseUrl.ts, Phase E E7-2 #925).
 * So fetch paths use `${baseUrl}/assets/:hash` — NOT `/api/assets/:hash`.
 *
 * Auth: all mutating requests include `credentials: 'include'` (session cookie).
 * POST /assets requires auth (401 = unauthenticated); HEAD and GET are anonymous-OK.
 *
 * Spec ref: docs/asset-sync-protocol.md § REST API
 */

import { defaultBaseUrl } from '../baseUrl';
import { formatErrorMessage } from '../../errors/codes';
import {
  type AssetSyncClient,
  AssetNotFoundError,
  AssetHashMismatchError,
} from './AssetSyncClient';

// ─── Error classes ────────────────────────────────────────────────────────────

/**
 * Thrown on unexpected HTTP errors (5xx, network failure, etc.) from the
 * assets API.  For well-known semantic errors (404 → AssetNotFoundError,
 * 400 hash_mismatch → AssetHashMismatchError) the dedicated error classes are
 * used instead.
 */
export class AssetClientError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'AssetClientError';
  }
}

/**
 * Thrown when POST /assets returns 413 — the upload would exceed the user's
 * per-file or total storage quota.
 */
export class AssetQuotaExceededError extends AssetClientError {
  constructor(message = 'Asset quota exceeded') {
    super(message, 413);
    this.name = 'AssetQuotaExceededError';
  }
}

// ─── HttpAssetClient ──────────────────────────────────────────────────────────

export class HttpAssetClient implements AssetSyncClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = defaultBaseUrl()) {
    // Strip trailing slash for safe concatenation
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * HEAD /assets/:hash
   *
   * Returns true if the server already has the asset — skip upload if so.
   * Anonymous-OK.
   *
   * 200 → true
   * 404 → false
   * 5xx / network error → throws AssetClientError
   */
  async headHash(hash: string): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/assets/${encodeURIComponent(hash)}`, {
        method: 'HEAD',
        credentials: 'include',
      });
    } catch (err) {
      throw new AssetClientError(`Network error: ${(err as Error).message}`);
    }

    if (res.status === 200) return true;
    if (res.status === 404) return false;

    if (res.status >= 500) {
      throw new AssetClientError(
        `Server error ${res.status} on HEAD /assets/${hash}`,
        res.status,
      );
    }
    throw new AssetClientError(
      `Unexpected HTTP ${res.status} on HEAD /assets/${hash}`,
      res.status,
    );
  }

  /**
   * POST /assets — multipart upload.
   *
   * Sends `file` (binary Blob) + `expected_hash` (sha256 hex) as multipart form data.
   * The server re-verifies the hash server-side.
   *
   * Idempotent: same hash already on server → 200 (dedup, no quota deduction).
   * New asset: 201 (created).
   *
   * Errors:
   *   401 → AssetClientError (unauthenticated)
   *   400 (hash_mismatch) → AssetHashMismatchError
   *   413 → AssetQuotaExceededError
   *   5xx → AssetClientError
   */
  async upload(blob: Blob, expectedHash: string): Promise<{ hash: string; url: string }> {
    const form = new FormData();
    form.append('file', blob);
    form.append('expected_hash', expectedHash);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/assets`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
    } catch (err) {
      throw new AssetClientError(`Network error: ${(err as Error).message}`);
    }

    if (res.status === 401) {
      let body: { error?: string; code?: string } = {};
      try { body = await res.json() as typeof body; } catch { /* ignore */ }
      const msg = body.code
        ? formatErrorMessage(body.code, body.error ?? 'Not signed in')
        : body.error ?? 'Upload requires authentication (not signed in)';
      throw new AssetClientError(msg, 401);
    }

    if (res.status === 413) {
      let body: { error?: string; code?: string } = {};
      try { body = await res.json() as typeof body; } catch { /* ignore */ }
      const msg = body.code
        ? formatErrorMessage(body.code, body.error ?? 'Asset quota exceeded')
        : body.error ?? 'Asset quota exceeded';
      throw new AssetQuotaExceededError(msg);
    }

    if (res.status === 400) {
      // Parse body — server returns { error, code } shape.
      // hash_mismatch (E1203) → AssetHashMismatchError; other 400s → AssetClientError.
      let body: { error?: string; code?: string } = {};
      try {
        body = await res.json() as typeof body;
      } catch { /* ignore JSON parse error */ }

      if (body.code === 'E1203 ERR_ASSET_HASH_MISMATCH' || body.error === 'Asset hash mismatch') {
        throw new AssetHashMismatchError(expectedHash, '(server-computed)');
      }
      const msg = body.code
        ? formatErrorMessage(body.code, body.error ?? 'Bad request')
        : body.error ?? `Bad request on POST /assets`;
      throw new AssetClientError(msg, 400);
    }

    if (res.status === 200 || res.status === 201) {
      const payload = await res.json() as { hash: string; url: string };
      return { hash: payload.hash, url: payload.url };
    }

    if (res.status >= 500) {
      throw new AssetClientError(`Server error ${res.status} on POST /assets`, res.status);
    }
    throw new AssetClientError(`Unexpected HTTP ${res.status} on POST /assets`, res.status);
  }

  /**
   * GET /assets/:hash
   *
   * Downloads the binary blob for the given sha256 hash.
   * Anonymous-OK (content-addressed — knowing the hash proves content knowledge).
   *
   * 200 → Blob
   * 404 → AssetNotFoundError
   * 5xx / network error → AssetClientError
   */
  async download(hash: string): Promise<Blob> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/assets/${encodeURIComponent(hash)}`, {
        credentials: 'include',
      });
    } catch (err) {
      throw new AssetClientError(`Network error: ${(err as Error).message}`);
    }

    if (res.status === 404) {
      throw new AssetNotFoundError(hash);
    }

    if (!res.ok) {
      if (res.status >= 500) {
        throw new AssetClientError(
          `Server error ${res.status} on GET /assets/${hash}`,
          res.status,
        );
      }
      throw new AssetClientError(
        `Unexpected HTTP ${res.status} on GET /assets/${hash}`,
        res.status,
      );
    }

    return res.blob();
  }
}
