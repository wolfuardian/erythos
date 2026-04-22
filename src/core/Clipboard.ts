import type { SceneNode } from './scene/SceneFormat';
import { generateUUID } from '../utils/uuid';

type Listener = () => void;

// ── Clipboard ───────────────────────────────────────────────────────────────

export class Clipboard {
  private _content: { nodes: SceneNode[]; mode: 'copy' | 'cut' } | null = null;
  private _listeners = new Set<Listener>();

  // ── Public API ─────────────────────────────────────

  copy(nodes: SceneNode[]): void {
    this._content = { nodes: structuredClone(nodes), mode: 'copy' };
    this._emit();
  }

  cut(nodes: SceneNode[]): void {
    this._content = { nodes: structuredClone(nodes), mode: 'cut' };
    this._emit();
  }

  paste(): SceneNode[] | null {
    if (!this._content) return null;

    // 1. Clone the stored nodes
    const clones = structuredClone(this._content.nodes);

    // 2. Build old→new UUID mapping
    const idMap = new Map<string, string>();
    for (const node of clones) {
      const newId = generateUUID();
      idMap.set(node.id, newId);
      node.id = newId;
    }

    // 3. Remap parent references
    for (const node of clones) {
      if (node.parent !== null) {
        const remapped = idMap.get(node.parent);
        node.parent = remapped ?? null;  // 不在 clone 集合中 → 放根層級
      }
    }

    // 4. Cut mode: paste once then clear
    if (this._content.mode === 'cut') {
      this._content = null;
    }

    this._emit();
    return clones;
  }

  get hasContent(): boolean {
    return this._content !== null;
  }

  get mode(): 'copy' | 'cut' | null {
    return this._content?.mode ?? null;
  }

  // ── Event: clipboardChanged ────────────────────────

  on(_event: 'clipboardChanged', fn: Listener): void {
    this._listeners.add(fn);
  }

  off(_event: 'clipboardChanged', fn: Listener): void {
    this._listeners.delete(fn);
  }

  // ── Internal ───────────────────────────────────────

  private _emit(): void {
    for (const fn of this._listeners) {
      fn();
    }
  }
}
