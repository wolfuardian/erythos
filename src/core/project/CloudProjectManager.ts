/**
 * CloudProjectManager — wraps HttpSyncEngine + HttpAssetClient for cloud projects.
 *
 * Implements the ProjectManager interface for cloud-canonical projects (v0.2).
 * This class is the boundary between the app-level project entry layer and the
 * cloud sync infrastructure (HttpSyncEngine, HttpAssetClient, IndexedDB cache).
 *
 * Design decisions:
 *   D-1: App entry layer creates CloudProjectManager; downstream Editor /
 *        AssetResolver still receive concrete LocalProjectManager for local assets.
 *        CloudProjectManager is wired at the AutoSave level, not Editor.projectManager.
 *   D-2: SaveResult is a discriminated union, not thrown exceptions.
 *   D-8: CloudProject assets are assets:// only. project:// URLs in a cloud scene
 *        are broken-ref by definition — saveScene does NOT rewrite them.
 *
 * Spec: docs/cloud-project-spec.md § ProjectManager 抽象 + § Phase G2
 */

import type { ProjectManager, ProjectIdentifier, AssetMeta, SaveResult, LoadSceneResult } from './ProjectManager';
import { SceneDocument } from '../scene/SceneDocument';
import { HttpSyncEngine } from '../sync/HttpSyncEngine';
import type { AssetSyncClient } from '../sync/asset/AssetSyncClient';
import {
  ConflictError,
  NetworkError,
  NotFoundError,
} from '../sync/SyncEngine';
import { AuthError } from '../auth/AuthClient';
import * as CloudSceneCache from './CloudSceneCache';
import { parseAssetUrl } from '../io/AssetResolver';
import { defaultBaseUrl } from '../sync/baseUrl';

// ── Additional SaveResult variants for cloud-specific errors ──────────────────
//
// The core SaveResult union covers conflict / offline / unauthorized.
// For cloud-only errors (payload-too-large, client-bug) we emit a typed error
// object from the CloudAutoSave layer rather than extending SaveResult — this
// aligns with the v0.1 HttpSyncEngine error handling pattern in AutoSave.ts.
// CalloRS that only call CloudProjectManager.saveScene see SaveResult.

// ── CloudProjectManager ───────────────────────────────────────────────────────

export class CloudProjectManager implements ProjectManager {
  /** Satisfies ProjectManager interface — always 'cloud' for this impl. */
  readonly type = 'cloud' as const;

  private readonly _syncEngine: HttpSyncEngine;
  private readonly _assetClient: AssetSyncClient;
  private readonly _sceneId: string;
  private readonly _baseUrl: string;

  /**
   * Current server version. Updated on successful loadScene and saveScene.
   * Exposed so App.tsx can initialise editor.syncBaseVersion after openCloudProject.
   */
  private _currentVersion: number | null = null;

  /** Scene name from the server. Null before first loadScene. */
  private _name: string | null = null;

  /** Blob URL cache: assets:// hash → blob URL (to revoke on close) */
  private readonly _blobUrlCache = new Map<string, string>();

