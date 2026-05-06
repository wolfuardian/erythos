import {
  Scene, Object3D, Mesh, MeshStandardMaterial, Color,
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
import type { Selection } from '../Selection';
import type { AssetPath, NodeUUID } from '../../utils/branded';

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

  private readonly uuidToObj = new Map<NodeUUID, Object3D>();
  private readonly objToUuid = new Map<Object3D, NodeUUID>();

  // Orphan tracking: child UUID → set of Object3D waiting for this parent
  private readonly pendingChildren = new Map<NodeUUID, Set<Object3D>>();

  /** Bound prefabChanged handler for off() symmetry */
  private _onPrefabChanged: ((url: string, asset: PrefabAsset, path: AssetPath) => void) | null = null;
  /** Reference to PrefabInstanceWatcher for self-write skip check (optional) */
  private _instanceWatcher: PrefabInstanceWatcher | null = null;
  /** Reference to Selection for snapshot/restore during rebuild (optional) */
  private _selection: Selection | null = null;

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

  getObject3D(uuid: NodeUUID): Object3D | null {
    return this.uuidToObj.get(uuid) ?? null;
  }

  getUUID(object3d: Object3D): NodeUUID | null {
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
   * Attach a Selection instance so SceneSync can snapshot/restore selection
   * state across prefab live-sync rebuilds.
   *
   * Call once from Editor.init after creating the selection.
   * Pass null to detach.
   */
  attachSelection(selection: Selection | null): void {
    this._selection = selection;
  }

  /**
   * Rebuild all scene-graph instance subtrees whose `components.prefab.path`
   * matches the given path (stable across URL rotation).
   *
   * ARCHITECTURAL EXCEPTION: direct SceneDocument mutation outside Command.
   * See attachPrefabRegistry() for rationale.
   */
  private _rebuildPrefabInstances(newURL: string, newAsset: PrefabAsset, path: AssetPath): void {
    const instances = this.document.getAllNodes().filter((n) => {
      const prefab = n.components['prefab'] as { path?: AssetPath } | undefined;
      return prefab?.path === path;
    });

    for (const instanceRoot of instances) {
      // Self-write skip: if the PrefabInstanceWatcher wrote this path and this
      // instance was the originator, skip the rebuild to avoid overwriting the
      // user's in-progress edit with its own round-trip echo.
      if (this._instanceWatcher?.hasRecentSelfWrite(path, instanceRoot.id)) {
        continue;
      }

      // ── Selection snapshot (before rebuild) ──────────────────────────────
      // Capture which selected UUIDs belong strictly to this instance's subtree,
      // so we can restore them after the rebuild assigns fresh UUIDs.
      const selectionSnapshot = this._selection
        ? this._snapshotSubtreeSelection(instanceRoot.id)
        : null;

      // Hover snapshot: is the hovered node inside this subtree?
      const hoveredInSubtree =
        this._selection?.hovered !== null && this._selection?.hovered !== undefined
          ? this._isDescendantOf(this._selection.hovered, instanceRoot.id)
          : false;
      const hoveredPathSnapshot = hoveredInSubtree && this._selection!.hovered
        ? this._computeRelativePath(this._selection!.hovered, instanceRoot.id)
        : null;

      // Wrap each instance's rebuild in suppress() so the nodeAdded/nodeRemoved
      // events fired during _removeDescendants + addNode do NOT arm a new debounce
      // in PrefabInstanceWatcher. This is the primary guard against rebuild-echo;
      // the 50ms self-write window is a secondary fallback.
      const doRebuild = () => {
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

        // Step 3: Deserialize new prefab content. The asset's first node is the
        // prefab root, which corresponds to the existing instance root — we keep
        // instanceRoot intact (per-instance transform/name/parent per design)
        // and graft only the prefab root's descendants under it. Without this
        // skip, every save would nest a fresh prefab-root layer below the
        // instance root, deepening by one level per write cycle.
        const deserialized = deserializeFromPrefab(newAsset, null);
        const prefabRoot = deserialized[0];
        for (const node of deserialized.slice(1)) {
          if (node.parent === prefabRoot.id) {
            node.parent = instanceRoot.id;
          }
          this.document.addNode(node);
        }
      };

      if (this._instanceWatcher) {
        this._instanceWatcher.suppress(doRebuild);
      } else {
        doRebuild();
      }

      // ── Selection restore (after rebuild) ───────────────────────────────
      if (this._selection && selectionSnapshot) {
        this._restoreSubtreeSelection(instanceRoot.id, selectionSnapshot);
      }

      // Hover restore
      if (this._selection && hoveredPathSnapshot) {
        const newHoveredNode = this._walkRelativePath(instanceRoot.id, hoveredPathSnapshot);
        this._selection.hover(newHoveredNode ?? null);
      } else if (this._selection && hoveredInSubtree) {
        // Was hovering a node that no longer exists → clear hover
        this._selection.hover(null);
      }
    }
  }

  /**
   * Recursively remove all descendants of the given node from SceneDocument.
   * Children are removed depth-first (leaf → root order) to avoid dangling refs.
   */
  private _removeDescendants(parentId: NodeUUID): void {
    const children = this.document.getChildren(parentId);
    for (const child of children) {
      this._removeDescendants(child.id);
      this.document.removeNode(child.id);
    }
  }

  // ── Selection snapshot/restore helpers ──────────────────────────────────────

  /**
   * Returns true if `uuid` is a strict descendant of `ancestorId`
   * (i.e. instanceRoot itself is NOT considered a descendant of itself).
   */
  private _isDescendantOf(uuid: NodeUUID, ancestorId: NodeUUID): boolean {
    let node = this.document.getNode(uuid);
    while (node?.parent !== null) {
      if (node!.parent === ancestorId) return true;
      node = this.document.getNode(node!.parent!);
    }
    return false;
  }

  /**
   * A path step: { name, order } uniquely identifies a child among siblings
   * when duplicate names exist (using sibling order as tiebreaker).
   */
  private _computeRelativePath(
    uuid: NodeUUID,
    instanceRootId: NodeUUID,
  ): Array<{ name: string; order: number }> {
    const steps: Array<{ name: string; order: number }> = [];
    let node = this.document.getNode(uuid);
    while (node && node.id !== instanceRootId) {
      steps.unshift({ name: node.name, order: node.order });
      if (!node.parent) break;
      node = this.document.getNode(node.parent);
    }
    return steps;
  }

  /**
   * Walk the subtree rooted at `instanceRootId` following the relative path
   * (name + sibling-order match at each level). Returns the matched node's
   * UUID, or null if any step fails to find a match.
   */
  private _walkRelativePath(
    instanceRootId: NodeUUID,
    path: Array<{ name: string; order: number }>,
  ): NodeUUID | null {
    let currentParentId: NodeUUID = instanceRootId;
    for (const step of path) {
      const children = this.document.getChildren(currentParentId); // sorted by order
      // Find a child matching both name and order
      const match = children.find(c => c.name === step.name && c.order === step.order);
      if (!match) return null;
      currentParentId = match.id;
    }
    return currentParentId === instanceRootId && path.length > 0 ? null : currentParentId;
  }

  /**
   * Snapshot which currently-selected UUIDs are strict descendants of
   * `instanceRootId`, storing their relative path for later restore.
   *
   * Returns a Map<oldUUID, relativePath>.
   */
  private _snapshotSubtreeSelection(
    instanceRootId: NodeUUID,
  ): Map<NodeUUID, Array<{ name: string; order: number }>> {
    const snapshot = new Map<NodeUUID, Array<{ name: string; order: number }>>();
    if (!this._selection) return snapshot;
    for (const uuid of this._selection.all) {
      if (this._isDescendantOf(uuid, instanceRootId)) {
        snapshot.set(uuid, this._computeRelativePath(uuid, instanceRootId));
      }
    }
    return snapshot;
  }

  /**
   * After a rebuild, resolve each snapshotted path to its new UUID and
   * call `Selection.replaceMany` to swap old → new (dropping deleted ones).
   */
  private _restoreSubtreeSelection(
    instanceRootId: NodeUUID,
    snapshot: Map<NodeUUID, Array<{ name: string; order: number }>>,
  ): void {
    if (!this._selection || snapshot.size === 0) return;

    const replacements = new Map<NodeUUID, NodeUUID>();
    const removals = new Set<NodeUUID>();

    for (const [oldUUID, path] of snapshot) {
      const newUUID = this._walkRelativePath(instanceRootId, path);
      if (newUUID !== null) {
        replacements.set(oldUUID, newUUID);
      } else {
        removals.add(oldUUID);
      }
    }

    this._selection.replaceMany(replacements, removals);
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
      obj.add(new Mesh(createGeometry(geoComp.type), new MeshStandardMaterial({
        color:       matComp.color,
        roughness:   matComp.roughness   ?? 1,
        metalness:   matComp.metalness   ?? 0,
        emissive:    new Color(matComp.emissive ?? 0x000000),
        opacity:     matComp.opacity     ?? 1,
        transparent: matComp.transparent ?? false,
        wireframe:   matComp.wireframe   ?? false,
      })));
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

  private onNodeChanged(uuid: NodeUUID, changed: Partial<SceneNode>): void {
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

    // Handle material component changes
    const matComp = (changed as { components?: { material?: unknown } }).components?.material;
    if (matComp !== undefined) {
      const meshChild = obj.children.find((c): c is Mesh => c instanceof Mesh);
      if (meshChild && meshChild.material instanceof MeshStandardMaterial) {
        const mat = meshChild.material;
        const m = matComp as MaterialComponent;
        if (m.color     !== undefined) mat.color.setHex(m.color);
        if (m.emissive  !== undefined) mat.emissive.setHex(m.emissive);
        if (m.roughness !== undefined) mat.roughness  = m.roughness;
        if (m.metalness !== undefined) mat.metalness  = m.metalness;
        if (m.opacity   !== undefined) mat.opacity    = m.opacity;
        if (m.wireframe !== undefined) mat.wireframe  = m.wireframe;
        if (m.transparent !== undefined && mat.transparent !== m.transparent) {
          mat.transparent = m.transparent;
          mat.needsUpdate = true;
        }
      }
    }

    // Handle light component changes
    const lightComp = (changed as { components?: { light?: unknown } }).components?.light;
    if (lightComp !== undefined) {
      const lightChild = obj.children.find(
        (c): c is DirectionalLight | AmbientLight => c instanceof DirectionalLight || c instanceof AmbientLight,
      );
      if (lightChild) {
        const l = lightComp as LightComponent;
        if (l.intensity !== undefined) lightChild.intensity = l.intensity;
        if (l.color     !== undefined) lightChild.color.setHex(l.color);
      }
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
