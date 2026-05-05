import { generateUUID } from './uuid';
import type { Group, Object3D } from 'three';
import { Mesh } from 'three';
import type { SceneNode, Vec3 } from '../core/scene/SceneFormat';
import { asNodeUUID } from './branded';
import type { NodeUUID } from './branded';

// Recursively convert one Object3D and its descendants to SceneNodes.
// Parent is always pushed before children so SceneDocument.addNode
// can resolve parent references immediately.
function buildNodes(
  obj: Object3D,
  parentId: NodeUUID,
  filePath: string,
  nodePath: string,
  order: number,
  result: SceneNode[],
): void {
  const id = asNodeUUID(generateUUID());

  // Emit mesh: { path, nodePath } — no 'url' here.
  // url is populated at hydrate time (projectManager.urlFor(path)) or at import
  // time by the caller of convertGLTFToNodes.
  const components = obj instanceof Mesh
    ? { mesh: { path: filePath, nodePath } }
    : {};

  result.push({
    id,
    name: obj.name || obj.type,
    parent: parentId,
    order,
    position: [...obj.position.toArray()] as Vec3,
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z] as Vec3,
    scale: [...obj.scale.toArray()] as Vec3,
    components,
    userData: {},
  });

  obj.children.forEach((child, i) => {
    const childPath = `${nodePath}|${child.name || child.type}`;
    buildNodes(child, id, filePath, childPath, i, result);
  });
}

/**
 * Convert a parsed GLTF scene into a flat SceneNode array (parent before child).
 *
 * @param gltfScene  - Top-level Group from GLTFLoader (gltf.scene)
 * @param parentUuid - UUID of the SceneNode that will parent the top-level children
 * @param filePath   - Original file name used as the cache key (e.g. "chair.glb")
 */
export function convertGLTFToNodes(
  gltfScene: Group,
  parentUuid: NodeUUID,
  filePath: string,
): SceneNode[] {
  const result: SceneNode[] = [];
  gltfScene.children.forEach((child, i) => {
    const nodePath = child.name || child.type;
    buildNodes(child, parentUuid, filePath, nodePath, i, result);
  });
  return result;
}