  /**
   * @param sceneId     UUID of the cloud scene.
   * @param syncEngine  Pre-built HttpSyncEngine (shared with App if desired).
   * @param assetClient HttpAssetClient (or mock for tests).
   * @param baseUrl     API base URL (defaults to defaultBaseUrl()).
   */
  constructor(
    sceneId: string,
    syncEngine: HttpSyncEngine,
    assetClient: AssetSyncClient,
    baseUrl: string = defaultBaseUrl(),
  ) {
    this._sceneId = sceneId;
    this._syncEngine = syncEngine;
    this._assetClient = assetClient;
    this._baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // ── ProjectManager interface ────────────────────────────────────────────────

  get identifier(): ProjectIdentifier {
    return { kind: 'cloud', sceneId: this._sceneId };
  }

  /**
   * Load the scene from the server (GET /api/scenes/:id).
   * On success, updates the internal version and writes to IndexedDB cache.
   * On network failure, falls through to the IndexedDB cache (G6 offline UX).
   *
   * Returns `{ doc, fromCache }` where `fromCache` is true when the scene was
   * served from IndexedDB (offline cold-start). Callers should enter viewer mode
   * (read-only) when `fromCache` is true (spec § Offline 策略 — 冷啟動有 cache).
   *
   * Throws on auth errors or if no cache is available offline.
   */
  async loadScene(): Promise<LoadSceneResult> {
    try {
      const { body, version, name } = await this._syncEngine.fetch(this._sceneId);
      this._currentVersion = version;
      this._name = name;

      // Write-through to IndexedDB throwaway cache (cold-start fast-open)
      try {
        await CloudSceneCache.setScene(
          this._sceneId,
          JSON.stringify(body.serialize()),
          version,
        );
      } catch (cacheErr) {
        // Cache write failure is non-fatal — scene is loaded, cache is a nice-to-have
        console.warn('[CloudProjectManager] Failed to write scene to cache:', cacheErr);
      }

      return { doc: body, fromCache: false };
    } catch (err) {
      if (err instanceof NetworkError) {
        // Offline path: try IndexedDB cache
        const cached = await CloudSceneCache.getScene(this._sceneId);
        if (cached) {
          const doc = new SceneDocument();
          doc.deserialize(JSON.parse(cached.data));
          this._currentVersion = cached.version;
          console.warn(
            `[CloudProjectManager] Offline: loaded scene from cache (version ${cached.version})`,
          );
          return { doc, fromCache: true };
        }
        // No cache — re-throw so caller can show offline error
        throw err;
      }
      throw err;
    }
  }

  /**
   * Persist the scene to the server (PUT /api/scenes/:id with If-Match).
   *
   * Handles HTTP errors and maps them to the SaveResult discriminated union:
   *   409 ConflictError   → { ok: false, reason: 'conflict', ... }
   *   NetworkError        → { ok: false, reason: 'offline' }
   *   AuthError (401/403) → { ok: false, reason: 'unauthorized' }
   *
   * PayloadTooLargeError / PreconditionError / ServerError are re-thrown so
   * the CloudAutoSave wrapper can emit them as `syncError` events — identical
   * to how AutoSave.ts handles these for the local path.
   *
   * Note: Does NOT rewrite project:// URLs — cloud assets must be assets://.
   *       Broken-ref assets are D-8 by spec; caller (upload pipeline) must ensure
   *       all assets are uploaded before calling saveScene.
   */
  async saveScene(scene: SceneDocument, baseVersion: number): Promise<SaveResult> {
    // Offline short-circuit: avoid an unnecessary network call when the client
    // is known to be offline (spec § Offline 策略 + § G6).
    // The existing NetworkError → 'offline' path handles cases where
    // navigator.onLine is incorrect (e.g. captive portal); both paths produce
    // the same SaveResult so the AutoSave layer handles them identically.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, reason: 'offline' };
    }

    try {
      const { version } = await this._syncEngine.push(this._sceneId, scene, baseVersion);
      this._currentVersion = version;

      // Update IndexedDB cache after successful save
      try {
        await CloudSceneCache.setScene(
          this._sceneId,
          JSON.stringify(scene.serialize()),
          version,
        );
      } catch (cacheErr) {
        console.warn('[CloudProjectManager] Failed to update cache after save:', cacheErr);
      }

      return { ok: true, version };
    } catch (err) {
      if (err instanceof ConflictError) {
        return {
          ok: false,
          reason: 'conflict',
          currentVersion: err.currentVersion,
          currentBody: err.currentBody,
        };
      }
      if (err instanceof NetworkError) {
        return { ok: false, reason: 'offline' };
      }
      if (err instanceof AuthError) {
        return { ok: false, reason: 'unauthorized' };
      }
      if (err instanceof NotFoundError) {
        // Scene deleted on server — treat as unauthorized (no write surface)
        return { ok: false, reason: 'unauthorized' };
      }
      // PayloadTooLargeError / PreconditionError / PreconditionRequiredError /
      // ServerError — re-throw for CloudAutoSave to handle as syncError events.
      throw err;
    }
  }

