import type { SceneNode, SceneEnv } from './SceneFormat';
import type { MaterialOverride, LightProps } from './SceneFormat';
import { generateUUID } from '../../utils/uuid';
import { asNodeUUID } from '../../utils/branded';
import type { NodeUUID } from '../../utils/branded';
import type { ErythosSceneV1 } from './io/types';
import type { HexColor } from './io/types';
import { v0_to_v1 } from './io/migrations/v0_to_v1';
import {
  checkRawVersion,
  validateScene,
  SceneInvariantError,
} from './io/SceneInvariants';

export { SceneInvariantError, UnsupportedVersionError } from './io/SceneInvariants';

// ── Color conversion ─────────────────────────────────────────────────────────

/** Converts a hex color string "#rrggbb" to a Three.js-compatible number. */
function hexToNumber(hex: HexColor): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** Converts a runtime number color (0xffffff) to a hex string "#rrggbb". */
function numberToHex(n: number): HexColor {
  return '#' + Math.floor(n).toString(16).padStart(6, '0');
}

// ── Runtime conversion ────────────────────────────────────────────────────────

/**
 * Converts a persistence MaterialOverride (HexColor strings) to runtime shape (numbers).
 */
function persistMatToRuntime(mat: ErythosSceneV1['nodes'][number]['mat']): MaterialOverride | undefined {
  if (!mat) return undefined;
  const result: MaterialOverride = {};
  if (mat.color     !== undefined) result.color     = hexToNumber(mat.color);
  if (mat.roughness !== undefined) result.roughness = mat.roughness;
  if (mat.metalness !== undefined) result.metalness = mat.metalness;
  if (mat.emissive  !== undefined) result.emissive  = hexToNumber(mat.emissive);
  if (mat.emissiveIntensity !== undefined) result.emissiveIntensity = mat.emissiveIntensity;
  if (mat.opacity   !== undefined) result.opacity   = mat.opacity;
  if (mat.transparent !== undefined) result.transparent = mat.transparent;
  if (mat.wireframe   !== undefined) result.wireframe   = mat.wireframe;
  return result;
}

/**
 * Converts a runtime MaterialOverride (numbers) to persistence shape (HexColor strings).
 */
function runtimeMatToPersist(mat: MaterialOverride): ErythosSceneV1['nodes'][number]['mat'] {
  const result: NonNullable<ErythosSceneV1['nodes'][number]['mat']> = {};
  if (mat.color     !== undefined) result.color     = numberToHex(mat.color);
  if (mat.roughness !== undefined) result.roughness = mat.roughness;
  if (mat.metalness !== undefined) result.metalness = mat.metalness;
  if (mat.emissive  !== undefined) result.emissive  = numberToHex(mat.emissive);
  if (mat.emissiveIntensity !== undefined) result.emissiveIntensity = mat.emissiveIntensity;
  if (mat.opacity   !== undefined) result.opacity   = mat.opacity;
  if (mat.transparent !== undefined) result.transparent = mat.transparent;
  if (mat.wireframe   !== undefined) result.wireframe   = mat.wireframe;
  return result;
}

/**
 * Converts a persistence LightProps (HexColor) to runtime shape (number).
 */
function persistLightToRuntime(light: NonNullable<ErythosSceneV1['nodes'][number]['light']>): LightProps {
  return {
    type: light.type,
    color: hexToNumber(light.color),
    intensity: light.intensity,
  };
}

/**
 * Converts a runtime LightProps (number) to persistence shape (HexColor).
 */
function runtimeLightToPersist(light: LightProps): NonNullable<ErythosSceneV1['nodes'][number]['light']> {
  return {
    type: light.type,
    color: numberToHex(light.color),
    intensity: light.intensity,
  };
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
  nodeChanged:   [uuid: NodeUUID, changed: Partial<SceneNode>];
  sceneReplaced: [];
  envChanged:    [];
}

// ── Default env ────────────────────────────────────────────────────────────────

export const DEFAULT_SCENE_ENV: SceneEnv = {
  hdri: null,
  intensity: 1.0,
  rotation: 0,
};

// ── SceneDocument ─────────────────────────────────────────────────────────────

export class SceneDocument {
  private _nodes = new Map<NodeUUID, SceneNode>();
  private _env: SceneEnv = { ...DEFAULT_SCENE_ENV };
  readonly events = new MiniEmitter<SceneDocumentEventMap>();

  // ── Env ───────────────────────────────────────────────────────────────────

  get env(): Readonly<SceneEnv> {
    return this._env;
  }

