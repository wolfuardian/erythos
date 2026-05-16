/**
 * User account routes — GDPR endpoints (§ 41)
 *
 * Routes:
 *   GET    /me/export          — export all user data as JSON attachment
 *   DELETE /me                 — schedule account deletion (30-day grace) → 200 { scheduled_delete_at }
 *   POST   /me/cancel-delete   — cancel pending deletion → 200
 *
 * G1 grace-period model (refs #1095):
 *   DELETE /me sets scheduled_delete_at = now() + 30 days and clears the session.
 *   Idempotent: if already scheduled, returns existing timestamp without re-auditing.
 *   pruneScheduledDeletes (index.ts) runs every 24 h and performs the cascade hard
 *   delete for users whose grace period has expired.
 *
 * Auth required for all endpoints.
 */

import { Hono } from 'hono';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { users, scenes, scene_versions, sceneShareTokens } from '../db/schema.js';
import { resolveSession, deleteSession } from '../auth.js';
import { recordAudit, extractActorIp } from '../audit/recordAudit.js';

export const meRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /me/export
//
// Exports all data owned by the authenticated user:
//   - user record (id, github_login, email, avatar_url, created_at)
//   - all scenes (id, name, visibility, forked_from, created_at, updated_at)
//   - scene_versions per scene (version, saved_by, saved_at)
//
// body bytes are excluded — non-actionable binary blobs, not human-readable.
// sessions are excluded — only expired hashes, non-actionable.
// No pagination / streaming for v0 (spec § 41 says day-1 not fine-grained).
// ---------------------------------------------------------------------------

