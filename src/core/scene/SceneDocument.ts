import type { SceneNode, SceneFile } from './SceneFormat';
import { generateUUID } from '../../utils/uuid';

// Migration helper: upgrade old scene files that stored prefab component under 'leaf' key
function migrateNodeComponents(node: SceneNode): SceneNode {
  const comp = node.components as Record<string, unknown>;
  if ('leaf' in comp && !('prefab' in comp)) {
    const { leaf, ...rest } = comp;
    return { ...node, components: { ...rest, prefab: leaf } };
  }
  return node;
}

// ── Internal generic emitter ──────────────────────────────────────────────────

type Listener<T extends unknown[]> = (...args: T) => void;
type EventArgs<M, K extends keyof M> = M[K] extends unknown[] ? M[K] : never;

class MiniEmitter<M> {
  private _listeners = new Map<keyof M, Set<Listener<any>>>();

  on<K extends keyof M>(event: K, fn: Listener<EventArgs<M, K>>): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
  }

  off<K extends keyof M>(event: K, fn: Listener<EventArgs<M, K>>): void {
    this._listeners.get(event)?.delete(fn);
  }

  emit<K extends keyof M>(event: K, ...args: EventArgs<M, K>): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of set) fn(...args);
  }
}

// ── Event map ─────────────────────────────────────────────────────────────────

/**
 * Data-model-level events fired on `editor.sceneDocument.events`.
 *
 * Authoritative source for scene graph mutations. Subscribe from low-level
 * syncers (Three.js scene rebuild, autosave, bridge) that need the full
 * `SceneNode` payload or the `nodeChanged` / `sceneReplaced` signals.
 *
 * UI code that only needs to know "a node appeared / disappeared" should
 * prefer `editor.events` (see `EditorEventMap`) which emits a thinner
 * `uuid`-only payload.
 */
export interface SceneDocumentEventMap {
  nodeAdded:     [node: SceneNode];
  nodeRemoved:   [node: SceneNode];
  nodeChanged:   [uuid: string, changed: Partial<SceneNode>];
  sceneReplaced: [];
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
    for (const rawNode of data.nodes) {
      const node = migrateNodeComponents({ ...rawNode });
      this._nodes.set(node.id, node);
    }
    this.events.emit('sceneReplaced');
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  createNode(name: string, parent?: string): SceneNode {
    return {
      id: generateUUID(),
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
