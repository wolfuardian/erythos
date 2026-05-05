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
import { PrefabInstanceWatcher } from './scene/PrefabInstanceWatcher';
import type { SceneNode, SceneFile } from './scene/SceneFormat';
import type { BlobURL } from '../utils/branded';
import type { PrefabAsset } from './scene/PrefabFormat';
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
  readonly prefabInstanceWatcher: PrefabInstanceWatcher;
  private _transformMode: TransformMode = 'translate';
  private _envSettings: EnvironmentSettings = { ...DEFAULT_ENV_SETTINGS };


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
    this.prefabInstanceWatcher = new PrefabInstanceWatcher(
      this.sceneDocument,
      projectManager,
    );
  }

  /**
   * Non-blocking init:
   *   1. Hydrate PrefabRegistry from project files.
   *   2. Wire live-sync event chain.
   *   3. Notify bridge signals.
   *
   * GLB hydration has moved to loadScene (P1b) — no GlbStore restore needed.
   * IDB→file migration (was step 1 pre-P4) has been removed — PrefabStore is
   * decommissioned. Users who haven't run the app since P1c will not be
   * auto-migrated; this is an accepted one-way step (see P4 PR body).
   * App layer must await this before making the editor available externally.
   */
  async init(): Promise<void> {
    // ── Step 1: hydrate PrefabRegistry from project files ──────────────────
    await this._hydratePrefabRegistry();

    // ── Step 2: wire live-sync event chain ─────────────────────────────────
    // PrefabRegistry listens to projectManager.fileChanged → refetches → emits prefabChanged.
    // Main SceneSync subscribes to prefabChanged → rebuilds instance subtrees.
    // Sandbox SceneSyncs (Workshop) deliberately do NOT subscribe — they must not
    // auto-rebuild while the user is actively editing the same prefab.
    this.prefabRegistry.attach(this.projectManager);
    this.sceneSync.attachPrefabRegistry(this.prefabRegistry);
    // Wire PrefabInstanceWatcher into SceneSync so it can query the self-write
    // registry before rebuilding the originating instance.
    this.sceneSync.attachInstanceWatcher(this.prefabInstanceWatcher);
    // Wire Selection into SceneSync so it can snapshot/restore selection state
    // across prefab live-sync rebuilds (fresh UUIDs are swapped in place).
    this.sceneSync.attachSelection(this.selection);

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
   * Write is fire-and-forget (path returned synchronously so SaveAsPrefabCommand
   * can store it in the scene node immediately).
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

    // Deserialize scene data (migration of legacy formats runs inside deserialize)
    this.sceneDocument.deserialize(data);

    // Hydrate mesh + prefab URLs
    for (const node of this.sceneDocument.getAllNodes()) {
      // Mesh hydration (P1b)
      const mesh = node.components['mesh'] as { path?: string; nodePath?: string; url?: BlobURL } | undefined;
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
      const prefab = node.components['prefab'] as { path?: string; url?: BlobURL } | undefined;
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
    // Dispose watcher first: it unsubscribes from SceneDocument events.
    // sceneSync.dispose() comes after so the detach order is:
    //   watcher → sceneSync → prefabRegistry
    this.prefabInstanceWatcher.dispose();
    this.sceneSync.attachInstanceWatcher(null);
    this.sceneSync.attachSelection(null);
    this.prefabRegistry.detach();
    this.sceneSync.dispose();
    this.keybindings.dispose();
    this.events.removeAllListeners();
  }
}
