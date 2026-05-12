/**
 * Asset routes — 3 REST endpoints (F-1c)
 *
 * HEAD /assets/:hash — Check if asset exists (anonymous OK; content-addressed
 *   hash provides natural access control — you need to know the hash to probe).
 *   200 + Content-Length + ETag if found, 404 otherwise.
 *
 * POST /assets — Upload asset via multipart/form-data (auth required).
 *   Fields: file (binary) + expected_hash (sha256 hex from client).
 *   Server re-computes sha256 and compares; mismatch → 400.
 *   Dedup: hash already in DB → 200 (idempotent, no quota deduction).
 *   New asset: quota check → S3 PutObject → INSERT assets + UPDATE storage_used → 201.
 *
 * GET /assets/:hash — Download asset binary (anonymous OK; immutable content).
 *   Streams S3 object bytes. Cache-Control: public, max-age=31536000, immutable.
 *
 * Auth decision: POST requires auth; HEAD and GET are anonymous-OK.
 * Rationale: hash is 64-char sha256 hex — knowing the hash already grants proof
 * of content knowledge. Cache-Control: public, immutable on GET signals anonymous
 * read intent. Gating HEAD while allowing anonymous GET adds no security.
 * This aligns with how GET /scenes/:id is anonymous for public scenes.
 *
 * Quota (hard-coded v0, per spec § Quota):
 *   free plan: 500 MB total, 50 MB per file
 *   pro  plan: 50 GB total, 500 MB per file
 *
 * S3 ordering on POST: SHA-256 verify → dedup check → quota check → S3 PUT →
 * DB INSERT + storage_used UPDATE. If DB INSERT fails after S3 PUT, a best-effort
 * DeleteObjectCommand is attempted (see PR notes for residual gap).
 */

import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { eq, sql } from 'drizzle-orm';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { db } from '../db.js';
import { assets, users } from '../db/schema.js';
import { resolveSession } from '../auth.js';
import { counters } from '../counters.js';
import { getAssetsS3Client, S3_ASSETS_BUCKET, buildAssetStorageUrl } from '../storage/s3.js';
import type { Context, Next } from 'hono';

// ---------------------------------------------------------------------------
// Quota constants (v0 hard-coded — move to env later)
// ---------------------------------------------------------------------------

/** Free plan: 50 MB per file */
const FREE_PER_FILE_LIMIT = 50 * 1024 * 1024;
/** Pro plan: 500 MB per file */
const PRO_PER_FILE_LIMIT = 500 * 1024 * 1024;
/** Free plan: 500 MB total storage */
const FREE_TOTAL_QUOTA = 500 * 1024 * 1024;
/** Pro plan: 50 GB total storage */
const PRO_TOTAL_QUOTA = 50 * 1024 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Auth middleware — applied only to POST
// ---------------------------------------------------------------------------

type Variables = {
  user: {
    id: string;
    github_id: number | null;
    handle: string | null;
    storage_used: number;
    plan?: string;
  };
};

async function authMiddleware(c: Context, next: Next) {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', user);
  await next();
}

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

export const assetRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// HEAD /assets/:hash — existence check (anonymous OK)
//
// Note: Hono 4.x routes HEAD requests to the GET handler automatically,
// ignoring explicitly registered HEAD routes when a GET handler exists for
// the same path. We therefore implement HEAD logic inside the GET handler
// below by checking c.req.method === 'HEAD' and returning early before the
// S3 call. See GET /assets/:hash implementation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST /assets — upload asset (auth required)
// ---------------------------------------------------------------------------

assetRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');

  // Parse multipart form data (Hono built-in, no extra dep needed)
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: 'Invalid multipart form data' }, 400);
  }

  const fileEntry = formData.get('file');
  const expectedHash = formData.get('expected_hash');

  if (!(fileEntry instanceof File)) {
    return c.json({ error: 'file field is required' }, 400);
  }
  if (typeof expectedHash !== 'string' || !expectedHash) {
    return c.json({ error: 'expected_hash field is required' }, 400);
  }

  const filename = fileEntry.name || 'upload';
  const mimeType = fileEntry.type || 'application/octet-stream';
  const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
  const fileSize = fileBuffer.length;

  // --- Per-file size limit ---
  // Load user plan to determine limits. resolveSession only returns storage_used,
  // so we re-query users table for plan field.
  const userRows = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const plan = userRows[0]?.plan ?? 'free';

  const perFileLimit = plan === 'pro' ? PRO_PER_FILE_LIMIT : FREE_PER_FILE_LIMIT;
  const totalQuota = plan === 'pro' ? PRO_TOTAL_QUOTA : FREE_TOTAL_QUOTA;

  if (fileSize > perFileLimit) {
    return c.json({ error: 'quota_exceeded' }, 413);
  }

  // --- Server-side SHA-256 verification ---
  const serverHash = createHash('sha256').update(fileBuffer).digest('hex');
  if (serverHash !== expectedHash) {
    return c.json({ error: 'hash_mismatch' }, 400);
  }

  const hash = serverHash;

  // --- Dedup check: asset already in DB ---
  const existingRows = await db
    .select()
    .from(assets)
    .where(eq(assets.hash, hash))
    .limit(1);

  if (existingRows[0]) {
    // Already stored — idempotent return, no quota deduction
    const existing = existingRows[0];
    counters.asset_dedup_hit_total += 1;
    const url = `assets://${existing.hash}/${existing.filename}`;
    return c.json({ hash: existing.hash, url, deduped: true }, 200);
  }

  // --- Quota check (total storage) ---
  if (user.storage_used + fileSize > totalQuota) {
    return c.json({ error: 'quota_exceeded' }, 413);
  }

  // --- S3 PutObject ---
  const s3Key = `${hash}/${encodeURIComponent(filename)}`;
  const s3Client = getAssetsS3Client();

  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_ASSETS_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType,
        ContentLength: fileSize,
      }),
    );
  } catch (err) {
    throw new Error(`S3 upload failed: ${String(err)}`);
  }

  const storageUrl = buildAssetStorageUrl(hash, filename);

  // --- DB INSERT + storage_used UPDATE ---
  try {
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({
        hash,
        filename,
        mimeType,
        size: BigInt(fileSize), // assets.size is bigint({ mode: 'bigint' })
        storageUrl,
        uploadedBy: user.id,
        refCount: 0,
      });

      await tx
        .update(users)
        .set({ storage_used: sql`storage_used + ${fileSize}` })
        .where(eq(users.id, user.id));
    });
  } catch (dbErr) {
    // Best-effort S3 cleanup on DB failure to avoid orphaned objects
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_ASSETS_BUCKET,
          Key: s3Key,
        }),
      );
    } catch {
      // S3 cleanup failed — log at warn level but don't mask the original error
    }
    throw dbErr;
  }

  counters.asset_upload_total += 1;
  counters.asset_upload_bytes += fileSize;

  const url = `assets://${hash}/${filename}`;
  return c.json({ hash, url }, 201);
});

// ---------------------------------------------------------------------------
// GET /assets/:hash — download asset (anonymous OK, immutable content)
// Also handles HEAD /assets/:hash (Hono 4.x auto-routes HEAD to GET handler).
//
// HEAD: DB lookup only → 200 + headers (no S3, no body) or 404.
// GET:  DB lookup → S3 GetObject → stream body.
// ---------------------------------------------------------------------------

assetRoutes.get('/:hash', async (c) => {
  const hash = c.req.param('hash')!;
  const isHead = c.req.method === 'HEAD';

  // Look up asset metadata
  const rows = await db
    .select()
    .from(assets)
    .where(eq(assets.hash, hash))
    .limit(1);

  const asset = rows[0];
  if (!asset) {
    return isHead ? c.body(null, 404) : c.json({ error: 'Not Found' }, 404);
  }

  // HEAD: return headers without calling S3
  if (isHead) {
    c.header('Content-Length', String(Number(asset.size)));
    c.header('ETag', `"${asset.hash}"`);
    return c.body(null, 200);
  }

  // GET: fetch from S3 and stream body
  const s3Key = `${hash}/${encodeURIComponent(asset.filename)}`;
  const s3Client = getAssetsS3Client();

  const s3Resp = await s3Client.send(
    new GetObjectCommand({
      Bucket: S3_ASSETS_BUCKET,
      Key: s3Key,
    }),
  );

  if (!s3Resp.Body) {
    return c.json({ error: 'Not Found' }, 404);
  }

  // Convert Node.js Readable to web ReadableStream for Hono c.body()
  // s3Resp.Body is a SdkStream<Readable> (Node.js compatible)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeStream = s3Resp.Body as any;
  const webStream: ReadableStream = Readable.toWeb(
    typeof nodeStream.pipe === 'function'
      ? nodeStream
      : Readable.from(nodeStream),
  ) as ReadableStream;

  counters.asset_download_total += 1;

  return c.body(webStream, 200, {
    'Content-Type': asset.mimeType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `"${asset.hash}"`,
    'Content-Length': String(Number(asset.size)),
  });
});
