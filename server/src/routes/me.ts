/**
 * User account routes — GDPR endpoints (§ 41)
 *
 * Routes:
 *   GET    /me/export  — export all user data as JSON attachment
 *   DELETE /me         — delete account + cascade + clear session cookie → 204
 *
 * Auth required for both endpoints.
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
// Deletes the authenticated user and all their data via CASCADE:
//   - sessions.user_id ON DELETE CASCADE
//   - scenes.owner_id  ON DELETE CASCADE
//     - scene_versions.scene_id ON DELETE CASCADE (via scenes)
//   - scene_versions.saved_by ON DELETE SET NULL (forward-looking; currently
//     saved_by ≡ owner_id so all versions are deleted via scene_id first)
//
// After deletion: clear session cookie → 204 No Content.
// 404 if user row not found (race condition — client should re-sign in).
// ---------------------------------------------------------------------------

meRoutes.delete('/', async (c) => {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  // Verify user exists (guard against race condition)
  const existingRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!existingRows[0]) return c.json({ error: 'Not Found' }, 404);

  // Count owned scenes and share tokens before cascade for audit metadata.
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

  // Delete user inside a transaction — cascades to sessions + scenes → scene_versions.
  // Note: session cookie clear happens outside the transaction (no DB-level side effect).
  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.id, user.id));
  });

  // Clear session cookie. deleteSession tries to delete the DB row again but
  // it's already gone via cascade — the DB no-ops gracefully (0 rows deleted).
  // Cookie attributes mirror setSessionCookie exactly (Path=/ HttpOnly Secure(prod) SameSite=Lax)
  // so the browser honours the clear.
  await deleteSession(c);

  await recordAudit('user.account_delete', {
    actor_id: user.id,
    actor_ip: extractActorIp(c),
    actor_ua: c.req.header('User-Agent') ?? null,
    resource_type: 'user',
    resource_id: user.id,
    metadata: { cascaded_scenes: cascadedScenes, cascaded_share_tokens: cascadedShareTokens },
    success: true,
  });

  return new Response(null, { status: 204 });
});
