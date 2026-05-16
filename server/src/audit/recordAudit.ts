/**
 * Audit log write helper — G2-1 (refs #1086)
 *
 * recordAudit() is fire-and-forget: DB errors are caught, logged via logger,
 * and the Promise resolves normally. Audit failures MUST NOT break the
 * underlying request.
 *
 * maskEmail() stores only a masked form in audit metadata; the plaintext
 * email address never touches audit_log.
 *
 * extractActorIp() reads the FIRST entry of X-Forwarded-For for audit
 * attribution (Caddy sanitises the header so the first entry is trustworthy
 * as the client-reported IP for audit purposes — refs PR #989). This is
 * intentionally different from the LAST-entry pattern used in
 * magic-link clientIP() which needs the network-truth IP for rate-limiting.
 */

import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import { db } from '../db.js';
import { auditLog } from '../db/schema.js';
import { logger } from '../middleware/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecordAuditOpts = {
  actor_id: string | null;
  actor_ip: string;
  actor_ua?: string | null;
  resource_type?: 'scene' | 'share_token' | 'user' | null;
  resource_id?: string | null;
  metadata?: Record<string, unknown>;
  success: boolean;
};

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Mask an email address for audit storage.
 *
 * Returns the first character of the local part + the first 8 hex characters
 * of sha256 of the remainder. Plaintext email is never stored in audit_log.
 *
 * Example: "alice@example.com" → "a" + sha256("lice@example.com").slice(0, 8)
 */
export function maskEmail(email: string): string {
  if (!email) return '';
  const first = email[0] ?? '';
  const rest = email.slice(1);
  const hash = createHash('sha256').update(rest).digest('hex');
  return first + hash.slice(0, 8);
}

/**
 * Extract the client IP from the Hono context for audit attribution.
 *
 * Reads the FIRST entry of X-Forwarded-For. Caddy prepends its own IP and
 * the original client IP ends up as the first entry; this is appropriate for
 * audit attribution where we want to record the reported client IP.
 *
 * Note: this differs from the rate-limit pattern in magic-link.ts which reads
 * the LAST entry for network-truth verification. Both patterns are correct for
 * their different purposes.
 *
 * Returns empty string if the header is absent (dev/direct connection).
 */
export function extractActorIp(c: Context): string {
  const xff = c.req.header('X-Forwarded-For');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Audit event types — write-side reference
//
// Keep in sync with admin.ts AUDIT_EVENT_TYPES (closed set, dual source-of-truth).
// Callers pass event_type as a string; admin.ts validates against its closed set.
//
// Current event types:
//   auth.signin.success | auth.signin.failure | auth.signout
//   auth.magic_link.request | auth.magic_link.consume
//   scene.create | scene.delete
//   share_token.create | share_token.revoke
//   user.data_export | user.account_delete
//   user.account_delete_scheduled | user.account_delete_cancelled | user.account_delete_executed
//   admin.access_denied
//
// G1 additions (refs #1095): user.account_delete_scheduled,
//   user.account_delete_cancelled, user.account_delete_executed.
// ---------------------------------------------------------------------------

/**
 * Write a single audit event row. Fire-and-forget: errors are swallowed and
 * logged; the returned Promise always resolves.
 */
export async function recordAudit(
  event_type: string,
  opts: RecordAuditOpts,
): Promise<void> {
  try {
    await db.insert(auditLog).values({
      event_type,
      actor_id: opts.actor_id ?? null,
      actor_ip: opts.actor_ip,
      actor_ua: opts.actor_ua ?? null,
      resource_type: opts.resource_type ?? null,
      resource_id: opts.resource_id ?? null,
      metadata: opts.metadata ?? {},
      success: opts.success,
    });
  } catch (err) {
    logger.error({ err, event_type }, 'audit: failed to write event');
  }
}
