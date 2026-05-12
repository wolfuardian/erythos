/**
 * Scene routes — 5 REST endpoints (D4)
 *
 * Bytea wire format: scenes.body is stored as BYTEA in Postgres.
 * On write: JSON.stringify(bodyObject) → Buffer (utf-8).
 * On read:  row.body.toString('utf8') → JSON.parse() → plain object sent to client.
 * This matches spec § REST API "body: { ... .erythos JSON ... }" (inline JSON object).
 *
 * Auth: GET /scenes/:id allows anonymous callers (spec § REST API: "匿名可呼叫公開場景").
 * All other 4 endpoints require auth via authMiddleware.
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { scenes, scene_versions } from '../db/schema.js';
import { resolveSession } from '../auth.js';
import { bodyLimitMiddleware } from '../middleware/body-limit.js';
import { counters } from '../counters.js';
import type { Context, Next } from 'hono';

// ---------------------------------------------------------------------------
// Auth middleware (wraps resolveSession — applied to 4 write endpoints)
// ---------------------------------------------------------------------------

async function authMiddleware(c: Context, next: Next) {
  const user = await resolveSession(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', user);
  await next();
}

// ---------------------------------------------------------------------------
// Type augmentation so TypeScript knows about c.get('user')
// ---------------------------------------------------------------------------

type Variables = {
  user: {
    id: string;
    github_id: number | null;
    handle: string | null;
    storage_used: number;
  };
};

export const sceneRoutes = new Hono<{ Variables: Variables }>();

// ---------------------------------------------------------------------------
// Helper: Buffer → JSON object for wire transport
// ---------------------------------------------------------------------------

function bufferToJson(buf: Buffer): unknown {
  return JSON.parse(buf.toString('utf8'));
}

// ---------------------------------------------------------------------------
// Helper: JSON body object → Buffer for DB storage
// ---------------------------------------------------------------------------

function jsonToBuffer(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

// ---------------------------------------------------------------------------
// GET /scenes/:id
// Anonymous OK for public scenes; owner OK for private; else 404.
// No authMiddleware — resolveSession inline (may return null).
// ---------------------------------------------------------------------------

sceneRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  const user = await resolveSession(c);

  const rows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.id, id))
    .limit(1);

  const scene = rows[0];
  if (!scene) return c.json({ error: 'Not Found' }, 404);

  // Private scene: only owner may view; everyone else gets 404 (no existence leak)
  if (scene.visibility === 'private' && (!user || user.id !== scene.owner_id)) {
    return c.json({ error: 'Not Found' }, 404);
  }

  c.header('ETag', `"${scene.version}"`);

  return c.json({
    id: scene.id,
    owner_id: scene.owner_id,
    name: scene.name,
    version: scene.version,
    body: bufferToJson(scene.body),
    visibility: scene.visibility,
    forked_from: scene.forked_from ?? null,
  });
});

// ---------------------------------------------------------------------------
// PUT /scenes/:id — push with If-Match etag
// Requires auth. Owner-only write. Optimistic concurrency via If-Match.
// ---------------------------------------------------------------------------

sceneRoutes.put('/:id', bodyLimitMiddleware, authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const user = c.get('user');

  // --- If-Match validation (RFC 7232 quoted form "N") ---
  const ifMatch = c.req.header('If-Match');
  if (!ifMatch) {
    return c.json({ error: 'If-Match header required' }, 428);
  }

  // Must be quoted form "N" where N is a non-negative integer
  const ifMatchMatch = /^"(\d+)"$/.exec(ifMatch);
  if (!ifMatchMatch) {
    return c.json({ error: 'If-Match must be a quoted integer e.g. "5"' }, 412);
  }
  const baseVersion = parseInt(ifMatchMatch[1], 10);

  // --- Load existing scene ---
  const rows = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);
  const scene = rows[0];
  if (!scene) return c.json({ error: 'Not Found' }, 404);

  // --- Owner check (non-owner → 404, no existence leak; consistent with PATCH/fork) ---
  if (scene.owner_id !== user.id) {
    return c.json({ error: 'Not Found' }, 404);
  }

  // --- Optimistic concurrency check ---
  if (scene.version !== baseVersion) {
    c.header('ETag', `"${scene.version}"`);
    return c.json(
      {
        current_version: scene.version,
        current_body: bufferToJson(scene.body),
      },
      409,
    );
  }

  // --- Parse incoming body ---
  let bodyObj: unknown;
  try {
    bodyObj = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const bodyBuffer = jsonToBuffer(bodyObj);
  const newVersion = scene.version + 1;

  // --- Transaction: update scenes + insert scene_versions ---
  await db.transaction(async (tx) => {
    await tx
      .update(scenes)
      .set({
        body: bodyBuffer,
        body_size: bodyBuffer.length,
        version: newVersion,
        updated_at: sql`now()`,
      })
      .where(eq(scenes.id, id));

    await tx.insert(scene_versions).values({
      scene_id: id,
      version: newVersion,
      body: bodyBuffer,
      body_size: bodyBuffer.length,
      saved_by: user.id,
    });
  });

  c.header('ETag', `"${newVersion}"`);
  counters.scene_push_total += 1;
  return c.json({ version: newVersion });
});

// ---------------------------------------------------------------------------
// POST /scenes — create new scene
// Requires auth. version=0, visibility='private'.
// ---------------------------------------------------------------------------

sceneRoutes.post('/', bodyLimitMiddleware, authMiddleware, async (c) => {
  const user = c.get('user');

  let reqBody: { name?: unknown; body?: unknown };
  try {
    reqBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { name, body: bodyObj } = reqBody;
  if (typeof name !== 'string' || !name) {
    return c.json({ error: 'name is required' }, 400);
  }
  if (bodyObj === undefined || bodyObj === null) {
    return c.json({ error: 'body is required' }, 400);
  }

  const id = randomUUID();
  const bodyBuffer = jsonToBuffer(bodyObj);
  const version = 0;

  await db.transaction(async (tx) => {
    await tx.insert(scenes).values({
      id,
      owner_id: user.id,
      name,
      version,
      body: bodyBuffer,
      body_size: bodyBuffer.length,
      visibility: 'private',
    });

    await tx.insert(scene_versions).values({
      scene_id: id,
      version,
      body: bodyBuffer,
      body_size: bodyBuffer.length,
      saved_by: user.id,
    });
  });

  c.header('Location', `/api/scenes/${id}`);
  c.header('ETag', `"${version}"`);
  counters.scene_create_total += 1;
  return c.json({ id, version }, 201);
});

// ---------------------------------------------------------------------------
// PATCH /scenes/:id/visibility — toggle public/private
// Requires auth. Owner-only.
// ---------------------------------------------------------------------------

sceneRoutes.patch('/:id/visibility', bodyLimitMiddleware, authMiddleware, async (c) => {
  const id = c.req.param('id')!;
  const user = c.get('user');

  let reqBody: { visibility?: unknown };
  try {
    reqBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { visibility } = reqBody;
  if (visibility !== 'public' && visibility !== 'private') {
    return c.json({ error: 'visibility must be "public" or "private"' }, 400);
  }

  const rows = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);
  const scene = rows[0];
  if (!scene) return c.json({ error: 'Not Found' }, 404);

  // Owner check: non-owner sees 404 (spec: "非 owner 回 404,不洩露存在性")
  if (scene.owner_id !== user.id) {
    return c.json({ error: 'Not Found' }, 404);
  }

  await db.update(scenes).set({ visibility }).where(eq(scenes.id, id));

  return c.json({ id, visibility });
});

// ---------------------------------------------------------------------------
// POST /scenes/:id/fork — fork scene to caller's account
// Requires auth. Source must be public OR caller is owner; else 404 (no leak).
// ---------------------------------------------------------------------------

sceneRoutes.post('/:id/fork', bodyLimitMiddleware, authMiddleware, async (c) => {
  const sourceId = c.req.param('id')!;
  const user = c.get('user');

  let reqBody: { name?: unknown } = {};
  try {
    reqBody = await c.req.json();
  } catch {
    // body is optional for fork
    reqBody = {};
  }

  const rows = await db.select().from(scenes).where(eq(scenes.id, sourceId)).limit(1);
  const source = rows[0];

  // 404 if not found, or if private and caller is not the owner (no existence leak)
  if (!source || (source.visibility === 'private' && source.owner_id !== user.id)) {
    return c.json({ error: 'Not Found' }, 404);
  }

  const newId = randomUUID();
  const newName =
    typeof reqBody.name === 'string' && reqBody.name
      ? reqBody.name
      : `${source.name} (fork)`;
  const version = 0;

  await db.transaction(async (tx) => {
    await tx.insert(scenes).values({
      id: newId,
      owner_id: user.id,
      name: newName,
      version,
      body: source.body,
      body_size: source.body_size,
      visibility: 'private',
      forked_from: source.id,
    });

    await tx.insert(scene_versions).values({
      scene_id: newId,
      version,
      body: source.body,
      body_size: source.body_size,
      saved_by: user.id,
    });
  });

  c.header('Location', `/api/scenes/${newId}`);
  c.header('ETag', `"${version}"`);
  counters.scene_fork_total += 1;
  return c.json({ id: newId, version, forked_from: source.id }, 201);
});
