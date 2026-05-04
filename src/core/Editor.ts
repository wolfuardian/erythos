import { Scene } from 'three';
import { EventEmitter } from './EventEmitter';
import type { TransformMode } from './EventEmitter';
import { History } from './History';
import { Selection } from './Selection';
import { KeybindingManager } from './KeybindingManager';
import { Clipboard } from './Clipboard';
import type { Command } from './Command';
import { ProjectManager } from './project/ProjectManager';
import { SceneDocument } from './scene/SceneDocument';
import { SceneSync } from './scene/SceneSync';
import { ResourceCache } from './scene/ResourceCache';
import { PrefabRegistry } from './scene/PrefabRegistry';
import type { SceneNode, SceneFile } from './scene/SceneFormat';
import type { PrefabAsset } from './scene/PrefabFormat';
import * as PrefabStore from './scene/PrefabStore';
import { DEFAULT_ENV_SETTINGS, type EnvironmentSettings } from './scene/EnvironmentSettings';
import { prefabPathForName } from '../utils/prefabPath';

export class Editor {
  readonly scene: Scene;
  readonly sceneDocument: SceneDocument;
  readonly sceneSync: SceneSync;
  readonly resourceCache: ResourceCache;
  readonly prefabRegistry: PrefabRegistry;
  readonly events: EventEmitter;
  readonly history: History;
  readonly selection: Selection;
  readonly keybindings: KeybindingManager;
  readonly clipboard: Clipboard;
  private _transformMode: TransformMode = 'translate';
  private _envSettings: EnvironmentSettings = { ...DEFAULT_ENV_SETTINGS };

  /**
   * Map from legacy prefab UUID → project-relative path.
   * Built once in init() during the IDB→file migration and kept for the
   * lifetime of the editor session. Used by loadScene to resolve legacy
   * `prefab.id` refs during deserialization.
   *
   * Assumption: single project per origin — Editor is re-constructed on project switch
   * (App.tsx closes + reopens), so the map is always fresh for each project session.
   */
  private _prefabIdToPath: Record<string, string> = {};

  constructor(public readonly projectManager: ProjectManager) {
    this.scene = new Scene();
    this.scene.name = 'Scene';
    this.sceneDocument = new SceneDocument();
    this.resourceCache = new ResourceCache();
    this.prefabRegistry = new PrefabRegistry();
    this.sceneSync = new SceneSync(this.sceneDocument, this.scene, this.resourceCache);
    this.events = new EventEmitter();
    this.history = new History(this.events);
    this.selection = new Selection(this.events);
    this.keybindings = new KeybindingManager();
    this.clipboard = new Clipboard();
  }

  /**
   * Non-blocking init:
   *   1. Run one-time IDB→file migration for legacy PrefabStore assets.
   *   2. Hydrate PrefabRegistry from project files.
   *   3. Notify bridge signals.
   *
   * GLB hydration has moved to loadScene (P1b) — no GlbStore restore needed.
   * App layer must await this before making the editor available externally.
   */
  async init(): Promise<void> {
    // ── Step 1: one-time IDB → file migration ──────────────────────────────
    // Guard: only run if a project is open (init called before project open is a no-op)
    if (this.projectManager.isOpen) {
      const legacyAssets = await PrefabStore.getAll();
      if (legacyAssets.length > 0) {
        const idToPath: Record<string, string> = {};
        for (const asset of legacyAssets) {
          const path = prefabPathForName(asset.name);
          idToPath[asset.id] = path;

          // Idempotency: skip if file already exists (don't clobber)
          const alreadyExists = this.projectManager
            .getFiles()
            .some(f => f.path === path);
          if (!alreadyExists) {
            try {
              await this.projectManager.writeFile(path, JSON.stringify(asset));
            } catch (err) {
              console.warn(`[Editor] init: could not migrate prefab "${asset.name}" → ${path}:`, err);
            }
          }
        }
        this._prefabIdToPath = idToPath;

        // Rescan so getFiles() includes the newly written prefab files
        await this.projectManager.rescan();

        // Clear legacy IDB store after successful migration
        try {
          await PrefabStore.clear();
        } catch (err) {
          console.warn('[Editor] init: could not clear legacy PrefabStore after migration:', err);
        }
      }
    }

    // ── Step 2: hydrate PrefabRegistry from project files ──────────────────
    await this._hydratePrefabRegistry();

    // ── Step 3: notify bridge ───────────────────────────────────────────────
    this.events.emit('prefabStoreChanged');
  }

  /**
   * Walk project files, filter `.prefab`, resolve URLs, load into PrefabRegistry.
   * Soft-fails per file (missing / malformed prefabs don't crash the editor).
   */
  private async _hydratePrefabRegistry(): Promise<void> {
    if (!this.projectManager.isOpen) return;

    const prefabFiles = this.projectManager.getFiles().filter(f => f.type === 'prefab');
    for (const file of prefabFiles) {
      try {
        const url = await this.projectManager.urlFor(file.path);
        await this.prefabRegistry.loadFromURL(url, file.path);
      } catch (err) {
        console.warn(`[Editor] _hydratePrefabRegistry: could not load "${file.path}":`, err);
      }
    }
  }

  // ── Transform mode ────────────────────────────────

