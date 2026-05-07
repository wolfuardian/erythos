import {
  Scene, Object3D, Mesh, MeshStandardMaterial, Color,
  BoxGeometry, SphereGeometry, PlaneGeometry, CylinderGeometry,
  DirectionalLight, AmbientLight, PointLight, SpotLight,
  PerspectiveCamera, BufferGeometry,
} from 'three';
import type { SceneNode, LightProps, MaterialOverride, CameraProps } from './SceneFormat';
import type { SceneDocument } from './SceneDocument';
import type { ResourceCache } from './ResourceCache';
import type { PrefabRegistry } from './PrefabRegistry';
import type { PrefabAsset } from './PrefabFormat';
import type { AssetPath, NodeUUID } from '../../utils/branded';

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Parse a primitive geometry type from an assets://primitives/ URL.
 * Returns the geometry type string or null if not a primitives URL.
 */
function parsePrimitiveType(assetUrl: string): string | null {
  const prefix = 'assets://primitives/';
  if (!assetUrl.startsWith(prefix)) return null;
  return assetUrl.slice(prefix.length);
}

function createPrimitiveGeometry(type: string): BufferGeometry | null {
  switch (type) {
    case 'box':      return new BoxGeometry();
    case 'sphere':   return new SphereGeometry();
    case 'plane':    return new PlaneGeometry();
    case 'cylinder': return new CylinderGeometry();
    default:         return null;
  }
}

/**
 * Build a MeshStandardMaterial from a runtime MaterialOverride.
 * Colors are already numbers (runtime shape).
 */
function buildMaterial(mat?: MaterialOverride): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color:        mat?.color       ?? 0xcccccc,
    roughness:    mat?.roughness   ?? 1,
    metalness:    mat?.metalness   ?? 0,
    emissive:     new Color(mat?.emissive ?? 0x000000),
    opacity:      mat?.opacity     ?? 1,
    transparent:  mat?.transparent ?? false,
    wireframe:    mat?.wireframe   ?? false,
  });
}

/**
 * Create a Three.js light from runtime LightProps.
 */
function buildLight(light: LightProps): DirectionalLight | AmbientLight | PointLight | SpotLight {
  const color = light.color;
  const intensity = light.intensity;
  switch (light.type) {
    case 'directional': return new DirectionalLight(color, intensity);
    case 'ambient':     return new AmbientLight(color, intensity);
    case 'point':       return new PointLight(color, intensity);
    case 'spot':        return new SpotLight(color, intensity);
  }
}

/**
 * SceneSync — one-way sync from SceneDocument to Three.js Scene.
 *
 * Listens to SceneDocument events and mirrors the flat node list
 * into a Three.js parent-child hierarchy.
 *
 * v1 behavior:
 *   - Dispatches hydration based on SceneNode.nodeType (not components bag)
 *   - Prefab nodes: runtime-only expansion into Three.js Object3D subtrees.
 *     Prefab children are NOT added to SceneDocument — only to the Three.js scene.
 *   - mesh with assets://primitives/ → inline geometry
 *   - mesh with assets://* or blob:// → ResourceCache lookup
 */
export class SceneSync {
  private readonly document: SceneDocument;
  private readonly threeScene: Scene;
  private readonly resourceCache: ResourceCache | null;

  private readonly uuidToObj = new Map<NodeUUID, Object3D>();
  private readonly objToUuid = new Map<Object3D, NodeUUID>();

  // Orphan tracking: child UUID → set of Object3D waiting for this parent
  private readonly pendingChildren = new Map<NodeUUID, Set<Object3D>>();

  /** Bound event handlers for symmetrical on/off */
  private readonly _onNodeAdded:   (node: SceneNode) => void;
  private readonly _onNodeRemoved: (node: SceneNode) => void;
  private readonly _onNodeChanged: (uuid: NodeUUID, changed: Partial<SceneNode>) => void;
  private readonly _onSceneReplaced: () => void;

  /** PrefabRegistry for prefab hydration */
  private _prefabRegistry: PrefabRegistry | null = null;

  /**
   * Runtime-only map: persistent asset URL (assets://...) → resolved blob URL.
   * Populated by Editor.loadScene after asset resolution.
   * SceneSync uses this to find the loaded blob URL without node.asset being mutated.
   */
  private readonly _resolvedBlobUrls = new Map<string, string>();

