import type { AssetPath } from './branded';
import { asAssetPath } from './branded';

/**
 * Derive a project-relative `prefabs/<name>.prefab` path from a prefab name.
 *
 * Strips characters invalid in filenames; collapses whitespace to underscore.
 * The Editor and PrefabPanel must derive identical paths so that drag-drop
 * (panel emits path, viewport looks it up) and registry lookups stay in sync.
 */
export function prefabPathForName(name: string): AssetPath {
  const safe = name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .trim() || 'prefab';
  return asAssetPath(`prefabs/${safe}.prefab`);
}
