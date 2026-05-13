/**
 * ProjectManager — polymorphic interface for v0.2 multi-project-type support.
 *
 * G1 introduces this interface to decouple call sites from the concrete
 * FileSystemDirectoryHandle implementation. LocalProjectManager wraps the
 * v0.1 file system logic; CloudProjectManager (G2) will wrap HttpSyncEngine.
 *
 * Design decisions:
 *   D-1: `identifier` discriminated union — call sites type-narrow via `manager.type`
 *        (analogous to v0.1 nodeType branching pattern).
 *   D-2: `SaveResult` is a discriminated union, not thrown exceptions.
 *
 * Spec: docs/cloud-project-spec.md § ProjectManager 抽象
 */

import type { SceneDocument } from '../scene/SceneDocument';

// ── Identifier ────────────────────────────────────────────────────────────────

export type ProjectIdentifier =
  | { kind: 'local'; handle: FileSystemDirectoryHandle }
  | { kind: 'cloud'; sceneId: string };

// ── AssetMeta ─────────────────────────────────────────────────────────────────

export interface AssetMeta {
  /** Project-relative path (e.g. 'models/chair.glb') */
  path: string;
  /** Display name (e.g. 'chair.glb') */
  name: string;
  /** Asset type */
  type: 'glb' | 'prefab' | 'hdr' | 'scene' | 'texture' | 'other';
}

// ── SaveResult ────────────────────────────────────────────────────────────────

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; currentVersion: number; currentBody: SceneDocument }
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'unauthorized' };

// ── ProjectManager interface ──────────────────────────────────────────────────

export interface ProjectManager {
  readonly type: 'local' | 'cloud';
  readonly identifier: ProjectIdentifier;

  /** Load the primary scene blob for this project. */
  loadScene(): Promise<SceneDocument>;

  /**
   * Persist the scene blob.
   * @param scene  The scene to save.
   * @param baseVersion  Optimistic-concurrency version (local: ignored; cloud: used for If-Match).
   */
  saveScene(scene: SceneDocument, baseVersion: number): Promise<SaveResult>;

  /** List all asset files in the project. */
  listAssets(): Promise<AssetMeta[]>;

  /**
   * Resolve a URL to a Blob for loading.
   * @param url  A project:// or assets:// URL string.
   */
  resolveAsset(url: string): Promise<Blob>;

  /** Tear down and release resources. For LocalProject, revokes cached blob URLs. */
  close(): Promise<void>;
}