  /**
   * Runtime-only set of node UUIDs whose asset reference failed to resolve.
   * Populated by hydratePrefab (registry lookup fails / cycle guard) and
   * by Editor.loadScene via markBrokenRef() for mesh nodes.
   * Cleared on scene reload via clearBrokenRefs() / onSceneReplaced().
   */
  private readonly _brokenRefIds = new Set<NodeUUID>();

  constructor(document: SceneDocument, threeScene: Scene, resourceCache?: ResourceCache) {
    this.document = document;
    this.threeScene = threeScene;
    this.resourceCache = resourceCache ?? null;

    this._onNodeAdded    = this.onNodeAdded.bind(this);
    this._onNodeRemoved  = this.onNodeRemoved.bind(this);
    this._onNodeChanged  = this.onNodeChanged.bind(this);
    this._onSceneReplaced = this.onSceneReplaced.bind(this);

    document.events.on('nodeAdded',    this._onNodeAdded);
    document.events.on('nodeRemoved',  this._onNodeRemoved);
    document.events.on('nodeChanged',  this._onNodeChanged);
    document.events.on('sceneReplaced', this._onSceneReplaced);
  }

  // ── Query API ──────────────────────────────────────────────────────────────

  getObject3D(uuid: NodeUUID): Object3D | null {
    return this.uuidToObj.get(uuid) ?? null;
  }

  getUUID(object3d: Object3D): NodeUUID | null {
    return this.objToUuid.get(object3d) ?? null;
  }


  /**
   * Returns the current set of broken node UUIDs (live view, not cached).
   */
  getBrokenRefIds(): ReadonlySet<NodeUUID> {
    return this._brokenRefIds;
  }

  /**
   * Mark a node UUID as having a broken asset reference.
   * Called by Editor.loadScene for mesh/prefab nodes that fail resolution.
   */
  markBrokenRef(nodeId: NodeUUID): void {
    this._brokenRefIds.add(nodeId);
  }

  /**
   * Clear all broken-ref state. Call at start of each scene load.
   */
  clearBrokenRefs(): void {
    this._brokenRefIds.clear();
  }
  // ── Optional attachments ──────────────────────────────────────────────────

  /**
   * Attach a PrefabRegistry for prefab node hydration.
   * Without this, prefab nodes render as empty Object3Ds.
   */
  attachPrefabRegistry(registry: PrefabRegistry): void {
    this._prefabRegistry = registry;
  }

  /**
   * Register a resolved blob URL for a persistent asset URL.
   * Called by Editor.loadScene after AssetResolver resolves assets:// to blob URL.
   * SceneSync uses this mapping in hydrateMesh — node.asset stays as assets:// (persistent).
   */
  setResolvedBlobUrl(assetUrl: string, blobUrl: string): void {
    this._resolvedBlobUrls.set(assetUrl, blobUrl);
  }

