/**
 * Users routes — G3 / #1017 follow-up
 *
 * GET /users/:id — resolve public-safe user fields for "Shared by" badge.
 * No auth required: owner actively shared the scene URL, metadata exposure is
 * intentional (spec D-5).
 * Only exposes: { id, github_login, avatar_url } — PII fields (email,
 * created_at, storage_used, handle, github_id, plan) are NOT returned.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { users } from '../db/schema.js';

export const userRoutes = new Hono();

/**
 * Postgres `uuid` columns reject non-UUID literals at the database driver
 * layer with an exception. Without an up-front format check, `GET /users/me`
 * (or any bad id) propagates that exception → 500. Validate here so bad
 * input becomes 400 with a clear shape, not an opaque 500.
 *
 * E1001 ERR_USER_ID_FORMAT — see issue #1025 (error code taxonomy proposal).
 * This is the first call site to adopt the code+message pattern; rest of the
 * codebase migrates gradually per #1025.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// GET /users/:id — public user info for owner resolver
// ---------------------------------------------------------------------------

userRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')!;

  if (!UUID_RE.test(id)) {
    return c.json(
      {
        error: 'Invalid user id format — expected UUID',
        code: 'E1001 ERR_USER_ID_FORMAT',
      },
      400,
    );
  }

  const rows = await db
    .select({
      id: users.id,
      github_login: users.github_login,
      avatar_url: users.avatar_url,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  const user = rows[0];
  if (!user) return c.json({ error: 'Not Found' }, 404);

  return c.json({
    id: user.id,
    github_login: user.github_login,
    avatar_url: user.avatar_url ?? null,
  });
});
