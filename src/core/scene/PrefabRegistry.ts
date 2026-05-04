/**
 * PrefabRegistry — URL-keyed in-memory cache for PrefabAsset objects.
 *
 * URL is the cache key (session-scoped blob URL). Discovery of which prefab
 * files exist comes from projectManager.getFiles().filter(f => f.type === 'prefab')
 * — a separate concern handled by Editor.init.
 *
 * Events:
 *   'changed' — fired whenever the cached set changes (load, evict, clear).
 *   Subscribe from bridge to keep prefabAssets() signal in sync.
 */

import type { PrefabAsset } from './PrefabFormat';

type Listener = () => void;

export class PrefabRegistry {
  private readonly _cache = new Map<string, PrefabAsset>(); // url → asset
  private readonly _pathToURL = new Map<string, string>();   // project-relative path → url
  private readonly _listeners = new Set<Listener>();

  // ── Listeners ──────────────────────────────────────────────────────────────

  on(_event: 'changed', fn: Listener): void {
    this._listeners.add(fn);
  }

  off(_event: 'changed', fn: Listener): void {
    this._listeners.delete(fn);
  }

  private _emit(): void {
    for (const fn of this._listeners) fn();
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
