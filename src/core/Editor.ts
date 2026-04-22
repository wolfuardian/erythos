import { Scene } from 'three';
import { EventEmitter } from './EventEmitter';
import type { TransformMode } from './EventEmitter';
import { History } from './History';
import { Selection } from './Selection';
import { KeybindingManager } from './KeybindingManager';
import { Clipboard } from './Clipboard';
import type { Command } from './Command';
import { AutoSave, restoreSnapshot, STORAGE_KEY } from './scene/AutoSave';
import { ProjectManager } from './project/ProjectManager';
import { SceneDocument } from './scene/SceneDocument';
import { SceneSync } from './scene/SceneSync';
import { ResourceCache } from './scene/ResourceCache';
import type { SceneNode, SceneFile } from './scene/SceneFormat';
import type { LeafAsset } from './scene/LeafFormat';
import * as LeafStore from './scene/LeafStore';
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
  readonly projectManager: ProjectManager;
  autosave!: AutoSave;

  private _transformMode: TransformMode = 'translate';
  private _leafAssets = new Map<string, LeafAsset>();
  private _envSettings: EnvironmentSettings = { ...DEFAULT_ENV_SETTINGS };

  constructor() {
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
    this.projectManager = new ProjectManager();
  }

  /**
   * 非同步初始化：從 IndexedDB hydrate GLB 快取，再還原 autosave snapshot，最後啟動 AutoSave。
   * App 層需在 editor 對外提供 context 前 await 此方法。
   */
  async init(): Promise<void> {
    // 0. Restore leaf assets from IndexedDB
    const leafAssets = await LeafStore.getAll();
    for (const asset of leafAssets) {
      this._leafAssets.set(asset.id, asset);
    }

    // 1. Restore GLB buffers from IndexedDB so SceneSync can rebuild meshes.
    await this.resourceCache.hydrate();

    // 2. Restore autosaved scene snapshot (depends on resourceCache being populated).
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      try {
        restoreSnapshot(this, saved);
      } catch (err) {
        console.warn('[Editor] Could not restore autosave snapshot:', err);
      }
    }

    // 4. Start listening for scene changes and persisting them.
    this.autosave = new AutoSave(this);

    // 5. Notify bridge signals that async hydrate is complete.
    this.events.emit('leafStoreChanged');
  }

  // ── Transform mode ────────────────────────────────

  get transformMode(): TransformMode { return this._transformMode; }

  setTransformMode(mode: TransformMode): void {
    if (this._transformMode === mode) return;
    this._transformMode = mode;
    this.events.emit('transformModeChanged', mode);
  }

  // ── Leaf asset API ────────────────────────────────

  registerLeaf(asset: LeafAsset): void {
    this._leafAssets.set(asset.id, asset);
    void LeafStore.put(asset.id, asset);
    this.events.emit('leafStoreChanged');
  }

  unregisterLeaf(id: string): void {
    this._leafAssets.delete(id);
    void LeafStore.remove(id);
    this.events.emit('leafStoreChanged');
  }

  getAllLeafAssets(): LeafAsset[] {
    return Array.from(this._leafAssets.values());
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

  // ── Scene load / clear ────────────────────────────

  loadScene(data: SceneFile): void {
    this.selection.clear();
    this.selection.hover(null);
    this.history.clear();
    if (data.version !== 1) throw new Error(`Unsupported scene version: ${data.version}`);
    // SceneSync listens to sceneReplaced on sceneDocument.events and rebuilds Three.js scene
    this.sceneDocument.deserialize(data);
  }

  clear(): void {
    this.selection.clear();
    this.selection.hover(null);
    this.history.clear();
    // sceneDocument.deserialize emits sceneReplaced → SceneSync.rebuild() clears Three.js scene
    this.sceneDocument.deserialize({ version: 1, nodes: [] });
    this.events.emit('editorCleared');
  }

  dispose(): void {
    this.autosave?.dispose();
    this.sceneSync.dispose();
    this.keybindings.dispose();
    this.events.removeAllListeners();
  }
}
