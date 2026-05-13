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
import { requireUuidParam } from '../middleware/validate-uuid.js';

export const userRoutes = new Hono();

const requireUserIdUuid = requireUuidParam(
  'id',
  'E1001 ERR_USER_ID_FORMAT',
  'user id',
);

// ---------------------------------------------------------------------------
// GET /users/:id — public user info for owner resolver
// ---------------------------------------------------------------------------

userRoutes.get('/:id', requireUserIdUuid, async (c) => {
  const id = c.req.param('id')!;

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
