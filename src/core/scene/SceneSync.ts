import {
  Scene, Object3D, Mesh, MeshStandardMaterial,
  BoxGeometry, SphereGeometry, PlaneGeometry, CylinderGeometry,
  DirectionalLight, AmbientLight, PerspectiveCamera,
} from 'three';
import type {
  SceneNode, MeshComponent,
  GeometryComponent, MaterialComponent, LightComponent, CameraComponent,
} from './SceneFormat';
import type { SceneDocument } from './SceneDocument';
import type { ResourceCache } from './ResourceCache';
import type { PrefabRegistry } from './PrefabRegistry';
import type { PrefabAsset } from './PrefabFormat';
import { deserializeFromPrefab } from './PrefabSerializer';
import type { PrefabInstanceWatcher } from './PrefabInstanceWatcher';

function createGeometry(type: GeometryComponent['type']) {
  switch (type) {
    case 'box':      return new BoxGeometry();
    case 'sphere':   return new SphereGeometry();
    case 'plane':    return new PlaneGeometry();
    case 'cylinder': return new CylinderGeometry();
  }
}

/**
 * SceneSync — one-way sync from SceneDocument to Three.js Scene.
 *
 * Listens to SceneDocument events and mirrors the flat node list
 * into a Three.js parent-child hierarchy.
 */
export class SceneSync {
  private readonly document: SceneDocument;
  private readonly threeScene: Scene;
  private readonly resourceCache: ResourceCache | null;

  private readonly uuidToObj = new Map<string, Object3D>();
  private readonly objToUuid = new Map<Object3D, string>();

  // Orphan tracking: child UUID → set of Object3D waiting for this parent
  private readonly pendingChildren = new Map<string, Set<Object3D>>();

  /** Bound prefabChanged handler for off() symmetry */
  private _onPrefabChanged: ((url: string, asset: PrefabAsset, path: string) => void) | null = null;
  /** Reference to PrefabInstanceWatcher for self-write skip check (optional) */
  private _instanceWatcher: PrefabInstanceWatcher | null = null;

  /** Reference to attached PrefabRegistry (for dispose) */
  private _prefabRegistry: PrefabRegistry | null = null;

  constructor(document: SceneDocument, threeScene: Scene, resourceCache?: ResourceCache) {
    this.document = document;
    this.threeScene = threeScene;
    this.resourceCache = resourceCache ?? null;

    // Bind named handlers so off() can match them
    this.onNodeAdded = this.onNodeAdded.bind(this);
    this.onNodeRemoved = this.onNodeRemoved.bind(this);
    this.onNodeChanged = this.onNodeChanged.bind(this);
    this.onSceneReplaced = this.onSceneReplaced.bind(this);

    document.events.on('nodeAdded', this.onNodeAdded);
    document.events.on('nodeRemoved', this.onNodeRemoved);
    document.events.on('nodeChanged', this.onNodeChanged);
    document.events.on('sceneReplaced', this.onSceneReplaced);
  }

  // ── Query API ──────────────────────────────────────────────────────────────

  getObject3D(uuid: string): Object3D | null {
    return this.uuidToObj.get(uuid) ?? null;
  }

