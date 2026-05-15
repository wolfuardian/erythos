/**
 * Migration: v3 (ErythosSceneV3) → v4 (ErythosSceneV4).
 *
 * v3 shape: { version: 3, upAxis: 'Y', env: SceneEnv, nodes: SceneNode[] }
 * v4 shape: { version: 4, upAxis: 'Y', env: SceneEnv, nodes: SceneNode[] }
 *
 * The only change is the rewrite of built-in primitive mesh asset URLs:
 *   `project://primitives/<type>` → `primitives://<type>`
 *
 * Rationale: `project://primitives/*` was a synthetic URL that misused the project://
 * scheme for built-in geometry (box / sphere / plane / cylinder) that have no backing
 * file. This caused fragile path-prefix guards in Editor.ts and uploadSceneBinaries.ts.
 * The dedicated `primitives://` scheme makes the intent explicit, allowing callers to
 * dispatch on scheme alone without string matching (refs #1027).
 *
 * Only node.asset is rewritten. env.hdri cannot be a primitives:// URL.
 * All other schemes (project://, assets://, prefabs://, blob://, materials://) are
 * passed through unchanged.
 *
 * See docs/erythos-format.md § URI Scheme / § Migration v3→v4
 */

/**
 * Rewrite a `project://primitives/<type>` asset URL to `primitives://<type>`.
 * Any other URL is returned unchanged.
 */
function rewritePrimitivesScheme(url: string): string {
  const prefix = 'project://primitives/';
  if (!url.startsWith(prefix)) return url;
  return 'primitives://' + url.slice(prefix.length);
}

import type { ErythosSceneV4 } from '../types';

/**
 * Migrates an ErythosSceneV3 (raw parsed JSON) to ErythosSceneV4.
 *
 * Takes `unknown` so callers don't need to pre-type the input.
 */
export function v3_to_v4(raw: unknown): ErythosSceneV4 {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('v3_to_v4: input must be a non-null object');
  }

  const input = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(input['nodes']) ? input['nodes'] : [];

  // Rewrite primitive asset URLs in nodes
  const nodes = rawNodes.map((rawNode) => {
    const n = rawNode as Record<string, unknown>;
    if (typeof n['asset'] === 'string') {
      return { ...n, asset: rewritePrimitivesScheme(n['asset']) };
    }
    return n;
  });

  return {
    version: 4,
    upAxis: 'Y',
    env: input['env'] as ErythosSceneV4['env'],
    nodes: nodes as ErythosSceneV4['nodes'],
  };
}