meRoutes.get('/export', async (c) => {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  // Fetch user record
  const userRows = await db
    .select({
      id: users.id,
      github_login: users.github_login,
      email: users.email,
      avatar_url: users.avatar_url,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const userRecord = userRows[0];
  if (!userRecord) return c.json({ error: 'Not Found' }, 404);

  // Fetch all scenes owned by user
  const sceneRows = await db
    .select({
      id: scenes.id,
      name: scenes.name,
      visibility: scenes.visibility,
      forked_from: scenes.forked_from,
      created_at: scenes.created_at,
      updated_at: scenes.updated_at,
    })
    .from(scenes)
    .where(eq(scenes.owner_id, user.id));

  // Fetch scene_versions for all owned scenes
  const sceneIds = sceneRows.map((s) => s.id);
  const versionsBySceneId: Record<
    string,
    Array<{ version: number; saved_by: string | null; saved_at: Date }>
  > = {};

  if (sceneIds.length > 0) {
    const versionRows = await db
      .select({
        scene_id: scene_versions.scene_id,
        version: scene_versions.version,
        saved_by: scene_versions.saved_by,
        saved_at: scene_versions.saved_at,
      })
      .from(scene_versions)
      .where(inArray(scene_versions.scene_id, sceneIds));

    for (const v of versionRows) {
      if (!versionsBySceneId[v.scene_id]) versionsBySceneId[v.scene_id] = [];
      versionsBySceneId[v.scene_id]!.push({
        version: v.version,
        saved_by: v.saved_by,
        saved_at: v.saved_at,
      });
    }
  }

  const scenesWithVersions = sceneRows.map((s) => ({
    ...s,
    scene_versions: versionsBySceneId[s.id] ?? [],
  }));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawFilename = `erythos-export-${userRecord.github_login}-${timestamp}.json`;
  // Defense-in-depth: strip any character that could escape the Content-Disposition
  // header value. GitHub login allows only [a-zA-Z0-9-], but if the DB value
  // were ever written via a different path, unsanitized input could enable
  // header injection. Stripping to [a-zA-Z0-9._-] is the safe baseline.
  const safeName = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  c.header('Content-Type', 'application/json');
  c.header('Content-Disposition', `attachment; filename="${safeName}"`);

  await recordAudit('user.data_export', {
    actor_id: user.id,
    actor_ip: extractActorIp(c),
    actor_ua: c.req.header('User-Agent') ?? null,
    resource_type: 'user',
    resource_id: user.id,
    metadata: {},
    success: true,
  });

  return c.json({
    exported_at: new Date().toISOString(),
    user: userRecord,
    scenes: scenesWithVersions,
  });
});

// ---------------------------------------------------------------------------
// DELETE /me
//
// G1 grace-period model (refs #1095):
//   - First call: sets scheduled_delete_at = now() + 30 days, clears session
//     cookie, records audit user.account_delete_scheduled.
//     Returns 200 { scheduled_delete_at: <ISO string> }.
//   - Idempotent re-call (already scheduled): returns existing timestamp,
//     no DB update, no audit, no cookie clear. The user may have re-signed in
//     during the grace period — we leave the session intact on the idempotent path.
//   - 404 if user row not found (race condition).
//
// The actual cascade hard delete is deferred to pruneScheduledDeletes (index.ts)
// which runs every 24 h and deletes users whose scheduled_delete_at < now().
// ---------------------------------------------------------------------------

meRoutes.delete('/', async (c) => {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  // Verify user exists and fetch scheduled_delete_at in one query
  const existingRows = await db
    .select({ id: users.id, scheduled_delete_at: users.scheduled_delete_at })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) return c.json({ error: 'Not Found' }, 404);

  // Idempotent: if already scheduled, return existing timestamp without side-effects.
  // The user may have re-signed in during grace — do not clear the session again.
  if (existing.scheduled_delete_at !== null) {
    return c.json({ scheduled_delete_at: existing.scheduled_delete_at.toISOString() }, 200);
  }

  // Count owned scenes and share tokens for audit metadata.
  const [sceneCountRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(scenes)
    .where(eq(scenes.owner_id, user.id));
  const cascadedScenes = Number(sceneCountRow?.count ?? 0);

  const userSceneIds = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.owner_id, user.id));

  let cascadedShareTokens = 0;
  if (userSceneIds.length > 0) {
    const [tokenCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sceneShareTokens)
      .where(
        inArray(
          sceneShareTokens.scene_id,
          userSceneIds.map((r) => r.id),
        ),
      );
    cascadedShareTokens = Number(tokenCountRow?.count ?? 0);
  }

  // Set scheduled_delete_at = now() + 30 days.
  const updatedRows = await db
    .update(users)
    .set({ scheduled_delete_at: sql`now() + INTERVAL '30 days'` })
    .where(eq(users.id, user.id))
    .returning({ scheduled_delete_at: users.scheduled_delete_at });

  const scheduledAt = updatedRows[0]?.scheduled_delete_at;
  if (!scheduledAt) return c.json({ error: 'Internal error' }, 500);

  // Emit audit BEFORE clearing the session so actor_id FK is still resolvable.
  await recordAudit('user.account_delete_scheduled', {
    actor_id: user.id,
    actor_ip: extractActorIp(c),
    actor_ua: c.req.header('User-Agent') ?? null,
    resource_type: 'user',
    resource_id: user.id,
    metadata: {
      scheduled_delete_at: scheduledAt.toISOString(),
      scenes_pending: cascadedScenes,
      share_tokens_pending: cascadedShareTokens,
    },
    success: true,
  });

  // Clear session cookie — user is signed out during grace period.
  await deleteSession(c);

  return c.json({ scheduled_delete_at: scheduledAt.toISOString() }, 200);
});

// ---------------------------------------------------------------------------
// POST /me/cancel-delete
//
// Cancels a pending account deletion by clearing scheduled_delete_at.
// Authenticated endpoint — user must be signed in during the grace period.
// 404 if no pending deletion (nothing to cancel).
// ---------------------------------------------------------------------------

meRoutes.post('/cancel-delete', async (c) => {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  // Verify user exists and has a pending deletion
  const existingRows = await db
    .select({ id: users.id, scheduled_delete_at: users.scheduled_delete_at })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const existing = existingRows[0];
  if (!existing) return c.json({ error: 'Not Found' }, 404);

  if (existing.scheduled_delete_at === null) {
    return c.json({ error: 'No pending deletion to cancel' }, 404);
  }

  await db
    .update(users)
    .set({ scheduled_delete_at: null })
    .where(eq(users.id, user.id));

  await recordAudit('user.account_delete_cancelled', {
    actor_id: user.id,
    actor_ip: extractActorIp(c),
    actor_ua: c.req.header('User-Agent') ?? null,
    resource_type: 'user',
    resource_id: user.id,
    metadata: {},
    success: true,
  });

  return c.json({ ok: true }, 200);
});
