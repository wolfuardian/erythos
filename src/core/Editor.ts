import { Scene } from 'three';
import { EventEmitter } from './EventEmitter';
import type { TransformMode } from './EventEmitter';
import type { AssetPath, NodeUUID } from '../utils/branded';
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
import type { SceneNode } from './scene/SceneFormat';
import type { SceneEnv } from './scene/SceneFormat';
import type { PrefabAsset } from './scene/PrefabFormat';
import { AssetResolver } from './io/AssetResolver';
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
  readonly assetResolver: AssetResolver;

  private _transformMode: TransformMode = 'translate';

  constructor(public readonly projectManager: ProjectManager) {
    this.scene = new Scene();
    this.scene.name = 'Scene';
    this.sceneDocument = new SceneDocument();
    this.resourceCache = new ResourceCache();
    this.prefabRegistry = new PrefabRegistry();
    this.assetResolver = new AssetResolver(projectManager);
    this.sceneSync = new SceneSync(this.sceneDocument, this.scene, this.resourceCache);
    this.events = new EventEmitter();
    this.history = new History(this.events);
    this.selection = new Selection(this.events);
    this.keybindings = new KeybindingManager();
    this.clipboard = new Clipboard();

    // Forward SceneDocument env changes to EventEmitter so bridge can react
    this.sceneDocument.events.on('envChanged', () => {
      this.events.emit('environmentChanged');
    });
  }

  /**
   * Non-blocking init:
   *   1. Hydrate PrefabRegistry from project files.
   *   2. Wire live-sync event chain.
   *   3. Notify bridge signals.
   */
  async init(): Promise<void> {
    // ── Step 1: hydrate PrefabRegistry from project files ──────────────────
    await this._hydratePrefabRegistry();

    // ── Step 2: wire prefab live-sync ──────────────────────────────────────
    this.prefabRegistry.attach(this.projectManager);
    this.sceneSync.attachPrefabRegistry(this.prefabRegistry);

    // ── Step 3: notify bridge ───────────────────────────────────────────────
    this.events.emit('prefabStoreChanged');
  }

  /**
   * Walk project files, filter `.prefab`, resolve URLs, load into PrefabRegistry.
   * Soft-fails per file.
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
   */
  registerPrefab(asset: PrefabAsset): AssetPath {
    const path = prefabPathForName(asset.name);

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
   */
  unregisterPrefab(path: AssetPath): void {
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

  // ── Environment settings (delegated to SceneDocument.env) ────────────────

  getEnvironmentSettings(): SceneEnv {
    return { ...this.sceneDocument.env };
  }

  setEnvironmentSettings(patch: Partial<SceneEnv>): void {
    this.sceneDocument.setEnv(patch);
    // envChanged → environmentChanged is forwarded via constructor subscription
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

  removeNode(uuid: NodeUUID): void {
    this.sceneDocument.removeNode(uuid);
    this.events.emit('nodeRemoved', uuid);
  }

  // ── Scene load ────────────────────────────────────

  /**
   * Load a scene: deserialize nodes (with v0→v1 migration), then hydrate
   * mesh URLs via AssetResolver and prefab assets via PrefabRegistry.
   *
   * Hydration walk:
   *   - mesh nodes with assets:// or blob:// URLs: resolve to blob URL, load into ResourceCache
   *   - prefab nodes with prefabs:// URLs: resolve path, load PrefabAsset into PrefabRegistry
   *
   * Soft-fail per node — missing assets log a warning and the node renders as empty.
   *
   * @param data - Parsed JSON from a .erythos file (any version; migration runs in deserialize)
   */
  async loadScene(data: unknown): Promise<void> {
    this.selection.select(null);
    this.selection.hover(null);
    this.history.clear();

    // Deserialize (runs v0_to_v1 migration internally, restores env)
    this.sceneDocument.deserialize(data);

    // Clear stale resolved URL mappings from any previous load.
    this.sceneSync.clearResolvedBlobUrls();

    // Hydrate mesh and prefab URLs.
    // IMPORTANT: node.asset is never mutated here — it always holds the persistent
    // assets:// URL. Resolved blob URLs are registered with SceneSync via
    // setResolvedBlobUrl() so SceneSync can look them up without data-loss on save.
    for (const node of this.sceneDocument.getAllNodes()) {
      if (node.nodeType === 'mesh' && node.asset) {
        // Skip primitives — no file loading needed
        if (node.asset.startsWith('assets://primitives/')) continue;

        try {
          const blobUrl = await this.assetResolver.resolve(node.asset);
          if (!this.resourceCache.has(blobUrl)) {
            await this.resourceCache.loadFromURL(blobUrl);
          }
          // Register blob URL with SceneSync. node.asset stays as assets:// (persistent).
          this.sceneSync.setResolvedBlobUrl(node.asset, blobUrl);
        } catch (err) {
          console.warn(`[Editor] loadScene: could not hydrate mesh asset "${node.asset}" — will render empty:`, err);
        }
      }

      if (node.nodeType === 'prefab' && node.asset) {
        try {
          const path = this.assetResolver.pathFor(node.asset);
          if (path) {
            const url = await this.projectManager.urlFor(path);
            if (!this.prefabRegistry.has(url)) {
              await this.prefabRegistry.loadFromURL(url, path);
            }
          }
        } catch (err) {
          console.warn(`[Editor] loadScene: could not hydrate prefab "${node.asset}" — will render empty:`, err);
        }
      }
    }

    // Trigger SceneSync rebuild now that URLs are populated.
    // sceneReplaced was emitted by deserialize, but SceneSync ran before hydration.
    // Kick a second rebuild to pick up loaded assets.
    this.sceneSync.rebuild();
  }

  // ── Scene clear ───────────────────────────────────

  /**
   * Clear the scene: remove all nodes, reset env, clear selection/history.
   */
  clearScene(): void {
    this.selection.select(null);
    this.selection.hover(null);
    this.history.clear();
    this.sceneDocument.clearScene();
  }

  dispose(): void {
    this.prefabRegistry.detach();
    this.sceneSync.dispose();
    this.keybindings.dispose();
    this.events.removeAllListeners();
  }
}