  setEnv(patch: Partial<SceneEnv>): void {
    Object.assign(this._env, patch);
    this.events.emit('envChanged');
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  addNode(node: SceneNode): void {
    this._nodes.set(node.id, node);
    this.events.emit('nodeAdded', node);
  }

  removeNode(uuid: NodeUUID): void {
    const node = this._nodes.get(uuid);
    if (!node) return;
    this._nodes.delete(uuid);
    this.events.emit('nodeRemoved', node);
  }

  updateNode(uuid: NodeUUID, patch: Partial<SceneNode>): void {
    const node = this._nodes.get(uuid);
    if (!node) return;
    Object.assign(node, patch);
    this.events.emit('nodeChanged', uuid, patch);
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  getNode(uuid: NodeUUID): SceneNode | null {
    return this._nodes.get(uuid) ?? null;
  }

  getChildren(parentUuid: NodeUUID): SceneNode[] {
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

  getPath(uuid: NodeUUID): string {
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

  /**
   * Serialize the runtime model to the v1 persistence shape (ErythosSceneV1).
   * Colors are converted from runtime numbers to hex strings.
   */
  serialize(): ErythosSceneV1 {
    return {
      version: 1,
      env: {
        hdri: this._env.hdri,
        intensity: this._env.intensity,
        rotation: this._env.rotation,
      },
      nodes: Array.from(this._nodes.values()).map(n => {
        const persisted: ErythosSceneV1['nodes'][number] = {
          id: n.id,
          name: n.name,
          parent: n.parent,
          order: n.order,
          nodeType: n.nodeType,
          position: [...n.position],
          rotation: [...n.rotation],
          scale:    [...n.scale],
          userData: {},
        };
        if (n.asset !== undefined)  persisted.asset = n.asset;
        if (n.mat   !== undefined)  persisted.mat   = runtimeMatToPersist(n.mat);
        if (n.light !== undefined)  persisted.light = runtimeLightToPersist(n.light);
        if (n.camera !== undefined) persisted.camera = { ...n.camera };
        return persisted;
      }),
    };
  }

  /**
   * Deserialize raw JSON data into the runtime model.
   * Accepts both v0 (components-bag) and v1 (nodeType) shapes -- v0 is migrated first.
   * Colors in the v1 persistence shape (hex strings) are converted to runtime numbers.
   *
   * Validation order:
   *   1. checkRawVersion -- rejects non-integer, <=0, or future version
   *      (throws UnsupportedVersionError or SceneInvariantError for bad version field)
   *   2. v0_to_v1 migration
   *   3. validateScene -- structural invariants (throws SceneInvariantError on violations)
   *
   * @param data  Parsed JSON from a .erythos file (may be any legacy version).
   * @throws {UnsupportedVersionError} if version > CURRENT_VERSION
   * @throws {SceneInvariantError} if the migrated scene violates invariants
   */
  deserialize(data: unknown): void {
    this._nodes.clear();

    // Step 1: version gate (runs on raw JSON before migration)
    checkRawVersion(data);

    // Step 2: Run v0->v1 migration. This handles:
    //   - legacy components-bag shape
    //   - 'leaf' -> 'prefab' rename
    //   - mesh.source -> mesh.path
    //   - prefab.id -> stripped (P4: no resolver map)
    //   - geometry component -> mesh nodeType with assets://primitives/
    //   - inject default env
    const v1: ErythosSceneV1 = v0_to_v1(data);

    // Step 3: structural invariants on migrated v1 scene
    const violations = validateScene(v1);
    if (violations.length > 0) {
      console.error('[SceneDocument] Scene invariant violations:');
      for (const v of violations) {
        console.error(`  [${v.path}] ${v.reason}`);
      }
      throw new SceneInvariantError(violations);
    }

    // Restore env
    this._env = {
      hdri:      v1.env.hdri,
      intensity: v1.env.intensity,
      rotation:  v1.env.rotation,
    };

    // Convert persistence nodes -> runtime nodes
    for (const pn of v1.nodes) {
      const node: SceneNode = {
        id:       asNodeUUID(pn.id),
        name:     pn.name,
        parent:   pn.parent !== null ? asNodeUUID(pn.parent) : null,
        order:    pn.order,
        nodeType: pn.nodeType,
        position: [...pn.position],
        rotation: [...pn.rotation],
        scale:    [...pn.scale],
        userData: {},
      };

      if (pn.asset  !== undefined) node.asset  = pn.asset;
      if (pn.mat    !== undefined) node.mat    = persistMatToRuntime(pn.mat);
      if (pn.light  !== undefined) node.light  = persistLightToRuntime(pn.light);
      if (pn.camera !== undefined) node.camera = { ...pn.camera };

      this._nodes.set(node.id, node);
    }

    this.events.emit('sceneReplaced');
  }

  // ── Utils ─────────────────────────────────────────────────────────────────

  createNode(name: string, parent?: NodeUUID): SceneNode {
    return {
      id:       asNodeUUID(generateUUID()),
      name,
      parent:   parent ?? null,
      order:    0,
      nodeType: 'group',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale:    [1, 1, 1],
      userData: {},
    };
  }

  hasNode(uuid: NodeUUID): boolean {
    return this._nodes.has(uuid);
  }

  clearScene(): void {
    this._nodes.clear();
    this._env = { ...DEFAULT_SCENE_ENV };
    this.events.emit('sceneReplaced');
  }
}
