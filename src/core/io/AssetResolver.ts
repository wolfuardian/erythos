/**
 * AssetResolver — unified URI scheme resolver for Erythos asset references.
 *
 * Resolves the five sanctioned AssetUrl schemes to runtime representations:
 *   project://  → ProjectManager file at the given path → blob URL
 *                 (local project file; formerly assets:// in schema v1)
 *   prefabs://  → ProjectManager file at prefabs/<name>.prefab → blob URL
 *   blob://     → IndexedDB / direct blob URL pass-through
 *   assets://   → Cloud content-addressed asset (Phase B PR2, refs #843).
 *                 throws sentinel until AssetSyncClient is implemented.
 *   materials://→ reserved (佔位); throws clearly if called (not yet implemented)
 *
 * See docs/erythos-format.md § URI Scheme
 */

import type { ProjectManager } from '../project/ProjectManager';
import { asAssetPath, asBlobURL } from '../../utils/branded';
import type { BlobURL, AssetPath } from '../../utils/branded';

export type AssetScheme = 'project' | 'assets' | 'prefabs' | 'blob' | 'materials';

export interface ResolvedAsset {
  scheme: AssetScheme;
  /** Resolved blob URL for direct loading. null for materials:// (not yet implemented). */
  url: BlobURL | null;
  /** The project-relative path (for project:// and prefabs://), or null. */
  path: AssetPath | null;
}

/**
 * Parse an AssetUrl into its scheme and the path portion.
 *
 * @example
 *   parseAssetUrl("project://models/chair.glb") → { scheme: "project", rest: "models/chair.glb" }
 *   parseAssetUrl("prefabs://tree-pine")         → { scheme: "prefabs", rest: "tree-pine" }
 */
export function parseAssetUrl(url: string): { scheme: AssetScheme; rest: string } | null {
  const match = url.match(/^([a-z]+):\/\/(.*)$/);
  if (!match) return null;
  const scheme = match[1] as AssetScheme;
  const rest = match[2] ?? '';
  if (!['project', 'assets', 'prefabs', 'blob', 'materials'].includes(scheme)) return null;
  return { scheme, rest };
}

export class AssetResolver {
  constructor(private readonly projectManager: ProjectManager) {}

  /**
   * Resolve an AssetUrl to a blob URL for loading.
   *
   * @throws Error for assets:// (cloud scheme, not yet implemented — Phase B PR2 refs #843)
   * @throws Error for materials:// (reserved, not yet implemented)
   * @throws Error if scheme is unrecognised
   * @throws Error if projectManager.urlFor fails (file not found)
   */
  async resolve(assetUrl: string): Promise<BlobURL> {
    const parsed = parseAssetUrl(assetUrl);
    if (!parsed) {
      throw new Error(`AssetResolver: unrecognised URL format: "${assetUrl}"`);
    }

    switch (parsed.scheme) {
      case 'project': {
        // project://models/chair.glb → project-relative path "models/chair.glb"
        const path = asAssetPath(parsed.rest);
        return asBlobURL(await this.projectManager.urlFor(path));
      }

      case 'prefabs': {
        // prefabs://tree-pine → project-relative path "prefabs/tree-pine.prefab"
        // The resolver adds prefix and suffix that v0_to_v1.stripPrefabPath() removed.
        const path = asAssetPath(`prefabs/${parsed.rest}.prefab`);
        return asBlobURL(await this.projectManager.urlFor(path));
      }

      case 'blob': {
        // blob://abc123 — direct pass-through (IndexedDB-backed)
        // The consumer should have already obtained the actual blob: URL;
        // this path is a simple pass-through for URLs already in blob form.
        return asBlobURL(`blob:${parsed.rest}`);
      }

      case 'assets': {
        // assets:// is reserved for cloud content-addressed assets (Phase B PR2).
        // Receiving a local-style assets:// URL here means a migration did not run,
        // or a cloud URL was fed to the wrong resolver path.
        throw new Error(
          `AssetResolver: cloud assets:// scheme not yet implemented (Phase B PR2). ` +
          `URL: "${assetUrl}". To add cloud asset support, implement AssetSyncClient ` +
          `and add a case here (refs #843).`
        );
      }

      case 'materials': {
        // materials:// is reserved for a future materials asset system.
        throw new Error(
          `AssetResolver: materials:// scheme is reserved and not yet implemented. ` +
          `URL: "${assetUrl}". To add shared materials support, implement the ` +
          `MaterialsRegistry and add a case here.`
        );
      }
    }
  }

  /**
   * Extract the project-relative AssetPath from a project:// or prefabs:// URL.
   * Returns null for blob://, assets://, and materials:// schemes.
   */
  pathFor(assetUrl: string): AssetPath | null {
    const parsed = parseAssetUrl(assetUrl);
    if (!parsed) return null;

    switch (parsed.scheme) {
      case 'project':
        return asAssetPath(parsed.rest);
      case 'prefabs':
        return asAssetPath(`prefabs/${parsed.rest}.prefab`);
      default:
        return null;
    }
  }
}
