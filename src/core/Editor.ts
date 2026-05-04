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
import type { SceneNode, SceneFile } from './scene/SceneFormat';
import type { PrefabAsset } from './scene/PrefabFormat';
import * as PrefabStore from './scene/PrefabStore';
import { DEFAULT_ENV_SETTINGS, type EnvironmentSettings } from './scene/EnvironmentSettings';

export class Editor {
  readonly scene: Scene;
  readonly sceneDocument: SceneDocument;
  readonly sceneSync: SceneSync;
  readonly resourceCache: ResourceCache;
  readonly events: EventEmitter;
  readonly history: History;
  readonly selection: Selection;
  readonly keybindings: KeybindingManager;
  readonly clipboard: Clipboard;
  private _transformMode: TransformMode = 'translate';
  private _prefabAssets = new Map<string, PrefabAsset>();
  private _envSettings: EnvironmentSettings = { ...DEFAULT_ENV_SETTINGS };

  constructor(public readonly projectManager: ProjectManager) {
    this.scene = new Scene();
    this.scene.name = 'Scene';
    this.sceneDocument = new SceneDocument();
    this.resourceCache = new ResourceCache();
    this.sceneSync = new SceneSync(this.sceneDocument, this.scene, this.resourceCache);
    this.events = new EventEmitter();
    this.history = new History(this.events);
    this.selection = new Selection(this.events);
    this.keybindings = new KeybindingManager();
    this.clipboard = new Clipboard();
  }

  /**
   * 非同步初始化：還原 prefab assets，啟動 AutoSave。
   * GLB hydration 已移至 loadScene (P1b) — 不再需要 GlbStore restore。
   * App 層需在 editor 對外提供 context 前 await 此方法。
   */
  async init(): Promise<void> {
    // Restore prefab assets from IndexedDB
    const prefabAssets = await PrefabStore.getAll();
    for (const asset of prefabAssets) {
      this._prefabAssets.set(asset.id, asset);
    }

    // Notify bridge signals
    this.events.emit('prefabStoreChanged');
  }

  // ── Transform mode ────────────────────────────────

  get transformMode(): TransformMode { return this._transformMode; }

  setTransformMode(mode: TransformMode): void {
    if (this._transformMode === mode) return;
    this._transformMode = mode;
    this.events.emit('transformModeChanged', mode);
  }

  // ── Prefab asset API ──────────────────────────────

  registerPrefab(asset: PrefabAsset): void {
    this._prefabAssets.set(asset.id, asset);
    void PrefabStore.put(asset.id, asset);
    this.events.emit('prefabStoreChanged');
  }

  unregisterPrefab(id: string): void {
    this._prefabAssets.delete(id);
    void PrefabStore.remove(id);
    this.events.emit('prefabStoreChanged');
  }

  getAllPrefabAssets(): PrefabAsset[] {
    return Array.from(this._prefabAssets.values());
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
   * Load a scene: deserialize nodes, then hydrate mesh URLs.
   *
   * Hydrate walk (P1b):
   *   After deserialize, walk all nodes with mesh.path and populate mesh.url
   *   via projectManager.urlFor(path). Hydrate is done here (caller of deserialize)
   *   so SceneDocument stays pure data and SceneSync stays synchronous.
   *
   *   Failure mode: soft-fail per node — if urlFor throws (file not found), log
   *   a warning and leave mesh.url absent. SceneSync will skip the mesh silently.
   *   This mirrors the pre-P1b behavior where a GlbStore cache miss = empty Object3D.
   *
   * @param data - Parsed SceneFile (may be legacy with mesh.source — migrateNodeComponents handles that)
   */
  async loadScene(data: SceneFile): Promise<void> {
    this.selection.clear();
    this.selection.hover(null);
    this.history.clear();
    if (data.version !== 1) throw new Error(`Unsupported scene version: ${data.version}`);

    // Deserialize first — migrateNodeComponents runs here, converting legacy mesh.source → mesh.path
    this.sceneDocument.deserialize(data);

    // Hydrate mesh URLs: resolve path → blob URL → load into ResourceCache
    for (const node of this.sceneDocument.getAllNodes()) {
      const mesh = node.components['mesh'] as { path?: string; nodePath?: string; url?: string } | undefined;
      if (!mesh || !mesh.path) continue;
      if (mesh.url) continue; // already hydrated (e.g. freshly imported)

      try {
        const url = await this.projectManager.urlFor(mesh.path);
        if (!this.resourceCache.has(url)) {
          await this.resourceCache.loadFromURL(url);
        }
        // Update the in-memory node directly (no Command — this is infrastructure, not user action)
        mesh.url = url;
      } catch (err) {
        console.warn(`[Editor] loadScene: could not hydrate mesh "${mesh.path}" — mesh will be invisible:`, err);
      }
    }

    // Trigger SceneSync rebuild now that URLs are populated
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
