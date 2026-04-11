import { Scene, Object3D } from 'three';
import { EventEmitter } from './EventEmitter';
import type { TransformMode } from './EventEmitter';
import { History } from './History';
import { Selection } from './Selection';
import { KeybindingManager } from './KeybindingManager';
import type { Command } from './Command';
import { AutoSave, restoreSnapshot, STORAGE_KEY } from './scene/AutoSave';
import { SceneDocument } from './scene/SceneDocument';
import { SceneSync } from './scene/SceneSync';
import type { SceneNode } from './scene/SceneFormat';

export class Editor {
  readonly scene: Scene;
  readonly sceneDocument: SceneDocument;
  readonly sceneSync: SceneSync;
  readonly events: EventEmitter;
  readonly history: History;
  readonly selection: Selection;
  readonly keybindings: KeybindingManager;
  readonly autosave: AutoSave;

  private _transformMode: TransformMode = 'translate';

  constructor() {
    this.scene = new Scene();
    this.scene.name = 'Scene';
    this.sceneDocument = new SceneDocument();
    this.sceneSync = new SceneSync(this.sceneDocument, this.scene);
    this.events = new EventEmitter();
    this.history = new History(this.events);
    this.selection = new Selection(this.events);
    this.keybindings = new KeybindingManager();

    // Restore autosaved snapshot before any UI mounts, then start listening.
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      try {
        restoreSnapshot(this, saved);
      } catch (err) {
        console.warn('[Editor] Could not restore autosave snapshot:', err);
      }
    }
    this.autosave = new AutoSave(this);
  }

  // ── Transform mode ────────────────────────────────

  get transformMode(): TransformMode { return this._transformMode; }

  setTransformMode(mode: TransformMode): void {
    if (this._transformMode === mode) return;
    this._transformMode = mode;
    this.events.emit('transformModeChanged', mode);
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
  }

  removeNode(uuid: string): void {
    this.sceneDocument.removeNode(uuid);
  }

  // ── Scene management (legacy Three.js API) ────────

  addObject(object: Object3D, parent?: Object3D): void {
    const target = parent ?? this.scene;
    target.add(object);
    this.events.emit('objectAdded', object);
    this.events.emit('sceneGraphChanged');
  }

  removeObject(object: Object3D): void {
    const parent = object.parent;
    if (!parent) return;
    parent.remove(object);
    if (this.selection.has(object)) {
      this.selection.remove(object);
    }
    if (this.selection.hovered === object) {
      this.selection.hover(null);
    }
    this.events.emit('objectRemoved', object, parent);
    this.events.emit('sceneGraphChanged');
  }

  objectChanged(object: Object3D): void {
    this.events.emit('objectChanged', object);
  }

  // ── Clear ─────────────────────────────────────────

  clear(): void {
    this.selection.clear();
    this.selection.hover(null);
    this.history.clear();

    // Remove all user objects (keep default children like lights if any)
    const children = [...this.scene.children];
    for (const child of children) {
      this.scene.remove(child);
    }

    this.events.emit('editorCleared');
    this.events.emit('sceneGraphChanged');
  }

  dispose(): void {
    this.autosave.dispose();
    this.sceneSync.dispose();
    this.keybindings.dispose();
    this.events.removeAllListeners();
  }
}
