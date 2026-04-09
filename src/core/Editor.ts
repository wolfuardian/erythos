import { Scene, Object3D } from 'three';
import { EventEmitter } from './EventEmitter';
import type { TransformMode } from './EventEmitter';
import { History } from './History';
import { Selection } from './Selection';
import { KeybindingManager } from './KeybindingManager';
import type { Command } from './Command';

export class Editor {
  readonly scene: Scene;
  readonly events: EventEmitter;
  readonly history: History;
  readonly selection: Selection;
  readonly keybindings: KeybindingManager;

  private _transformMode: TransformMode = 'translate';

  constructor() {
    this.scene = new Scene();
    this.scene.name = 'Scene';
    this.events = new EventEmitter();
    this.history = new History(this.events);
    this.selection = new Selection(this.events);
    this.keybindings = new KeybindingManager();
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

  // ── Scene management ──────────────────────────────

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
    if (this.selection.selected === object) {
      this.selection.select(null);
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
    this.keybindings.dispose();
    this.events.removeAllListeners();
  }
}