  get transformMode(): TransformMode { return this._transformMode; }

  setTransformMode(mode: TransformMode): void {
    if (this._transformMode === mode) return;
    this._transformMode = mode;
    this.events.emit('transformModeChanged', mode);
  }

  // ── Prefab asset API ──────────────────────────────

  /**
   * Register a new prefab: write to project file, update PrefabRegistry, emit event.
   * Write is fire-and-forget (matches legacy PrefabStore.put pattern).
   * The derived path (`prefabs/<safeName>.prefab`) is returned synchronously so
   * SaveAsPrefabCommand can store it in the scene node immediately.
   */
  registerPrefab(asset: PrefabAsset): string {
    const path = prefabPathForName(asset.name);

    // Write to project async (fire-and-forget)
    void (async () => {
      try {
        await this.projectManager.writeFile(path, JSON.stringify(asset));
        const url = await this.projectManager.urlFor(path);
        this.prefabRegistry.set(url, asset, path);
        await this.projectManager.rescan();
        this.events.emit('prefabStoreChanged');
      } catch (err) {
        console.warn(`[Editor] registerPrefab: could not write "${path}":`, err);
      }
    })();

    return path;
  }

  /**
   * Unregister a prefab by its project-relative path.
   * Evicts from PrefabRegistry and deletes the file.
   */
  unregisterPrefab(path: string): void {
    this.prefabRegistry.evictByPath(path);

    void (async () => {
      try {
        await this.projectManager.deleteFile(path);
        await this.projectManager.rescan();
        this.events.emit('prefabStoreChanged');
      } catch (err) {
        console.warn(`[Editor] unregisterPrefab: could not delete "${path}":`, err);
      }
    })();
  }

  getAllPrefabAssets(): PrefabAsset[] {
    return this.prefabRegistry.getAllAssets();
  }

  // ── Environment settings ──────────────────────────

  getEnvironmentSettings(): EnvironmentSettings {
    return { ...this._envSettings };
  }

  setEnvironmentSettings(patch: Partial<EnvironmentSettings>): void {
    Object.assign(this._envSettings, patch);
    this.events.emit('environmentChanged');
  }

  // ── Command execution ─────────────────────────────

  execute(cmd: Command): void {
    this.history.execute(cmd);
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  // ── Scene document API ────────────────────────────

  get threeScene(): Scene { return this.scene; }

  addNode(node: SceneNode): void {
    this.sceneDocument.addNode(node);
    this.events.emit('nodeAdded', node.id);
  }

  removeNode(uuid: string): void {
    this.sceneDocument.removeNode(uuid);
    this.events.emit('nodeRemoved', uuid);
  }

  // ── Scene load ────────────────────────────────────

  /**
   * Load a scene: deserialize nodes (with migration), then hydrate mesh + prefab URLs.
   *
   * Hydrate walk (P1b for mesh, P1c for prefab):
   *   After deserialize, walk all nodes with mesh.path / prefab.path and populate
   *   mesh.url / prefab.url via projectManager.urlFor(path).
   *
   *   Failure mode: soft-fail per node — if urlFor throws (file not found), log
   *   a warning and leave the url field absent. SceneSync skips the mesh silently.
   *
   * @param data - Parsed SceneFile (may be legacy with mesh.source / prefab.id)
   */
  async loadScene(data: SceneFile): Promise<void> {
    this.selection.clear();
    this.selection.hover(null);
    this.history.clear();
    if (data.version !== 1) throw new Error(`Unsupported scene version: ${data.version}`);

    // Deserialize with prefab migration map — resolves legacy prefab.id → path
    this.sceneDocument.deserialize(data, this._prefabIdToPath);

    // Hydrate mesh + prefab URLs
    for (const node of this.sceneDocument.getAllNodes()) {
      // Mesh hydration (P1b)
      const mesh = node.components['mesh'] as { path?: string; nodePath?: string; url?: string } | undefined;
      if (mesh?.path && !mesh.url) {
        try {
          const url = await this.projectManager.urlFor(mesh.path);
          if (!this.resourceCache.has(url)) {
            await this.resourceCache.loadFromURL(url);
          }
          mesh.url = url;
        } catch (err) {
          console.warn(`[Editor] loadScene: could not hydrate mesh "${mesh.path}" — mesh will be invisible:`, err);
        }
      }

      // Prefab hydration (P1c)
      const prefab = node.components['prefab'] as { path?: string; url?: string } | undefined;
      if (prefab?.path && !prefab.url) {
        try {
          const url = await this.projectManager.urlFor(prefab.path);
          if (!this.prefabRegistry.has(url)) {
            await this.prefabRegistry.loadFromURL(url, prefab.path);
          }
          prefab.url = url;
        } catch (err) {
          console.warn(`[Editor] loadScene: could not hydrate prefab "${prefab.path}" — prefab ref will be unresolved:`, err);
        }
      }
    }

    // Trigger SceneSync rebuild now that URLs are populated.
    // sceneReplaced was already emitted by deserialize, so SceneSync's rebuild ran before hydration.
    // Kick a second rebuild to pick up the populated urls.
    this.sceneSync.rebuild();
  }

  dispose(): void {
    this.sceneSync.dispose();
    this.keybindings.dispose();
    this.events.removeAllListeners();
  }
}
