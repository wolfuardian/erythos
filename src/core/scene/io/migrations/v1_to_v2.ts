/**
 * Migration: v1 (ErythosSceneV1) → v2 (ErythosSceneV2).
 *
 * v1 shape: { version: 1, env: SceneEnv, nodes: SceneNode[] }
 *           node.asset and env.hdri use `assets://<path>` for local project files.
 *
 * v2 shape: { version: 2, env: SceneEnv, nodes: SceneNode[] }
 *           node.asset and env.hdri use `project://<path>` for local project files.
 *           `assets://` is now cloud content-addressed only (Phase B PR2).
 *
 * Rewrites:
 *   - node.asset: `assets://<path>` → `project://<path>` (mesh / prefab nodes)
 *   - env.hdri:   `assets://<path>` → `project://<path>`
 *   - materials:// / blob:// / prefabs:// are not touched.
 *
 * See docs/erythos-format.md § Migration v1→v2
 * See docs/asset-sync-protocol.md § 跟 local project files 共存
 */

import type { ErythosSceneV2 } from '../types';

/**
 * Rewrite a single asset URL: `assets://<path>` → `project://<path>`.
 * Any other scheme (prefabs://, blob://, materials://) is returned unchanged.
 * Also leaves cloud-form `assets://<sha256>/<filename>` unchanged — that form
 * should not appear in v1 files but is future-safe to pass through.
 */
function rewriteAssetScheme(url: string): string {
  if (url.startsWith('assets://')) {
    return 'project://' + url.slice('assets://'.length);
  }
  return url;
}

/**
 * Migrates an ErythosSceneV1 (raw parsed JSON) to ErythosSceneV2.
 *
 * Takes `unknown` so callers don't need to pre-type the input.
 */
export function v1_to_v2(raw: unknown): ErythosSceneV2 {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('v1_to_v2: input must be a non-null object');
  }

  const input = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(input['nodes']) ? input['nodes'] : [];
  const rawEnv = input['env'] as Record<string, unknown> | undefined;

  // Migrate env.hdri
  const hdri = typeof rawEnv?.['hdri'] === 'string'
    ? rewriteAssetScheme(rawEnv['hdri'])
    : (rawEnv?.['hdri'] ?? null);

  const env = {
    hdri:      hdri as string | null,
    intensity: typeof rawEnv?.['intensity'] === 'number' ? rawEnv['intensity'] : 1,
    rotation:  typeof rawEnv?.['rotation']  === 'number' ? rawEnv['rotation']  : 0,
  };

  // Migrate nodes: rewrite node.asset where scheme is assets://
  const nodes = rawNodes.map((rawNode) => {
    const n = rawNode as Record<string, unknown>;
    const result: Record<string, unknown> = { ...n };

    if (typeof n['asset'] === 'string') {
      result['asset'] = rewriteAssetScheme(n['asset']);
    }

    return result;
  });

  return {
    version: 2,
    env,
    nodes: nodes as ErythosSceneV2['nodes'],
  };
}
