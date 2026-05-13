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
 * Implementation: serialize() → patch raw JSON URL fields → deserialize().
 * v1_to_v2.rewriteAssetScheme now guards hash-form `assets://<sha256>/` with a
 * 64-hex regex, so the cloud URLs we write survive the migration chain intact
 * (PR #978 / refs #974).
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

  // ── 1. Serialize current SceneDocument → raw v3 JSON ─────────────────────

  const raw = scene.serialize();

  // ── 2. Upload and rewrite project:// URLs in the raw JSON ─────────────────

  // Sequential upload via for-loop (not Promise.all — conservative MVP; see module doc)

  // Rewrite env.hdri
  if (typeof raw.env.hdri === 'string' && raw.env.hdri.startsWith('project://')) {
    raw.env.hdri = await resolveAndUpload(raw.env.hdri, pm, client, uploadCache);
  }

  // Rewrite node.asset (mesh / prefab nodes).
  //
  // `project://primitives/*` is a synthetic URL for built-in primitive meshes
  // (box / sphere / plane) — it has no backing file on disk. Editor.ts:260
  // already short-circuits these at load time; mirror that here so cloud
  // saves don't try to readFile them (which fails with "No project open"
  // when the active project is a CloudProject — refs T3 release blocker).
  // Long-term: a dedicated `primitives://` scheme would make this explicit
  // (see follow-up issue).
  for (const node of raw.nodes) {
    if (
      typeof node.asset === 'string' &&
      node.asset.startsWith('project://') &&
      !node.asset.startsWith('project://primitives/')
    ) {
      node.asset = await resolveAndUpload(node.asset, pm, client, uploadCache);
    }
  }

  // ── 3. Deserialize back into a new SceneDocument ──────────────────────────

  // v1_to_v2.rewriteAssetScheme skips hash-form `assets://<sha256 64-hex>/` URLs,
  // so the cloud URLs written above survive the migration chain unchanged.
  const newDoc = new SceneDocument();
  newDoc.deserialize(raw);

  return newDoc;
}