  /**
   * List assets associated with this cloud scene.
   *
   * Returns assets referenced in the scene body as AssetMeta[].
   * For G2 this is a stub — the full asset listing API is a follow-up (G5/asset panel).
   * Callers that need full asset listing should use the asset API directly.
   */
  async listAssets(): Promise<AssetMeta[]> {
    // G2 stub: return empty list.
    // Full implementation will call GET /assets or parse scene body for assets:// URLs.
    return [];
  }

  /**
   * Resolve an assets:// URL to a Blob.
   *
   * CloudProject assets are content-addressed (assets://<hash>/<filename>).
   * Resolves via HttpAssetClient.download(hash), with an in-memory blob URL cache
   * to avoid re-downloading the same asset within a session.
   *
   * Throws for project:// URLs — those are broken-ref in CloudProject (spec D-8).
   */
  async resolveAsset(url: string): Promise<Blob> {
    const parsed = parseAssetUrl(url);
    if (!parsed) {
      throw new Error(`CloudProjectManager.resolveAsset: unrecognised URL format: "${url}"`);
    }

    if (parsed.scheme === 'assets') {
      // assets://<hash>/<filename> — split on first "/" to extract hash
      const slashIdx = parsed.rest.indexOf('/');
      const hash = slashIdx >= 0 ? parsed.rest.slice(0, slashIdx) : parsed.rest;

      // Cached blob URL → re-download via client to get Blob
      // (blob URL caching is at AssetResolver level; CloudProjectManager caches the Blob directly)
      if (this._blobUrlCache.has(hash)) {
        // We store a blob URL string; for resolveAsset we need the Blob.
        // Re-download is acceptable here — callers needing blob URL caching should
        // use AssetResolver which already has LRU caching for assets://.
        // This path is rarely hit since most callers use AssetResolver, not PM.resolveAsset.
      }

      return this._assetClient.download(hash);
    }

    if (parsed.scheme === 'project' || parsed.scheme === 'prefabs') {
      throw new Error(
        `CloudProjectManager.resolveAsset: project:// and prefabs:// URLs are invalid in ` +
        `CloudProject (spec D-8). URL: "${url}". ` +
        `Use the upload pipeline to convert local assets to assets:// before saving.`,
      );
    }

    throw new Error(
      `CloudProjectManager.resolveAsset: unsupported scheme "${parsed.scheme}" in URL: "${url}"`,
    );
  }

  /**
   * Clean up resources:
   *  - Revoke any cached blob URLs minted during this session
   *  - Delete the IndexedDB throwaway cache entry (spec § close lifecycle)
   */
  async close(): Promise<void> {
    // Revoke in-memory blob URL cache
    for (const blobUrl of this._blobUrlCache.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    this._blobUrlCache.clear();

    // Remove IndexedDB throwaway cache
    try {
      await CloudSceneCache.deleteScene(this._sceneId);
    } catch (cacheErr) {
      console.warn('[CloudProjectManager] Failed to delete cache on close:', cacheErr);
    }
  }

  // ── Cloud-only API (not on ProjectManager interface) ──────────────────────

  /** The sceneId this manager is bound to. */
  get sceneId(): string {
    return this._sceneId;
  }

  /** Scene name from the server — null before first loadScene. */
  get name(): string | null {
    return this._name;
  }

  /**
   * Current server version — null before first loadScene.
   * App.tsx reads this after openCloudProject to initialise editor.syncBaseVersion.
   */
  get currentVersion(): number | null {
    return this._currentVersion;
  }

  /**
   * The API base URL used for asset listing / share token endpoints.
   * Exposed for share token operations that need to call the API directly.
   */
  get baseUrl(): string {
    return this._baseUrl;
  }
}
