#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * scripts/backup.mjs — daily pg_dump → Linode Object Storage (S3-compatible)
 *
 * Reads the server/.env file automatically (if present) so the script can
 * be called from cron without manually sourcing env vars.
 *
 * Environment variables (resolved from process.env after .env loading):
 *   DATABASE_URL         — postgres connection string (required)
 *   S3_ENDPOINT          — e.g. https://jp-tyo-1.linodeobjects.com (required)
 *   S3_BUCKET            — bucket name, e.g. erythos-backups (required)
 *   AWS_REGION           — region slug, e.g. jp-tyo-1 (required)
 *   AWS_ACCESS_KEY_ID    — Linode Object Storage access key (required)
 *   AWS_SECRET_ACCESS_KEY — Linode Object Storage secret (required)
 *
 * Aliases accepted for compatibility with the issue-spec naming:
 *   BACKUP_S3_ENDPOINT → S3_ENDPOINT
 *   BACKUP_BUCKET      → S3_BUCKET
 *   BACKUP_S3_REGION   → AWS_REGION
 *   BACKUP_S3_KEY      → AWS_ACCESS_KEY_ID
 *   BACKUP_S3_SECRET   → AWS_SECRET_ACCESS_KEY
 *
 * Usage:
 *   node scripts/backup.mjs           # run backup
 *   node scripts/backup.mjs --dry-run # print plan, skip dump/upload/prune
 *
 * Exit 0 — success (or dry-run completed)
 * Exit 1 — missing required env var or step failure
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createReadStream, existsSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// ── Paths ─────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_ENV = path.join(REPO_ROOT, 'server', '.env');

// ── Load .env ─────────────────────────────────────────────────────────────────
// Simple key=value parser — only runs if server/.env exists.
// Does NOT override vars that are already set in the environment.

if (existsSync(SERVER_ENV)) {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(SERVER_ENV, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// ── Resolve env vars (with BACKUP_* aliases) ─────────────────────────────────

function env(primary, alias) {
  return process.env[primary] ?? process.env[alias] ?? undefined;
}

const DATABASE_URL = env('DATABASE_URL');
const S3_ENDPOINT = env('S3_ENDPOINT', 'BACKUP_S3_ENDPOINT');
const S3_BUCKET = env('S3_BUCKET', 'BACKUP_BUCKET');
const AWS_REGION = env('AWS_REGION', 'BACKUP_S3_REGION');
const AWS_ACCESS_KEY_ID = env('AWS_ACCESS_KEY_ID', 'BACKUP_S3_KEY');
const AWS_SECRET_ACCESS_KEY = env('AWS_SECRET_ACCESS_KEY', 'BACKUP_S3_SECRET');

// ── Flags ─────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

// ── Validate ──────────────────────────────────────────────────────────────────

const REQUIRED = {
  DATABASE_URL,
  S3_ENDPOINT,
  S3_BUCKET,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
};

const missing = Object.entries(REQUIRED)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`[backup] ERROR: missing required env vars: ${missing.join(', ')}`);
  console.error('[backup] Copy server/.env.example → server/.env and fill in the values.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timestamp() {
  const now = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}

function log(msg) {
  process.stdout.write(`[backup] ${msg}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TS = timestamp();
const OBJECT_KEY = `erythos-${TS}.dump.gz`;
const LOCAL_TMP = path.join(tmpdir(), `erythos-backup-${TS}.dump.gz`);

/** How many backups to keep (oldest deleted when over limit). */
const RETENTION_COUNT = 7;

log(`Target bucket : ${S3_BUCKET}`);
log(`S3 endpoint   : ${S3_ENDPOINT}`);
log(`Object key    : ${OBJECT_KEY}`);
log(`Local tmp     : ${LOCAL_TMP}`);
log(`Retention     : keep latest ${RETENTION_COUNT}`);

if (DRY_RUN) {
  log('--dry-run: plan printed above. No dump, upload, or prune performed.');
  process.exit(0);
}

// ── Step 1: pg_dump ──────────────────────────────────────────────────────────

log(`Step 1/3 — pg_dump -Fc "${DATABASE_URL}" | gzip → ${LOCAL_TMP}`);

const pg = spawnSync(
  'pg_dump',
  ['-Fc', '--no-password', DATABASE_URL],
  { stdio: ['ignore', 'pipe', 'inherit'] },
);

if (pg.error) {
  console.error(`[backup] pg_dump launch failed: ${pg.error.message}`);
  console.error('[backup] Is pg_dump installed and on PATH?');
  process.exit(1);
}
if (pg.status !== 0) {
  console.error(`[backup] pg_dump exited with code ${pg.status}`);
  process.exit(1);
}

// Pipe pg_dump stdout through gzip CLI to get a .gz file
const gz = spawnSync('gzip', ['-c'], {
  input: pg.stdout,
  stdio: ['pipe', 'pipe', 'inherit'],
});

if (gz.error || gz.status !== 0) {
  console.error(`[backup] gzip failed: ${gz.error?.message ?? `exit ${gz.status}`}`);
  process.exit(1);
}

import { writeFileSync } from 'node:fs';
writeFileSync(LOCAL_TMP, gz.stdout);

const sizeKB = Math.round(statSync(LOCAL_TMP).size / 1024);
log(`Dump written to ${LOCAL_TMP} (${sizeKB} KB)`);

// ── Step 2: Upload ────────────────────────────────────────────────────────────

log(`Step 2/3 — uploading to s3://${S3_BUCKET}/${OBJECT_KEY}`);

const client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
  // Linode Object Storage does not support path-style access on all endpoints;
  // force path style to avoid virtual-hosted-style issues.
  forcePathStyle: true,
});

try {
  await client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: OBJECT_KEY,
      Body: createReadStream(LOCAL_TMP),
      ContentType: 'application/gzip',
    }),
  );
  log('Upload complete');
} catch (err) {
  console.error(`[backup] Upload failed: ${err.message}`);
  unlinkSync(LOCAL_TMP);
  process.exit(1);
}

// Remove local temp file
unlinkSync(LOCAL_TMP);
log('Local temp file removed');

// ── Step 3: Prune (keep latest RETENTION_COUNT) ───────────────────────────────

log(`Step 3/3 — pruning: keeping latest ${RETENTION_COUNT} backups`);

/** List all objects in the bucket sorted by key (which is ISO-timestamp-prefixed → lexicographic = chronological). */
async function listAllObjects() {
  const all = [];
  let token;
  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        ContinuationToken: token,
      }),
    );
    if (resp.Contents) all.push(...resp.Contents);
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return all;
}

let objects;
try {
  objects = await listAllObjects();
} catch (err) {
  // Non-fatal: backup already uploaded; only pruning failed.
  console.error(`[backup] WARNING: list bucket failed (pruning skipped): ${err.message}`);
  log('Done (with pruning warning)');
  process.exit(0);
}

// Sort ascending by key (oldest first)
objects.sort((a, b) => (a.Key < b.Key ? -1 : 1));

const toDelete = objects.slice(0, Math.max(0, objects.length - RETENTION_COUNT));

if (toDelete.length === 0) {
  log(`Bucket has ${objects.length} object(s) — no pruning needed`);
} else {
  log(`Bucket has ${objects.length} object(s) — deleting ${toDelete.length} oldest`);
  for (const obj of toDelete) {
    log(`  Deleting ${obj.Key}`);
    await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: obj.Key }));
  }
}

log(`Done at ${new Date().toISOString()}`);
