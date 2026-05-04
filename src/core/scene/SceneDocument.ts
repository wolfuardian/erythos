import type { SceneNode, SceneFile } from './SceneFormat';
import { generateUUID } from '../../utils/uuid';

/**
 * Migration helper: upgrade old scene files.
 *
 * @param node        The raw node from the serialised scene file.
 * @param prefabIdToPath  Optional map from legacy prefab uuid → project-relative path,
 *                    built once at Editor.init from the IndexedDB PrefabStore migration.
 *                    When provided, prefab.id refs are resolved to prefab.path.
 *
 * Migrations applied (in order):
 *   1. 'leaf' → 'prefab'               (very old format)
 *   2. prefab.id → prefab.path         (P1c: UUID → path-based refs)
 *   3. mesh.source → mesh.{path,nodePath?}  (P1b legacy format)
 */
function migrateNodeComponents(
  node: SceneNode,
  prefabIdToPath?: Record<string, string>,
): SceneNode {
  const comp = node.components as Record<string, unknown>;
  let mutated = false;
  let updated = comp;

  // Migration 1: 'leaf' → 'prefab'
  if ('leaf' in updated && !('prefab' in updated)) {
    const { leaf, ...rest } = updated;
    updated = { ...rest, prefab: leaf };
    mutated = true;
  }

  // Migration 2: prefab.id (UUID) → prefab.{ path }
  //
  // Legacy format: prefab: { id: "<asset-uuid>" }
  // New format:    prefab: { path: "prefabs/<name>.prefab" }
  //
  // Resolution strategy: look up uuid in prefabIdToPath map (built from IDB migration).
  // If not found (orphan ref): strip prefab component with warning.
  if ('prefab' in updated) {
    const prefab = updated['prefab'] as Record<string, unknown>;
    if (typeof prefab['id'] === 'string' && !prefab['path']) {
      const uuid = prefab['id'] as string;
      const path = prefabIdToPath?.[uuid];
      if (path) {
        updated = { ...updated, prefab: { path } };
      } else {
        // Orphan ref: strip with warning (mirrors mesh soft-fail)
        console.warn(
          `[SceneDocument] migrateNodeComponents: prefab.id "${uuid}" has no known path — stripping prefab component`,
        );
        const { prefab: _pf, ...rest } = updated;
        updated = rest;
      }
      mutated = true;
    }
  }

  // Migration 3: mesh.source (legacy) → mesh.{ path, nodePath? }
  //
  // Legacy formats:
  //   mesh: { source: "model.glb" }              — filename only
  //   mesh: { source: "character.glb:Torso" }    — filename + nodePath (colon separator)
  //
  // Assumption: legacy filename lives in models/<filename>.
  // Exception: if source already contains '/', treat as a path-like value and preserve it.
  //
  // No 'url' field is set here — it is populated at hydrate time via
  // projectManager.urlFor(path). If hydrate soft-fails (file not found),
  // mesh.url remains absent and SceneSync skips the mesh silently.
  if ('mesh' in updated) {
    const mesh = updated['mesh'] as Record<string, unknown>;
    if (typeof mesh['source'] === 'string') {
      const source = mesh['source'] as string;
      const colonIdx = source.indexOf(':');
      const filenameRaw = colonIdx === -1 ? source : source.slice(0, colonIdx);
      const nodePath   = colonIdx === -1 ? undefined : source.slice(colonIdx + 1);
      // If filenameRaw already contains '/', treat it as a project-relative path
      const path = filenameRaw.includes('/') ? filenameRaw : `models/${filenameRaw}`;
      const { source: _src, ...meshRest } = mesh;
      updated = {
        ...updated,
        mesh: {
          ...meshRest,
          path,
          ...(nodePath !== undefined ? { nodePath } : {}),
        },
      };
      mutated = true;
    }
  }

  if (!mutated) return node;
  return { ...node, components: updated };
}

// Strip runtime-only fields from components before serialization.
// `mesh.url` and `prefab.url` are session-scoped blob URLs; persisting them would create
// stale references on next reload. URLs are always recomputed via projectManager.urlFor(path)
// at hydrate time.
function stripRuntimeFields(components: Record<string, unknown>): Record<string, unknown> {
  let result = components;

  if ('mesh' in result) {
    const mesh = result['mesh'] as Record<string, unknown>;
    if ('url' in mesh) {
      const { url: _url, ...meshRest } = mesh;
      result = { ...result, mesh: meshRest };
    }
  }

  if ('prefab' in result) {
    const prefab = result['prefab'] as Record<string, unknown>;
    if ('url' in prefab) {
      const { url: _url, ...prefabRest } = prefab;
      result = { ...result, prefab: prefabRest };
    }
  }

  return result;
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
      nodes: Array.from(this._nodes.values()).map(n => ({
        ...n,
        components: stripRuntimeFields(n.components),
      })),
    };
  }

  /**
   * @param data           Parsed SceneFile (may be legacy format — migration runs here).
   * @param prefabIdToPath Optional map from legacy prefab UUID → project-relative path.
   *                       Provided by Editor.loadScene after running the IDB→file migration.
   *                       When present, `prefab.id` refs are resolved to `prefab.{ path }`.
   */
  deserialize(data: SceneFile, prefabIdToPath?: Record<string, string>): void {
    this._nodes.clear();
    for (const rawNode of data.nodes) {
      const node = migrateNodeComponents({ ...rawNode }, prefabIdToPath);
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
