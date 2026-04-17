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

    this.uuidToObj.clear();
    this.objToUuid.clear();
    this.pendingChildren.clear();
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
      obj.add(light);
    } else if (node.components.camera) {
      const camComp = node.components.camera as CameraComponent;
      obj.add(new PerspectiveCamera(camComp.fov, 1, camComp.near, camComp.far));
    } else if (this.resourceCache && node.components.mesh) {
      const meshComp = node.components.mesh as MeshComponent;
      const colonIdx = meshComp.source.indexOf(':');
      const filePath = colonIdx === -1 ? meshComp.source : meshComp.source.slice(0, colonIdx);
      const nodePath = colonIdx === -1 ? undefined : meshComp.source.slice(colonIdx + 1);
      if (this.resourceCache.has(filePath)) {
        const meshObj = this.resourceCache.cloneSubtree(filePath, nodePath);
        if (meshObj) {
          // Reset clone root transform: applyTransform(obj, node) already applied
          // position/rotation/scale from SceneNode. The clone carries the same
          // values baked into the gltf subtree root — adding meshObj directly
          // would cause double-application (e.g. scale² for artist meter-to-unit root).
          // This reset applies to ALL mesh nodes, not just root clones:
          // gltfConverter always sets nodePath (format: filePath:nodePath), so
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
