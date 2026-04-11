import type { SceneNode, SceneFile } from './SceneFormat';

// ── Internal generic emitter ──────────────────────────────────────────────────

type Listener<T extends unknown[]> = (...args: T) => void;

class MiniEmitter<M extends Record<string, unknown[]>> {
  private _listeners = new Map<keyof M, Set<Listener<any>>>();

  on<K extends keyof M>(event: K, fn: Listener<M[K]>): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
  }

  off<K extends keyof M>(event: K, fn: Listener<M[K]>): void {
    this._listeners.get(event)?.delete(fn);
  }

  emit<K extends keyof M>(event: K, ...args: M[K]): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of set) fn(...args);
  }
}

// ── Event map ─────────────────────────────────────────────────────────────────

export interface SceneDocumentEventMap {
  nodeAdded:     [node: SceneNode];
  nodeRemoved:   [node: SceneNode];
  nodeChanged:   [uuid: string, changed: Partial<SceneNode>];
  sceneReplaced: [];
}

// ── UUID helper ───────────────────────────────────────────────────────────────

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── SceneDocument ─────────────────────────────────────────────────────────────

export class SceneDocument {
  private _nodes = new Map<string, SceneNode>();
  readonly events = new MiniEmitter<SceneDocumentEventMap>();

  // ── CRUD ──────────────────────────────────────────────────────────────────

  addNode(node: SceneNode): void {
    this._nodes.set(node.id, node);
    this.events.emit('nodeAdded', node);
  }

  removeNode(uuid: string): void {
    const node = this._nodes.get(uuid);
    if (!node) return;
    this._nodes.delete(uuid);
    this.events.emit('nodeRemoved', node);
  }

  updateNode(uuid: string, patch: Partial<SceneNode>): void {
    const node = this._nodes.get(uuid);
    if (!node) return;
    Object.assign(node, patch);
    this.events.emit('nodeChanged', uuid, patch);
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getNode(uuid: string): SceneNode | null {
    return this._nodes.get(uuid) ?? null;
  }

  getChildren(parentUuid: string): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this._nodes.values()) {
      if (node.parent === parentUuid) result.push(node);
    }
    return result.sort((a, b) => a.order - b.order);
  }

  getRoots(): SceneNode[] {
    const result: SceneNode[] = [];
    for (const node of this._nodes.values()) {
      if (node.parent === null) result.push(node);
    }
    return result.sort((a, b) => a.order - b.order);
  }

  getAllNodes(): SceneNode[] {
    return Array.from(this._nodes.values());
  }

  // ── Path API ──────────────────────────────────────────────────────────────

  getPath(uuid: string): string {
    const parts: string[] = [];
    let current = this._nodes.get(uuid);
    while (current) {
      parts.unshift(current.name);
      current = current.parent ? this._nodes.get(current.parent) : undefined;
    }
    return parts.join('/');
  }

  findByPath(path: string): SceneNode | null {
    const segments = path.split('/');
    let candidates = this.getRoots().filter(n => n.name === segments[0]);
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const next: SceneNode[] = [];
      for (const c of candidates) {
        next.push(...this.getChildren(c.id).filter(n => n.name === seg));
      }
      candidates = next;
    }
    return candidates[0] ?? null;
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  serialize(): SceneFile {
    return {
      version: 1,
      nodes: Array.from(this._nodes.values()).map(n => ({ ...n })),
    };
  }

  deserialize(data: SceneFile): void {
    this._nodes.clear();
    for (const node of data.nodes) {
      this._nodes.set(node.id, { ...node });
    }
    this.events.emit('sceneReplaced');
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  createNode(name: string, parent?: string): SceneNode {
    return {
      id: randomUUID(),
      name,
      parent: parent ?? null,
      order: 0,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale:    [1, 1, 1],
      components: {},
      userData:   {},
    };
  }

  hasNode(uuid: string): boolean {
    return this._nodes.has(uuid);
  }
}
