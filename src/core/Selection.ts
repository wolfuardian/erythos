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

  /**
   * Batch-replace UUIDs using an old→new mapping.
   *
   * For each UUID currently in the selection:
   *   - If it appears in `replacements` as a key → replaced with the mapped value.
   *   - If it appears in `removals`            → dropped (node was deleted).
   *   - Otherwise                              → kept as-is.
   *
   * Set iteration order is preserved: the rebuilt Set visits UUIDs in the same
   * sequence as before, so the primary (last-added) remains logically stable.
   * A single `selectionChanged` event is emitted (even if the set is unchanged).
   *
   * Usage: SceneSync._rebuildPrefabInstances calls this after each instance
   * rebuild to swap old subtree UUIDs for the freshly-generated ones.
   */
  replaceMany(replacements: ReadonlyMap<string, string>, removals: ReadonlySet<string>): void {
    const next = new Set<string>();
    for (const uuid of this._selected) {
      if (replacements.has(uuid)) {
        next.add(replacements.get(uuid)!);
      } else if (!removals.has(uuid)) {
        next.add(uuid);
      }
      // removed ⟹ not added to next (dropped silently)
    }
    this._selected = next;
    this.events.emit('selectionChanged', [...this._selected]);
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
