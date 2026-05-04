/**
 * PrefabRegistry — URL-keyed in-memory cache for PrefabAsset objects.
 *
 * URL is the cache key (session-scoped blob URL). Discovery of which prefab
 * files exist comes from projectManager.getFiles().filter(f => f.type === 'prefab')
 * — a separate concern handled by Editor.init.
 *
 * Events:
 *   'changed'       — fired whenever the cached set changes (load, evict, clear).
 *                     Subscribe from bridge to keep prefabAssets() signal in sync.
 *   'prefabChanged' — fired after a file-write causes a registered prefab to be
 *                     refetched. Payload: (url, asset, path) where url is the NEW
 *                     blob URL (old URL was revoked by ProjectManager), asset is
 *                     the freshly-parsed PrefabAsset, and path is the stable
 *                     project-relative path. SceneSync subscribes to this to
 *                     rebuild instance subtrees.
 */

import type { PrefabAsset } from './PrefabFormat';
import type { ProjectManager } from '../project/ProjectManager';

type Listener = () => void;
type PrefabChangedListener = (url: string, asset: PrefabAsset, path: string) => void;

export class PrefabRegistry {
  private readonly _cache = new Map<string, PrefabAsset>(); // url → asset
  private readonly _pathToURL = new Map<string, string>();   // project-relative path → url
  private readonly _listeners = new Set<Listener>();
  private readonly _prefabChangedListeners = new Set<PrefabChangedListener>();

  /** Unsubscribe function returned by projectManager.onFileChanged; stored for dispose. */
  private _detachFileChanged: (() => void) | null = null;

  // ── Listeners ──────────────────────────────────────────────────────────────

  on(event: 'changed', fn: Listener): void;
  on(event: 'prefabChanged', fn: PrefabChangedListener): void;
  on(event: 'changed' | 'prefabChanged', fn: Listener | PrefabChangedListener): void {
    if (event === 'changed') {
      this._listeners.add(fn as Listener);
    } else {
      this._prefabChangedListeners.add(fn as PrefabChangedListener);
    }
  }

  off(event: 'changed', fn: Listener): void;
  off(event: 'prefabChanged', fn: PrefabChangedListener): void;
  off(event: 'changed' | 'prefabChanged', fn: Listener | PrefabChangedListener): void {
    if (event === 'changed') {
      this._listeners.delete(fn as Listener);
    } else {
      this._prefabChangedListeners.delete(fn as PrefabChangedListener);
    }
  }

  private _emit(): void {
    for (const fn of this._listeners) fn();
  }

  private _emitPrefabChanged(url: string, asset: PrefabAsset, path: string): void {
    for (const fn of this._prefabChangedListeners) fn(url, asset, path);
  }

  // ── FileChanged bridge ─────────────────────────────────────────────────────

  /**
   * Wire PrefabRegistry to a ProjectManager so that file writes automatically
   * invalidate and refetch the affected prefab entry, then emit `prefabChanged`.
   *
   * Call once from Editor.init — symmetric with the single-document model.
   * Only the main SceneSync (not sandbox ones) subscribes to `prefabChanged`.
   *
   * @param projectManager - The app's ProjectManager instance.
   */
  attach(projectManager: ProjectManager): void {
    // Detach any previous binding (idempotent re-attach guard)
    this._detachFileChanged?.();

    this._detachFileChanged = projectManager.onFileChanged(async (path, newURL) => {
      // Only process paths we know about
      const oldURL = this._pathToURL.get(path);
      if (oldURL === undefined) return;

      // Evict stale cache entry for the old URL
      this._cache.delete(oldURL);
      // Update path → URL mapping to the newly minted URL
      this._pathToURL.set(path, newURL);

      // Refetch fresh asset from new URL (async: await ensures cache is warm
      // before emitting so listeners can safely call registry.get(newURL))
      let asset: PrefabAsset;
      try {
        const response = await fetch(newURL);
        if (!response.ok) {
          console.warn(
            `[PrefabRegistry] refetch failed for "${path}" (${newURL}): ` +
            `${response.status} ${response.statusText}`,
          );
          return;
        }
        asset = (await response.json()) as PrefabAsset;
        if (asset.version !== 1 || !Array.isArray(asset.nodes)) {
          console.warn(`[PrefabRegistry] invalid prefab format after refetch: "${path}"`);
          return;
        }
      } catch (err) {
        console.warn(`[PrefabRegistry] refetch error for "${path}":`, err);
        return;
      }

      // Store freshly parsed asset
      this._cache.set(newURL, asset);
      this._emit();

      // Notify live-sync subscribers with the new URL, asset, and stable path
      this._emitPrefabChanged(newURL, asset, path);
    });
  }

  /**
   * Detach the projectManager file-change subscription (call from Editor.dispose).
   */
  detach(): void {
    this._detachFileChanged?.();
    this._detachFileChanged = null;
  }

  // ── Core API ───────────────────────────────────────────────────────────────

  /**
   * Fetch a blob URL, parse the JSON as PrefabAsset, validate minimally, cache.
   * If already cached, returns the cached entry without re-fetching.
   *
   * @param url   Blob URL for the prefab file.
   * @param path  Optional project-relative path (used to build reverse path→url map).
   */
  async loadFromURL(url: string, path?: string): Promise<PrefabAsset> {
    const existing = this._cache.get(url);
    if (existing) return existing;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `[PrefabRegistry] fetch failed for URL ${url}: ${response.status} ${response.statusText}`,
      );
    }
    const asset = (await response.json()) as PrefabAsset;
    // Minimal validation: must have version 1 and nodes array
    if (asset.version !== 1 || !Array.isArray(asset.nodes)) {
      throw new Error(`[PrefabRegistry] invalid prefab format at URL ${url}`);
    }
    this._cache.set(url, asset);
    if (path) this._pathToURL.set(path, url);
    this._emit();
    return asset;
  }

  /**
   * Store a pre-parsed PrefabAsset under the given url.
   * Overwrites any existing entry for the same url.
   * Used by Editor.registerPrefab after writing the file.
   *
   * @param url   Blob URL (cache key).
   * @param asset Parsed PrefabAsset.
   * @param path  Optional project-relative path for the reverse map.
   */
  set(url: string, asset: PrefabAsset, path?: string): void {
    this._cache.set(url, asset);
    if (path) this._pathToURL.set(path, url);
    this._emit();
  }

  get(url: string): PrefabAsset | null {
    return this._cache.get(url) ?? null;
  }

  /**
   * Look up the blob URL for a given project-relative path.
   * Returns null if the path is not in the reverse map.
   */
  getURLForPath(path: string): string | null {
    return this._pathToURL.get(path) ?? null;
  }

  has(url: string): boolean {
    return this._cache.has(url);
  }

  evict(url: string): void {
    if (this._cache.delete(url)) {
      // Remove from reverse map too
      for (const [p, u] of this._pathToURL) {
        if (u === url) {
          this._pathToURL.delete(p);
          break;
        }
      }
      this._emit();
    }
  }

  /** Evict by project-relative path. Returns true if something was evicted. */
  evictByPath(path: string): boolean {
    const url = this._pathToURL.get(path);
    if (!url) return false;
    this._cache.delete(url);
    this._pathToURL.delete(path);
    this._emit();
    return true;
  }

  clear(): void {
    this._cache.clear();
    this._pathToURL.clear();
    this._emit();
  }

  /** Returns all currently-cached assets as an array snapshot. */
  getAllAssets(): PrefabAsset[] {
    return Array.from(this._cache.values());
  }
}
