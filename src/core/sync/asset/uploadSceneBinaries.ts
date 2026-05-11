/**
 * uploadSceneBinaries — pre-push hook that uploads all `project://` binary assets
 * to the cloud via AssetSyncClient, then returns a NEW SceneDocument with all
 * `project://` URLs rewritten to `assets://<hash>/<filename>`.
 *
 * Used by HttpSyncEngine.push() and HttpSyncEngine.create() before sending the
 * scene body to the server. Does NOT mutate the original SceneDocument.
 *
 * Scene walk strategy: TARGETED — only walks the two known asset-bearing fields:
 *   - SceneNode.asset  (mesh / prefab nodes; spec § SceneNode.asset)
 *   - SceneEnv.hdri    (environment HDRI asset; spec § SceneEnv.hdri)
 * This mirrors the targeted approach used in v1_to_v2 migration.
 *
 * Follow-up: if spec adds new asset fields, this helper must be updated.
 *
 * Dedup strategy:
 *   - Same `project://` URL appearing multiple times in a scene → read + hash only once
 *     (local IO cache keyed by project path)
 *   - headHash() before upload → skip upload if server already has the asset
 *
 * Upload concurrency: sequential (conservative; no server race concern, spec doesn't
 * require parallelism for MVP).
 *
 * Error strategy: any upload failure (429 / 413 / 5xx) or PM read failure throws —
 * callers catch and surface via sync error banner. No retry or partial-success recovery.
 *
 * Idempotent for already-`assets://` URLs (skipped, not re-uploaded).
 * Anonymous mode: HttpSyncEngine skips calling this helper if client / pm absent.
 *
 * Spec ref: docs/asset-sync-protocol.md § 跟 local project files 共存
 * Refs: #957 F-1d-2b
 */

import { SceneDocument } from '../../scene/SceneDocument';
import type { AssetSyncClient } from './AssetSyncClient';
import { asAssetPath } from '../../../utils/branded';
import { sha256 } from './sha256';

/** Minimal ProjectManager surface needed by this helper (for testability). */
export interface ProjectManagerLike {
  readFile(path: ReturnType<typeof asAssetPath>): Promise<File>;
}

/**
 * Upload a single `project://` asset to the cloud (with dedup) and return the
 * rewritten `assets://<hash>/<filename>` URL.
 *
 * Uses the provided cache to avoid duplicate IO / hash / HEAD calls within one
 * `uploadSceneBinaries` invocation (same URL → same result).
 */
async function resolveAndUpload(
  projectUrl: string,
  pm: ProjectManagerLike,
  client: AssetSyncClient,
  cache: Map<string, string>,
): Promise<string> {
  // Cache hit — same project:// URL already processed in this batch
  const cached = cache.get(projectUrl);
  if (cached !== undefined) return cached;

  // Parse project:// → path (e.g. "models/chair.glb")
  const path = projectUrl.slice('project://'.length);

  // Read the file from the local project
  const file = await pm.readFile(asAssetPath(path));
  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);

  // Dedup: skip upload if server already has this hash
  const exists = await client.headHash(hash);
  let assetsUrl: string;

  if (exists) {
    // Server already has it — reconstruct assets:// URL using known pattern
    assetsUrl = `assets://${hash}/${file.name}`;
  } else {
    // Upload and get back the canonical assets:// URL
    const result = await client.upload(file, hash);
    assetsUrl = result.url;
  }

  cache.set(projectUrl, assetsUrl);
  return assetsUrl;
}

/**
 * Walk a SceneDocument and upload all `project://` referenced binaries via
 * AssetSyncClient. Returns a NEW SceneDocument with `project://` URLs rewritten
 * to `assets://<hash>/<filename>`.
 *
 * - Pre-existing `assets://` URLs are passed through unchanged (idempotent).
 * - Other schemes (blob://, prefabs://, materials://) are not touched.
 * - Does NOT mutate the original scene — returns a new instance.
 *
 * Implementation note: the new SceneDocument is built by directly copying the
 * runtime SceneNode objects (via getAllNodes) and patching asset fields, rather
 * than going through serialize() → deserialize().  The reason: deserialize()
 * runs the full v0→v1→v2→v3 migration chain, and v1_to_v2 rewrites any
 * `assets://` URL back to `project://`, which would undo our rewrite.
 * Directly constructing the document from runtime nodes skips the migration
 * and preserves the assets:// URLs we just wrote.
 *
 * @throws if ProjectManager.readFile fails (asset file missing from local project)
 * @throws if AssetSyncClient.upload fails (quota exceeded, network error, etc.)
 */
export async function uploadSceneBinaries(
  scene: SceneDocument,
  pm: ProjectManagerLike,
  client: AssetSyncClient,
): Promise<SceneDocument> {
  // Per-invocation cache: project:// URL → assets:// URL (avoids duplicate IO/upload)
  const uploadCache = new Map<string, string>();

  // ── 1. SceneEnv.hdri ──────────────────────────────────────────────────────

  const origEnv = scene.env;
  let newHdri = origEnv.hdri;
  if (typeof newHdri === 'string' && newHdri.startsWith('project://')) {
    newHdri = await resolveAndUpload(newHdri, pm, client, uploadCache);
  }

  // ── 2. SceneNode.asset (mesh / prefab nodes) ──────────────────────────────

  // Work with runtime SceneNode objects directly to avoid the deserialize()
  // migration chain (v1_to_v2 would re-convert assets:// → project://).
  const origNodes = scene.getAllNodes();
  const newNodes: typeof origNodes = [];

  // Sequential upload via for-loop (not Promise.all — conservative MVP; see module doc)
  for (const node of origNodes) {
    if (typeof node.asset === 'string' && node.asset.startsWith('project://')) {
      const assetsUrl = await resolveAndUpload(node.asset, pm, client, uploadCache);
      newNodes.push({ ...node, asset: assetsUrl });
    } else {
      newNodes.push({ ...node });
    }
  }

  // ── 3. Build new SceneDocument from patched runtime objects ───────────────

  const newDoc = new SceneDocument();

  // Set env (only hdri may have changed; intensity and rotation are copied as-is)
  newDoc.setEnv({
    hdri:      newHdri,
    intensity: origEnv.intensity,
    rotation:  origEnv.rotation,
  });

  // Add all nodes.  SceneDocument.addNode() does not emit nodeAdded on the new
  // doc listeners that concern the live editor — this is a transient doc used
  // only as the server push payload, so events are harmless no-ops.
  for (const node of newNodes) {
    newDoc.addNode(node);
  }

  return newDoc;
}
