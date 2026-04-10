import type { Object3D } from 'three';
import type { EventEmitter, InteractionMode } from './EventEmitter';

export class Selection {
  private _selected: Set<Object3D> = new Set();
  private _hovered: Object3D | null = null;
  private _mode: InteractionMode = 'object';
  private events: EventEmitter;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  // ── Multi-select API ─────────────────────────────────

  get all(): readonly Object3D[] { return [...this._selected]; }
  get count(): number { return this._selected.size; }

  /** Last added object — gizmo attaches to this */
  get primary(): Object3D | null {
    if (this._selected.size === 0) return null;
    let last: Object3D | null = null;
    for (const obj of this._selected) last = obj;
    return last;
  }

  /** @deprecated Use `primary` — kept for backward compat until other modules migrate */
  get selected(): Object3D | null { return this.primary; }

  get hovered(): Object3D | null { return this._hovered; }
  get mode(): InteractionMode { return this._mode; }

  // ── Selection methods ────────────────────────────────

  /** Replace selection (plain click). select(null) = clear(). */
  select(object: Object3D | null): void {
    if (object === null) {
      this.clear();
      return;
    }
    if (this._selected.size === 1 && this._selected.has(object)) return;
    this._selected.clear();
    this._selected.add(object);
    this.events.emit('selectionChanged', [...this._selected]);
    this.events.emit('objectSelected', object);
  }

  /** Append to selection (Ctrl+Click) */
  add(object: Object3D): void {
    if (this._selected.has(object)) return;
    this._selected.add(object);
    this.events.emit('selectionChanged', [...this._selected]);
  }

  /** Remove one object from selection */
  remove(object: Object3D): void {
    if (!this._selected.has(object)) return;
    this._selected.delete(object);
    this.events.emit('selectionChanged', [...this._selected]);
  }

  /** Toggle membership (Ctrl+Click shorthand) */
  toggle(object: Object3D): void {
    if (this._selected.has(object)) {
      this._selected.delete(object);
    } else {
      this._selected.add(object);
    }
    this.events.emit('selectionChanged', [...this._selected]);
  }

  has(object: Object3D): boolean {
    return this._selected.has(object);
  }

  /** Clear all selection */
  clear(): void {
    if (this._selected.size === 0) return;
    this._selected.clear();
    this.events.emit('selectionChanged', []);
    this.events.emit('objectSelected', null);
  }

  // ── Hover ────────────────────────────────────────────

  hover(object: Object3D | null): void {
    if (this._hovered === object) return;
    this._hovered = object;
    this.events.emit('objectHovered', object);
  }

  // ── Mode ─────────────────────────────────────────────

  setMode(mode: InteractionMode): void {
    if (this._mode === mode) return;
    this._mode = mode;
    this.events.emit('interactionModeChanged', mode);
  }
}
