import type { EventEmitter, InteractionMode } from './EventEmitter';

export class Selection {
  private _selected: Set<string> = new Set();
  private _hovered: string | null = null;
  private _mode: InteractionMode = 'object';
  private events: EventEmitter;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  // ── Multi-select API ─────────────────────────────────

  get all(): readonly string[] { return [...this._selected]; }
  get count(): number { return this._selected.size; }

  /** Last added UUID — gizmo attaches to this */
  get primary(): string | null {
    if (this._selected.size === 0) return null;
    let last: string | null = null;
    for (const uuid of this._selected) last = uuid;
    return last;
  }

  get hovered(): string | null { return this._hovered; }
  get mode(): InteractionMode { return this._mode; }

  // ── Selection methods ────────────────────────────────

  /** Replace selection (plain click). select(null) = clear(). */
  select(uuid: string | null): void {
    if (uuid === null) {
      this.clear();
      return;
    }
    if (this._selected.size === 1 && this._selected.has(uuid)) return;
    this._selected.clear();
    this._selected.add(uuid);
    this.events.emit('selectionChanged', [...this._selected]);
  }

  /** Append to selection (Ctrl+Click) */
  add(uuid: string): void {
    if (this._selected.has(uuid)) return;
    this._selected.add(uuid);
    this.events.emit('selectionChanged', [...this._selected]);
  }

  /** Remove one UUID from selection */
  remove(uuid: string): void {
    if (!this._selected.has(uuid)) return;
    this._selected.delete(uuid);
    this.events.emit('selectionChanged', [...this._selected]);
  }

  /** Toggle membership (Ctrl+Click shorthand) */
  toggle(uuid: string): void {
    if (this._selected.has(uuid)) {
      this._selected.delete(uuid);
    } else {
      this._selected.add(uuid);
    }
    this.events.emit('selectionChanged', [...this._selected]);
  }

  has(uuid: string): boolean {
    return this._selected.has(uuid);
  }

  /** Clear all selection */
  clear(): void {
    if (this._selected.size === 0) return;
    this._selected.clear();
    this.events.emit('selectionChanged', []);
  }

  // ── Hover ────────────────────────────────────────────

  hover(uuid: string | null): void {
    if (this._hovered === uuid) return;
    this._hovered = uuid;
    this.events.emit('hoverChanged', uuid);
  }

  // ── Mode ─────────────────────────────────────────────

  setMode(mode: InteractionMode): void {
    if (this._mode === mode) return;
    this._mode = mode;
    this.events.emit('interactionModeChanged', mode);
  }
}
