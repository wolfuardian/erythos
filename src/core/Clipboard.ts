import type { SceneNode } from './scene/SceneFormat';

type Listener = () => void;

// ── UUID helper ─────────────────────────────────────────────────────────────
// SceneDocument.ts 的 randomUUID 是模組私有函式（沒有 export），無法 import。
// crypto.randomUUID() 在某些測試環境（jsdom）可能不存在，所以需要 fallback。

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

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
      const newId = randomUUID();
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
