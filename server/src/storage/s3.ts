/**
 * Asset Object Storage (S3-compatible — Linode) — F-1a.
 *
 * Used by future POST /api/assets / GET /api/assets/:hash / HEAD /api/assets/:hash
 * endpoints (F-1b/c).  Module exports a singleton S3Client + env vars.
 *
 * NOT mounted to index.ts yet — endpoint wiring is F-1c work.
 *
 * Env vars (additive to existing S3_* backup vars from #951):
 *   S3_ENDPOINT          — shared with backup (same Linode region endpoint)
 *   S3_ASSETS_BUCKET     — asset bucket name (separate from S3_BUCKET=erythos-backups)
 *   S3_REGION            — Linode region (e.g. ap-south-1)
 *   AWS_ACCESS_KEY_ID    — shared with backup (or separate key with bucket scope)
 *   AWS_SECRET_ACCESS_KEY
 *
 * Access key decision: shared with backup bucket credentials.  A single Linode
 * Object Storage access key can be scoped to multiple buckets; splitting into
 * separate AWS_ASSETS_ACCESS_KEY_ID / AWS_ASSETS_SECRET_ACCESS_KEY adds ops
 * complexity with no security gain at this stage.  Follow-up issue if stricter
 * isolation is required later.
 */

import { S3Client } from '@aws-sdk/client-s3';

export const S3_ENDPOINT = process.env.S3_ENDPOINT ?? '';
export const S3_ASSETS_BUCKET = process.env.S3_ASSETS_BUCKET ?? '';
export const S3_REGION = process.env.S3_REGION ?? 'ap-south-1';

/** S3Client singleton — lazy init. Throws if required env vars are missing. */
let _client: S3Client | null = null;

export function getAssetsS3Client(): S3Client {
  if (_client) return _client;
  if (!S3_ENDPOINT || !S3_ASSETS_BUCKET) {
    throw new Error(
      'S3_ENDPOINT or S3_ASSETS_BUCKET missing — asset upload disabled',
    );
  }
  _client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    forcePathStyle: true, // Linode requires path-style addressing
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
  });
  return _client;
}

/** Build the public asset storage URL for a given content hash + filename. */
export function buildAssetStorageUrl(hash: string, filename: string): string {
  return `${S3_ENDPOINT}/${S3_ASSETS_BUCKET}/${hash}/${encodeURIComponent(filename)}`;
}
