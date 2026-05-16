/**
 * pruneScheduledDeletes — G1 job (refs #1095)
 *
 * Hard-deletes users whose scheduled_delete_at has elapsed.
 * Runs once at server boot then every 24 h (see index.ts).
 *
 * Strategy:
 *   1. SELECT expired users (scheduled_delete_at < now() AND NOT NULL).
 *   2. For each: fire-and-forget recordAudit BEFORE delete (FK still valid).
 *   3. CASCADE delete via db.delete(users).
 *
 * On any error: silent warn (per OQ-3 — alerting deferred to O1 epic).
 *
 * Exported so it can be unit-tested without spawning a real server.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '../db/schema.js';
import { recordAudit } from '../audit/recordAudit.js';
import { logger } from '../middleware/logger.js';

export async function pruneScheduledDeletes(): Promise<void> {
  try {
    // Fetch expired users before deleting so we can emit audit events.
    const expiredUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.scheduled_delete_at} < now() AND ${users.scheduled_delete_at} IS NOT NULL`);

    if (expiredUsers.length === 0) return;

    for (const u of expiredUsers) {
      // Emit audit BEFORE deleting — actor_id FK is still valid pre-delete.
      // Fire-and-forget; audit failures do not block the cascade.
      void recordAudit('user.account_delete_executed', {
        actor_id: u.id,
        actor_ip: '',
        actor_ua: null,
        resource_type: 'user',
        resource_id: u.id,
        metadata: { reason: 'grace_period_expired' },
        success: true,
      });

      // Cascade delete: FK ON DELETE CASCADE removes sessions, scenes,
      // scene_versions, magic_link_tokens, scene_share_tokens, yjs_documents.
      await db.delete(users).where(eq(users.id, u.id));
    }
  } catch (err) {
    logger.warn({ err }, 'scheduled-delete prune: failed');
  }
}
