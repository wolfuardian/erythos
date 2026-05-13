/**
 * Share token routes — 3 endpoints (G5)
 *
 * Spec: docs/cloud-project-spec.md § REST API § Share token endpoints
 *
 * POST   /scenes/:id/share-tokens          — owner only; generate 16-byte random hex
 * GET    /scenes/:id/share-tokens          — owner only; list all (including revoked)
 * DELETE /scenes/:id/share-tokens/:token   — owner only; idempotent revoke
 *
 * Auth: all three endpoints require auth via authMiddleware (owner-only).
 * Non-owner or missing scene → 404 (no existence leak).
 */

import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { scenes, sceneShareTokens } from '../db/schema.js';
import { resolveSession } from '../auth.js';
import type { Context, Next } from 'hono';

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

type Variables = {
  user: {
    id: string;
    github_id: number | null;
    handle: string | null;
    storage_used: number;
  };
};

async function authMiddleware(c: Context, next: Next) {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', user);
  await next();
}

export const shareTokenRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// Helper: verify scene exists and caller is owner; returns scene or null response
// ---------------------------------------------------------------------------

async function requireOwner(c: Context<{ Variables: Variables }>, sceneId: string) {
  const user = c.get('user') as Variables['user'];
  const rows = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  const scene = rows[0];
  // Non-existent or non-owner → 404 (no existence leak)
  if (!scene || scene.owner_id !== user.id) {
    return null;
  }
  return scene;
}

// ---------------------------------------------------------------------------
// POST /scenes/:id/share-tokens
// ---------------------------------------------------------------------------

shareTokenRoutes.post('/:id/share-tokens', authMiddleware, async (c) => {
  const sceneId = c.req.param('id')!;
  const scene = await requireOwner(c, sceneId);
  if (!scene) return c.json({ error: 'Not Found' }, 404);

  const user = c.get('user') as Variables['user'];

  // Generate 16-byte (128-bit) random hex token — 32 hex chars
  const token = randomBytes(16).toString('hex');

  await db.insert(sceneShareTokens).values({
    token,
    scene_id: sceneId,
    created_by: user.id,
  });

  const origin = c.req.header('origin') ?? 'https://erythos.eoswolf.com';
  const shareUrl = `${origin}/scenes/${sceneId}?share_token=${token}`;

  const createdAt = new Date().toISOString();

  return c.json({ token, url: shareUrl, created_at: createdAt }, 201);
});

// ---------------------------------------------------------------------------
// GET /scenes/:id/share-tokens
// ---------------------------------------------------------------------------

shareTokenRoutes.get('/:id/share-tokens', authMiddleware, async (c) => {
  const sceneId = c.req.param('id')!;
  const scene = await requireOwner(c, sceneId);
  if (!scene) return c.json({ error: 'Not Found' }, 404);

  const tokens = await db
    .select()
    .from(sceneShareTokens)
    .where(eq(sceneShareTokens.scene_id, sceneId));

  return c.json({
    tokens: tokens.map((t) => ({
      token: t.token,
      created_at: t.created_at.toISOString(),
      revoked_at: t.revoked_at ? t.revoked_at.toISOString() : null,
    })),
  });
});

// ---------------------------------------------------------------------------
// DELETE /scenes/:id/share-tokens/:token
// Idempotent: already-revoked token still returns 204.
// Non-existent token or wrong scene → 404.
// ---------------------------------------------------------------------------

shareTokenRoutes.delete('/:id/share-tokens/:token', authMiddleware, async (c) => {
  const sceneId = c.req.param('id')!;
  const tokenParam = c.req.param('token')!;
  const scene = await requireOwner(c, sceneId);
  if (!scene) return c.json({ error: 'Not Found' }, 404);

  // Verify token exists for this scene (regardless of revoked_at)
  const rows = await db
    .select()
    .from(sceneShareTokens)
    .where(and(eq(sceneShareTokens.token, tokenParam), eq(sceneShareTokens.scene_id, sceneId)))
    .limit(1);

  if (!rows[0]) return c.json({ error: 'Not Found' }, 404);

  // Idempotent revoke: only update if not already revoked
  await db
    .update(sceneShareTokens)
    .set({ revoked_at: new Date() })
    .where(
      and(
        eq(sceneShareTokens.token, tokenParam),
        eq(sceneShareTokens.scene_id, sceneId),
        isNull(sceneShareTokens.revoked_at),
      ),
    );

  return new Response(null, { status: 204 });
});