  /**
   * Clear all resolved blob URL mappings.
   * Called by Editor.loadScene at the start of each load to prevent stale entries.
   */
  clearResolvedBlobUrls(): void {
    this._resolvedBlobUrls.clear();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  rebuild(): void {
    while (this.threeScene.children.length > 0) {
      this.threeScene.remove(this.threeScene.children[0]);
    }
    this.uuidToObj.clear();
    this.objToUuid.clear();
    this.pendingChildren.clear();

    for (const node of this.document.getAllNodes()) {
      this.onNodeAdded(node);
    }
  }

  dispose(): void {
    this.document.events.off('nodeAdded',    this._onNodeAdded);
    this.document.events.off('nodeRemoved',  this._onNodeRemoved);
    this.document.events.off('nodeChanged',  this._onNodeChanged);
    this.document.events.off('sceneReplaced', this._onSceneReplaced);

    this.uuidToObj.clear();
    this.objToUuid.clear();
    this.pendingChildren.clear();
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private onNodeAdded(node: SceneNode): void {
    const obj = new Object3D();
    obj.name = node.name;
    this.applyTransform(obj, node);

    // Dispatch hydration based on nodeType
    switch (node.nodeType) {
      case 'mesh': {
        this.hydrateMesh(obj, node);
        break;
      }

      case 'prefab': {
        // Prefab nodes are pure references — subtree is hydrated from PrefabRegistry
        // into Three.js Object3D children only. No SceneDocument writes.
        this.hydratePrefab(obj, node, new Set<string>());
        break;
      }

      case 'light': {
        if (node.light) {
          const lightObj = buildLight(node.light);
          // User lights on layer 1 — viewport camera layer mask controls visibility.
          lightObj.layers.set(1);
          obj.add(lightObj);
        }
        break;
      }

      case 'camera': {
        if (node.camera) {
          const props = node.camera as CameraProps;
          obj.add(new PerspectiveCamera(props.fov, 1, props.near, props.far));
        }
        break;
      }

      case 'group':
        // Empty Object3D — nothing to add
        break;
    }

    // Register in maps
    this.uuidToObj.set(node.id, obj);
    this.objToUuid.set(obj, node.id);

    // Attach to parent (or scene root if parent unknown/null)
    this.attachToParent(obj, node.parent);

    // Check if any orphans were waiting for THIS node as parent
    const waiting = this.pendingChildren.get(node.id);
    if (waiting) {
      for (const child of waiting) {
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
    this._brokenRefIds.delete(node.id);
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

    // Handle material override changes (v1: mat field, number colors)
    if (changed.mat !== undefined) {
      const meshChild = obj.children.find((c): c is Mesh => c instanceof Mesh);
      if (meshChild && meshChild.material instanceof MeshStandardMaterial) {
        const stdMat = meshChild.material;
        const m = changed.mat;
        if (m === undefined) return;
        if (m.color      !== undefined) stdMat.color.setHex(m.color);
        if (m.emissive   !== undefined) stdMat.emissive.setHex(m.emissive);
        if (m.roughness  !== undefined) stdMat.roughness  = m.roughness;
        if (m.metalness  !== undefined) stdMat.metalness  = m.metalness;
        if (m.opacity    !== undefined) stdMat.opacity    = m.opacity;
        if (m.wireframe  !== undefined) stdMat.wireframe  = m.wireframe;
        if (m.transparent !== undefined && stdMat.transparent !== m.transparent) {
          stdMat.transparent = m.transparent;
          stdMat.needsUpdate = true;
        }
      }
    }

    // Handle light prop changes (v1: light field, number colors)
    if (changed.light !== undefined && changed.light !== null) {
      const lightChild = obj.children.find(
        (c): c is DirectionalLight | AmbientLight | PointLight | SpotLight =>
          c instanceof DirectionalLight || c instanceof AmbientLight ||
          c instanceof PointLight || c instanceof SpotLight,
      );
      if (lightChild) {
        const l = changed.light;
        if (l.intensity !== undefined) lightChild.intensity = l.intensity;
        if (l.color     !== undefined) lightChild.color.setHex(l.color);
      }
    }

    // Parent change → re-attach
    if ('parent' in changed) {
      obj.removeFromParent();
      this.attachToParent(obj, changed.parent ?? null);
    }
  }

  private onSceneReplaced(): void {
    this._brokenRefIds.clear();
    this.rebuild();
  }

  // ── Hydration helpers ─────────────────────────────────────────────────────

  private hydrateMesh(obj: Object3D, node: SceneNode): void {
    if (!node.asset) return;

    // Check for primitive geometry URL: assets://primitives/<type>
    const primitiveType = parsePrimitiveType(node.asset);
    if (primitiveType !== null) {
      const geo = createPrimitiveGeometry(primitiveType);
      if (geo) {
        obj.add(new Mesh(geo, buildMaterial(node.mat)));
      }
      return;
    }

    // Regular mesh: look up in ResourceCache by the resolved blob URL.
    // The blob URL is resolved by Editor.loadScene via AssetResolver and registered
    // via setResolvedBlobUrl(). node.asset stays as the persistent assets:// URL.
    // If the asset isn't in ResourceCache yet, we skip silently (soft-fail).
    const blobUrl = this._resolvedBlobUrls.get(node.asset) ?? node.asset;
    if (this.resourceCache && this.resourceCache.has(blobUrl)) {
      const meshObj = this.resourceCache.cloneSubtree(blobUrl, undefined);
      if (meshObj) {
        // Reset clone root transform — applyTransform already applied SceneNode
        // position/rotation/scale. The clone carries gltf baked-in transforms.
        meshObj.position.set(0, 0, 0);
        meshObj.quaternion.identity();
        meshObj.scale.set(1, 1, 1);
        obj.add(meshObj);
      }
    }
  }

  private hydratePrefab(obj: Object3D, node: SceneNode, visiting: Set<string>): void {
    // Prefab hydration: purely runtime Three.js expansion.
    // The prefab asset URL is in node.asset ("prefabs://tree-pine").
    // SceneSync expands the prefab into Three.js Object3D children of obj
    // WITHOUT adding any nodes to SceneDocument.
    if (!node.asset || !this._prefabRegistry) return;

    // Cycle guard: if already expanding this URL in the current call stack,
    // stop to prevent infinite recursion on broken-on-disk cyclic prefab files.
    if (visiting.has(node.asset)) {
      this._brokenRefIds.add(node.id);
      return;
    }

    // Look up the prefab asset by its project-relative path.
    // AssetResolver convention: "prefabs://tree-pine" -> "prefabs/tree-pine.prefab"
    const prefabName = node.asset.replace('prefabs://', '');
    const path = `prefabs/${prefabName}.prefab` as AssetPath;
    const url = this._prefabRegistry.getURLForPath(path);
    if (!url) {
      // Prefab not in registry -- mark broken ref
      this._brokenRefIds.add(node.id);
      return;
    }
    const asset = this._prefabRegistry.get(url);
    if (!asset) {
      // URL mapped but not cached -- mark broken ref
      this._brokenRefIds.add(node.id);
      return;
    }

    const newVisiting = new Set(visiting);
    newVisiting.add(node.asset);
    this.expandPrefabAssetIntoObject3D(obj, asset, newVisiting);
  }
  private expandPrefabAssetIntoObject3D(parent: Object3D, asset: PrefabAsset, _visiting: Set<string>): void {
    const localIdToObj = new Map<number, Object3D>();

    for (const pNode of asset.nodes) {
      const obj = new Object3D();
      obj.name = pNode.name;
      obj.position.set(...pNode.position);
      obj.rotation.set(...pNode.rotation);
      obj.scale.set(...pNode.scale);
      localIdToObj.set(pNode.localId, obj);

      // Attach hydration based on components (prefab nodes still use components bag)
      const comps = pNode.components as Record<string, unknown>;
      if (comps['geometry']) {
        const geo = comps['geometry'] as { type: string };
        const threeGeo = createPrimitiveGeometry(geo.type);
        if (threeGeo) {
          const mat = comps['material'] as MaterialOverride | undefined;
          obj.add(new Mesh(threeGeo, buildMaterial(mat)));
        }
      } else if (comps['light']) {
        const l = comps['light'] as { type: string; color: number; intensity: number };
        const lightObj = buildLight({ type: l.type as LightProps['type'], color: l.color, intensity: l.intensity });
        lightObj.layers.set(1);
        obj.add(lightObj);
      }

      // Attach to parent Object3D
      if (pNode.parentLocalId === null) {
        parent.add(obj);
      } else {
        const parentObj = localIdToObj.get(pNode.parentLocalId);
        if (parentObj) {
          parentObj.add(obj);
        } else {
          parent.add(obj);
        }
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private applyTransform(obj: Object3D, node: SceneNode): void {
    obj.position.set(...node.position);
    obj.rotation.set(...node.rotation);
    obj.scale.set(...node.scale);
  }

  private attachToParent(obj: Object3D, parentId: NodeUUID | null): void {
    if (parentId !== null) {
      const parentObj = this.uuidToObj.get(parentId);
      if (parentObj) {
        parentObj.add(obj);
      } else {
        // Orphan: parent not yet created — park at scene root and register as pending
        this.threeScene.add(obj);
        let set = this.pendingChildren.get(parentId);
        if (!set) {
          set = new Set();
          this.pendingChildren.set(parentId, set);
        }
        set.add(obj);
      }
    } else {
      this.threeScene.add(obj);
    }
  }
}