  getUUID(object3d: Object3D): string | null {
    return this.objToUuid.get(object3d) ?? null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  rebuild(): void {
    // Clear all children from scene
    while (this.threeScene.children.length > 0) {
      this.threeScene.remove(this.threeScene.children[0]);
    }
    this.uuidToObj.clear();
    this.objToUuid.clear();
    this.pendingChildren.clear();

    // Re-add all nodes — order is not guaranteed, so onNodeAdded
    // handles orphan resolution automatically
    for (const node of this.document.getAllNodes()) {
      this.onNodeAdded(node);
    }
  }

  dispose(): void {
    this.document.events.off('nodeAdded', this.onNodeAdded);
    this.document.events.off('nodeRemoved', this.onNodeRemoved);
    this.document.events.off('nodeChanged', this.onNodeChanged);
    this.document.events.off('sceneReplaced', this.onSceneReplaced);

    // Unsubscribe from prefab live-sync if attached
    if (this._prefabRegistry && this._onPrefabChanged) {
      this._prefabRegistry.off('prefabChanged', this._onPrefabChanged);
      this._onPrefabChanged = null;
      this._prefabRegistry = null;
    }

    this.uuidToObj.clear();
    this.objToUuid.clear();
    this.pendingChildren.clear();
  }

  // ── PrefabRegistry live-sync ───────────────────────────────────────────────

  /**
   * Opt-in subscription to PrefabRegistry's `prefabChanged` event.
   *
   * Called once from `Editor.init` on the main SceneSync only. Sandbox
   * SceneSyncs (Workshop) deliberately do NOT call this — they must not
   * auto-rebuild when the file the user is actively editing is saved.
   *
   * ARCHITECTURAL EXCEPTION: The rebuild below mutates SceneDocument OUTSIDE
   * the Command/undo pipeline. This is intentional for P3 live-sync:
   * - Prefab edits are file-level operations (Workshop commit writes a .prefab file).
   * - Main editor undo/redo does not cover prefab file-level changes.
   * - Reversing a prefab edit is done via Workshop reopen + further edits,
   *   or filesystem-level revert.
   * See docs/prefab-workshop.md §"Open Questions" and §"Event Flow & Live Sync".
   *
   * @param registry - The app's PrefabRegistry instance.
   */
  attachPrefabRegistry(registry: PrefabRegistry): void {
    // Detach any prior subscription (idempotent guard)
    if (this._prefabRegistry && this._onPrefabChanged) {
      this._prefabRegistry.off('prefabChanged', this._onPrefabChanged);
    }

    this._prefabRegistry = registry;
    this._onPrefabChanged = (url, asset, path) => {
      this._rebuildPrefabInstances(url, asset, path);
    };
    registry.on('prefabChanged', this._onPrefabChanged);
  }

  /**
   * Attach a PrefabInstanceWatcher so SceneSync can query the self-write registry
   * before rebuilding individual instances.
   *
   * Call once from Editor.init after creating the watcher.
   * Pass null to detach (called automatically by Editor.dispose order).
   *
   * @param watcher - The PrefabInstanceWatcher instance, or null to detach.
   */
  attachInstanceWatcher(watcher: PrefabInstanceWatcher | null): void {
    this._instanceWatcher = watcher;
  }

  /**
   * Rebuild all scene-graph instance subtrees whose `components.prefab.path`
   * matches the given path (stable across URL rotation).
   *
   * ARCHITECTURAL EXCEPTION: direct SceneDocument mutation outside Command.
   * See attachPrefabRegistry() for rationale.
   */
  private _rebuildPrefabInstances(newURL: string, newAsset: PrefabAsset, path: string): void {
    const instances = this.document.getAllNodes().filter((n) => {
      const prefab = n.components['prefab'] as { path?: string } | undefined;
      return prefab?.path === path;
    });

    for (const instanceRoot of instances) {
      // Self-write skip: if the PrefabInstanceWatcher wrote this path and this
      // instance was the originator, skip the rebuild to avoid overwriting the
      // user's in-progress edit with its own round-trip echo.
      if (this._instanceWatcher?.hasRecentSelfWrite(path, instanceRoot.id)) {
        continue;
      }

      // Step 1: Remove existing children (recursive) from SceneDocument
      this._removeDescendants(instanceRoot.id);

      // Step 2: Update the instance root's prefab.url to the new URL
      // (path remains stable; url must track the new blob URL)
      const currentPrefab = instanceRoot.components['prefab'] as Record<string, unknown>;
      this.document.updateNode(instanceRoot.id, {
        components: {
          ...instanceRoot.components,
          prefab: { ...currentPrefab, url: newURL },
        },
      });

      // Step 3: Deserialize new prefab content as children of this instance root
      const childNodes = deserializeFromPrefab(newAsset, instanceRoot.id);
      for (const node of childNodes) {
        this.document.addNode(node);
      }
    }
  }

  /**
   * Recursively remove all descendants of the given node from SceneDocument.
   * Children are removed depth-first (leaf → root order) to avoid dangling refs.
   */
  private _removeDescendants(parentId: string): void {
    const children = this.document.getChildren(parentId);
    for (const child of children) {
      this._removeDescendants(child.id);
      this.document.removeNode(child.id);
    }
  }

  // ── Event handlers (private) ───────────────────────────────────────────────

  private onNodeAdded(node: SceneNode): void {
    const obj = new Object3D();
    obj.name = node.name;
    this.applyTransform(obj, node);

    // Attach visual child based on component type (order: geometry > light > camera > mesh)
    if (node.components.geometry && node.components.material) {
      const geoComp = node.components.geometry as GeometryComponent;
      const matComp = node.components.material as MaterialComponent;
      obj.add(new Mesh(createGeometry(geoComp.type), new MeshStandardMaterial({ color: matComp.color })));
    } else if (node.components.light) {
      const lightComp = node.components.light as LightComponent;
      const light = lightComp.type === 'directional'
        ? new DirectionalLight(lightComp.color, lightComp.intensity)
        : new AmbientLight(lightComp.color, lightComp.intensity);
      // User lights 放 layer 1，讓各 viewport camera 透過 layer mask 控制可見性
      // set(1) 覆蓋（清 layer 0、設 layer 1），刻意讓 camera 預設看不到（camera 預設 layer 0）
      light.layers.set(1);
      obj.add(light);
    } else if (node.components.camera) {
      const camComp = node.components.camera as CameraComponent;
      obj.add(new PerspectiveCamera(camComp.fov, 1, camComp.near, camComp.far));
    } else if (this.resourceCache && node.components.mesh) {
      const meshComp = node.components.mesh as MeshComponent;
      // url is populated at hydrate time via projectManager.urlFor(path).
      // If url is absent (file not found during hydrate), skip silently — soft-fail.
      if (meshComp.url && this.resourceCache.has(meshComp.url)) {
        const meshObj = this.resourceCache.cloneSubtree(meshComp.url, meshComp.nodePath);
        if (meshObj) {
          // Reset clone root transform: applyTransform(obj, node) already applied
          // position/rotation/scale from SceneNode. The clone carries the same
          // values baked into the gltf subtree root — adding meshObj directly
          // would cause double-application (e.g. scale² for artist meter-to-unit root).
          // This reset applies to ALL mesh nodes, not just root clones:
          // gltfConverter always sets nodePath (path:nodePath), so
          // every clone root's local transform is redundant with applyTransform.
          meshObj.position.set(0, 0, 0);
          meshObj.quaternion.identity();
          meshObj.scale.set(1, 1, 1);
          obj.add(meshObj);
        }
      }
    }

    // Register in maps
    this.uuidToObj.set(node.id, obj);
    this.objToUuid.set(obj, node.id);

    // Attach to parent (or scene root if parent unknown/null)
    if (node.parent !== null) {
      const parentObj = this.uuidToObj.get(node.parent);
      if (parentObj) {
        parentObj.add(obj);
      } else {
        // Orphan: parent not yet created — park at scene root and register as pending
        this.threeScene.add(obj);
        let set = this.pendingChildren.get(node.parent);
        if (!set) {
          set = new Set();
          this.pendingChildren.set(node.parent, set);
        }
        set.add(obj);
      }
    } else {
      this.threeScene.add(obj);
    }

    // Check if any orphans were waiting for THIS node as parent
    const waiting = this.pendingChildren.get(node.id);
    if (waiting) {
      for (const child of waiting) {
        // Remove from current parent (scene root) and attach to this node
        child.removeFromParent();
        obj.add(child);
      }
      this.pendingChildren.delete(node.id);
    }
  }

  private onNodeRemoved(node: SceneNode): void {
    const obj = this.uuidToObj.get(node.id);
    if (!obj) return;

    obj.removeFromParent();
    this.uuidToObj.delete(node.id);
    this.objToUuid.delete(obj);
  }

  private onNodeChanged(uuid: string, changed: Partial<SceneNode>): void {
    const obj = this.uuidToObj.get(uuid);
    if (!obj) return;

    if (changed.name !== undefined) {
      obj.name = changed.name;
    }

    if (changed.position !== undefined) {
      obj.position.set(...changed.position);
    }

    if (changed.rotation !== undefined) {
      obj.rotation.set(...changed.rotation);
    }

    if (changed.scale !== undefined) {
      obj.scale.set(...changed.scale);
    }

    // Parent change → re-attach
    if ('parent' in changed) {
      obj.removeFromParent();
      if (changed.parent !== null && changed.parent !== undefined) {
        const newParent = this.uuidToObj.get(changed.parent);
        if (newParent) {
          newParent.add(obj);
        } else {
          this.threeScene.add(obj);
        }
      } else {
        this.threeScene.add(obj);
      }
    }
  }

  private onSceneReplaced(): void {
    this.rebuild();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private applyTransform(obj: Object3D, node: SceneNode): void {
    obj.position.set(...node.position);
    obj.rotation.set(...node.rotation);
    obj.scale.set(...node.scale);
  }
}
