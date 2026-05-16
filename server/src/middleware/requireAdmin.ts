/**
 * requireAdmin — gate downstream routes behind users.is_admin = true.
 *
 * Reads the session via resolveSession(c), fetches the user row, checks is_admin.
 * - No session / no user: 401
 * - Session valid but is_admin === false: 403 + audit log entry
 * - Session valid + is_admin === true: next()
 *
 * v0.1: admins are flipped by direct DB UPDATE on users.is_admin. No
 * promotion / demotion API yet (see #942 epic backlog).
 */

import type { MiddlewareHandler } from 'hono';
import { resolveSession } from '../auth.js';
import { db } from '../db.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { recordAudit, extractActorIp } from '../audit/recordAudit.js';

/**
 * Factory that returns a Hono middleware handler enforcing admin-only access.
 *
 * Usage:
 *   app.use('/api/admin/*', requireAdmin());
 */
export function requireAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const user = await resolveSession(c);

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Fetch is_admin separately — resolveSession's AuthUser type does not
    // expose is_admin; a single-column SELECT is cheaper than a join rewrite.
    const rows = await db
      .select({ is_admin: users.is_admin })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    const isAdmin = rows[0]?.is_admin ?? false;

    if (!isAdmin) {
      void recordAudit('admin.access_denied', {
        actor_id: user.id,
        actor_ip: extractActorIp(c),
        actor_ua: c.req.header('User-Agent') ?? null,
        success: false,
      });
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  };
}
