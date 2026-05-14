/**
 * Demo scene provisioning — insert one Demo scene for a newly-created user.
 *
 * Called from both auth paths (GitHub OAuth + magic-link) immediately after
 * a new user row is inserted. Runs inside the same db.transaction() as the
 * user insert so the pair is atomic.
 *
 * The Demo blob is loaded once at module init from shared/onboarding/demo-scene.json
 * using fs.readFileSync (avoids Node ESM import-attribute requirements for JSON).
 * Server and client validity tests import the same file — single source of truth.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { scenes, scene_versions } from './db/schema.js';

// ---------------------------------------------------------------------------
// Load Demo blob at module init (synchronous, once per process)
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path: server/src/provision-demo-scene.ts → shared/onboarding/demo-scene.json
const DEMO_SCENE_PATH = resolve(__dirname, '../../shared/onboarding/demo-scene.json');

const demoBlobRaw: string = readFileSync(DEMO_SCENE_PATH, 'utf8');
export const demoBlobBuffer: Buffer = Buffer.from(demoBlobRaw, 'utf8');

// ---------------------------------------------------------------------------
// Tx duck-type — minimum surface used by provisionDemoScene
// ---------------------------------------------------------------------------

interface InsertableTx {
  insert: typeof import('./db.js').db.insert;
}

// ---------------------------------------------------------------------------
// Provisioner
// ---------------------------------------------------------------------------

/**
 * Insert one Demo scene row for `userId` using the provided drizzle transaction `tx`.
 *
 * Must be called inside a db.transaction() callback so the insert is atomic
 * with the user-row insert that surrounds it.
 */
export async function provisionDemoScene(
  tx: InsertableTx,
  userId: string,
): Promise<void> {
  const id = randomUUID();
  const version = 0;

  await tx.insert(scenes).values({
    id,
    owner_id: userId,
    name: 'Demo',
    version,
    body: demoBlobBuffer,
    body_size: demoBlobBuffer.length,
    visibility: 'private',
  });

  await tx.insert(scene_versions).values({
    scene_id: id,
    version,
    body: demoBlobBuffer,
    body_size: demoBlobBuffer.length,
    saved_by: userId,
  });
}
