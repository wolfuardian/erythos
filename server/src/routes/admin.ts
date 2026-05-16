/**
 * Admin routes — G2-3 (refs #1088)
 *
 * All routes under /admin are protected by requireAdmin() middleware.
 * Future admin endpoints (promotion/demotion, etc.) should be added here.
 *
 * Routes:
 *   GET /audit-log  — paginated audit log query with keyset pagination
 *
 * Cursor format: base64url-encoded JSON { ts: ISO string, id: uuid }
 * Client treats cursor as opaque; server encodes/decodes internally.
 */

import { Hono } from 'hono';
import { and, eq, lt, or, lte, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { auditLog } from '../db/schema.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const adminRoutes = new Hono();

// ---------------------------------------------------------------------------
// requireAdmin at router level — every route under /admin is admin-only.
// Factory called once; middleware applies to all methods / paths.
// ---------------------------------------------------------------------------

adminRoutes.use('*', requireAdmin());

// ---------------------------------------------------------------------------
// Closed set of audit event types (source of truth for validation + UI).
// Derived from grep of recordAudit() calls across server/src/routes/ — G2-1.
// Update this list only when new event types are wired.
// SYNC: keep in sync with the event-type comment in audit/recordAudit.ts (dual source-of-truth).
// G1 additions: user.account_delete_scheduled, user.account_delete_cancelled,
//               user.account_delete_executed (refs #1095).
// ---------------------------------------------------------------------------

export const AUDIT_EVENT_TYPES = [
  'auth.signin.success',
  'auth.signin.failure',
  'auth.signout',
  'auth.magic_link.request',
  'auth.magic_link.consume',
  'scene.create',
  'scene.delete',
  'share_token.create',
  'share_token.revoke',
  'user.data_export',
  'user.account_delete',
  'user.account_delete_scheduled',
  'user.account_delete_cancelled',
  'user.account_delete_executed',
  'admin.access_denied',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// AuditEntry — shape returned by GET /audit-log
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO 8601
  event_type: string;
  actor_id: string | null;
  actor_ip: string;
  actor_ua: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  success: boolean;
}

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

interface Cursor {
  ts: string;
  id: string;
}

function encodeCursor(ts: string, id: string): string {
  return Buffer.from(JSON.stringify({ ts, id })).toString('base64url');
}

function decodeCursor(encoded: string): Cursor {
  let raw: string;
  try {
    raw = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    throw new Error('malformed cursor');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('malformed cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).ts !== 'string' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new Error('malformed cursor');
  }
  // Basic UUID shape check for id
  const { ts, id } = parsed as { ts: string; id: string };
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    throw new Error('malformed cursor');
  }
  // Basic ISO timestamp check
  if (isNaN(Date.parse(ts))) {
    throw new Error('malformed cursor');
  }
  return { ts, id };
}

// ---------------------------------------------------------------------------
// UUID validator (basic shape — 8-4-4-4-12 hex)
// ---------------------------------------------------------------------------

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ---------------------------------------------------------------------------
// GET /audit-log
//
// Query params:
//   event_type  — string, must match closed set (optional)
//   actor_id    — uuid (optional)
//   from        — ISO 8601 timestamp (optional)
//   to          — ISO 8601 timestamp (optional)
//   limit       — integer 1–1000, default 100 (optional)
//   cursor      — opaque base64url string (optional)
//
// Returns: { rows: AuditEntry[], next_cursor: string | null }
// ---------------------------------------------------------------------------

adminRoutes.get('/audit-log', async (c) => {
  // ── Parse & validate query params ─────────────────────────────────────────

  const rawEventType = c.req.query('event_type');
  const rawActorId = c.req.query('actor_id');
  const rawFrom = c.req.query('from');
  const rawTo = c.req.query('to');
  const rawLimit = c.req.query('limit');
  const rawCursor = c.req.query('cursor');

  // event_type: optional, must match closed set
  if (rawEventType !== undefined) {
    if (!(AUDIT_EVENT_TYPES as readonly string[]).includes(rawEventType)) {
      return c.json({ error: `Unknown event_type: ${rawEventType}` }, 400);
    }
  }

  // actor_id: optional, must be uuid-shaped
  if (rawActorId !== undefined) {
    if (!isUuid(rawActorId)) {
      return c.json({ error: 'actor_id must be a valid UUID' }, 400);
    }
  }

  // from / to: optional, must be valid ISO 8601
  let fromDate: Date | undefined;
  let toDate: Date | undefined;
  if (rawFrom !== undefined) {
    const d = new Date(rawFrom);
    if (isNaN(d.getTime())) {
      return c.json({ error: 'from must be a valid ISO 8601 timestamp' }, 400);
    }
    fromDate = d;
  }
  if (rawTo !== undefined) {
    const d = new Date(rawTo);
    if (isNaN(d.getTime())) {
      return c.json({ error: 'to must be a valid ISO 8601 timestamp' }, 400);
    }
    toDate = d;
  }

  // limit: integer 1–1000, default 100
  let limit = 100;
  if (rawLimit !== undefined) {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed)) {
      return c.json({ error: 'limit must be an integer' }, 400);
    }
    limit = Math.max(1, Math.min(1000, parsed));
  }

  // cursor: opaque base64url, decode if present
  let cursor: Cursor | undefined;
  if (rawCursor !== undefined) {
    try {
      cursor = decodeCursor(rawCursor);
    } catch {
      return c.json({ error: 'Invalid cursor' }, 400);
    }
  }

  // ── Build WHERE conditions ─────────────────────────────────────────────────

  const conditions = [];

  if (rawEventType !== undefined) {
    conditions.push(eq(auditLog.event_type, rawEventType));
  }
  if (rawActorId !== undefined) {
    conditions.push(eq(auditLog.actor_id, rawActorId));
  }
  if (fromDate !== undefined) {
    conditions.push(sql`${auditLog.timestamp} >= ${fromDate.toISOString()}`);
  }
  if (toDate !== undefined) {
    conditions.push(sql`${auditLog.timestamp} <= ${toDate.toISOString()}`);
  }

  // Keyset pagination: (timestamp, id) < (cursor.ts, cursor.id)
  // Express as: timestamp < cursor.ts OR (timestamp = cursor.ts AND id < cursor.id)
  if (cursor !== undefined) {
    conditions.push(
      or(
        sql`${auditLog.timestamp} < ${cursor.ts}::timestamptz`,
        and(
          sql`${auditLog.timestamp} = ${cursor.ts}::timestamptz`,
          sql`${auditLog.id} < ${cursor.id}::uuid`,
        ),
      ),
    );
  }

  // ── Execute query ──────────────────────────────────────────────────────────

  const fetchLimit = limit + 1;

  const rows = await db
    .select({
      id: auditLog.id,
      timestamp: auditLog.timestamp,
      event_type: auditLog.event_type,
      actor_id: auditLog.actor_id,
      actor_ip: auditLog.actor_ip,
      actor_ua: auditLog.actor_ua,
      resource_type: auditLog.resource_type,
      resource_id: auditLog.resource_id,
      metadata: auditLog.metadata,
      success: auditLog.success,
    })
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${auditLog.timestamp} DESC, ${auditLog.id} DESC`)
    .limit(fetchLimit);

  // ── Keyset cursor for next page ────────────────────────────────────────────

  let nextCursor: string | null = null;
  let resultRows = rows;

  if (rows.length > limit) {
    resultRows = rows.slice(0, limit);
    const last = resultRows[resultRows.length - 1];
    if (last) {
      nextCursor = encodeCursor(last.timestamp.toISOString(), last.id);
    }
  }

  // ── Serialize and return ───────────────────────────────────────────────────

  const serialized: AuditEntry[] = resultRows.map((row) => ({
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    event_type: row.event_type,
    actor_id: row.actor_id,
    actor_ip: row.actor_ip,
    actor_ua: row.actor_ua,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    success: row.success,
  }));

  return c.json({ rows: serialized, next_cursor: nextCursor });
});
