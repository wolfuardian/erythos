/**
 * AssetResolver — unified URI scheme resolver for Erythos asset references.
 *
 * Resolves the five sanctioned AssetUrl schemes to runtime representations:
 *   project://  → ProjectManager file at the given path → blob URL
 *                 (local project file; formerly assets:// in schema v1)
 *   prefabs://  → ProjectManager file at prefabs/<name>.prefab → blob URL
 *   blob://     → IndexedDB / direct blob URL pass-through
 *   assets://   → Cloud content-addressed asset (Phase B PR2, refs #843).
 *                 Downloads via AssetSyncClient; blob URLs are cached by hash
 *                 with LRU eviction (cap = 100) and URL.revokeObjectURL on eviction.
 *   materials://→ reserved (佔位); throws clearly if called (not yet implemented)
 *
 * See docs/erythos-format.md § URI Scheme
 */

import type { LocalProjectManager } from '../project/LocalProjectManager';
import { asAssetPath, asBlobURL } from '../../utils/branded';
import type { BlobURL, AssetPath } from '../../utils/branded';
import type { AssetSyncClient } from '../sync/asset/AssetSyncClient';

// Default LRU cap for the assets:// blob URL cache
const DEFAULT_BLOB_CACHE_CAP = 100;

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
  /**
   * In-memory LRU cache for assets:// → blob URL mappings.
   * Keyed by sha256 hash (not full URL — same content + different filename hits cache).
   * Uses Map insertion order for LRU: oldest entry = first key.
   */
  private readonly blobCache: Map<string, BlobURL>;
  private readonly blobCacheCap: number;

  constructor(
    private readonly projectManager: LocalProjectManager,
    private readonly assetClient?: AssetSyncClient,
    blobCacheCap: number = DEFAULT_BLOB_CACHE_CAP,
  ) {
    this.blobCache = new Map();
    this.blobCacheCap = blobCacheCap;
  }

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
        // assets://<hash>/<filename> — cloud content-addressed asset (Phase B PR2, refs #843).
        // AssetSyncClient must be injected into the AssetResolver constructor to resolve these.
        if (!this.assetClient) {
          throw new Error(
            `AssetResolver: AssetSyncClient must be injected into the AssetResolver constructor ` +
            `to resolve cloud assets:// URLs. ` +
            `URL: "${assetUrl}". Pass an AssetSyncClient as the second constructor argument ` +
            `to enable cloud asset resolution (refs #843).`
          );
        }
        // rest = "<hash>/<filename>" — split on first "/" to extract hash
        const slashIdx = parsed.rest.indexOf('/');
        const hash = slashIdx >= 0 ? parsed.rest.slice(0, slashIdx) : parsed.rest;

        // Cache hit — re-use existing blob URL (avoid duplicate download + URL leak)
        const cached = this.blobCache.get(hash);
        if (cached !== undefined) {
          // LRU refresh: delete + re-insert to move to most-recent position
          this.blobCache.delete(hash);
          this.blobCache.set(hash, cached);
          return cached;
        }

        // Cache miss — download and create a new blob URL
        const blob = await this.assetClient.download(hash);
        const blobUrl = asBlobURL(URL.createObjectURL(blob));

        // LRU eviction: if over cap, revoke and remove the oldest entry (first key)
        if (this.blobCache.size >= this.blobCacheCap) {
          const oldestHash = this.blobCache.keys().next().value;
          if (oldestHash !== undefined) {
            const oldUrl = this.blobCache.get(oldestHash);
            if (oldUrl !== undefined) {
              URL.revokeObjectURL(oldUrl);
            }
            this.blobCache.delete(oldestHash);
          }
        }

        this.blobCache.set(hash, blobUrl);
        return blobUrl;
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
   * Release a single cached blob URL by its `assets://` URL.
   * Calls URL.revokeObjectURL and removes the entry from cache.
   * No-op if the URL is not in cache or is not an assets:// URL.
   */
  release(assetsUrl: string): void {
    const parsed = parseAssetUrl(assetsUrl);
    if (!parsed || parsed.scheme !== 'assets') return;

    const slashIdx = parsed.rest.indexOf('/');
    const hash = slashIdx >= 0 ? parsed.rest.slice(0, slashIdx) : parsed.rest;

    const blobUrl = this.blobCache.get(hash);
    if (blobUrl !== undefined) {
      URL.revokeObjectURL(blobUrl);
      this.blobCache.delete(hash);
    }
  }

  /**
   * Revoke all cached blob URLs and clear the cache.
   * Call on app teardown or user logout to avoid memory / object-URL leaks.
   */
  dispose(): void {
    for (const blobUrl of this.blobCache.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    this.blobCache.clear();
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
