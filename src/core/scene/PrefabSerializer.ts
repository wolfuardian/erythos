import type { SceneNode } from './SceneFormat';
import type { PrefabAsset, PrefabNode } from './PrefabFormat';
import { generateUUID } from '../../utils/uuid';
import { asNodeUUID, asPrefabId } from '../../utils/branded';
import type { NodeUUID } from '../../utils/branded';

/**
 * Serialize a SceneNode subtree (v1 shape) to a PrefabAsset.
 *
 * - Generates sequential localId integers for intra-prefab parent-child refs.
 * - Root's parent (whatever scene node it points to) becomes null in the prefab.
 * - Strips the prefab's own asset URL from the root node (avoids self-reference).
 *
 * Note: PrefabNode.components is still a bag — prefab format doesn't need to
 * align with v1 nodeType immediately; it stores the visual geometry for hydration.
 */
export function serializeToPrefab(
  rootUUID: NodeUUID,
  allNodes: SceneNode[],
  name: string,
): PrefabAsset {
  const subtree = collectSubtree(rootUUID, allNodes);

  const uuidToLocalId = new Map<NodeUUID, number>();
  subtree.forEach((node, i) => uuidToLocalId.set(node.id, i));

  const prefabNodes: PrefabNode[] = subtree.map((node, localId) => {
    // Build a components bag from v1 node for backward-compatible prefab hydration
    const components: Record<string, unknown> = {};

    if (node.asset && node.nodeType === 'mesh') {
      if (node.asset.startsWith('primitives://')) {
        // primitives:// built-in geometry — store as geometry component (refs #1027)
        components['geometry'] = { type: node.asset.slice('primitives://'.length) };
      } else {
        // Convert project:// to a path for prefab storage
        const assetPath = node.asset.replace('project://', '');
        components['mesh'] = { path: assetPath };
      }
    }

    if (node.asset && node.nodeType === 'prefab') {
      // Encode nested prefab reference for N-hop cycle detection via PrefabGraph.
      // Root node's self-reference is stripped below (localId === 0 guard).
      components['prefab'] = { asset: node.asset };
    }

    if (node.mat) {
      // MaterialOverride uses runtime numbers — store as-is (prefab internal format)
      components['material'] = { ...node.mat };
    }

    if (node.light) {
      // LightProps uses runtime numbers — store as-is
      components['light'] = { ...node.light };
    }

    if (localId === 0) {
      // Strip root node's prefab asset reference (no self-reference in prefab asset)
      delete components['prefab'];
    }

    return {
      localId,
      parentLocalId: node.parent !== null
        ? (uuidToLocalId.get(node.parent) ?? null)
        : null,
      name:     node.name,
      order:    node.order,
      position: [...node.position] as [number, number, number],
      rotation: [...node.rotation] as [number, number, number],
      scale:    [...node.scale]    as [number, number, number],
      components,
    };
  });

  return {
    version: 1,
    id:       asPrefabId(generateUUID()),
    name,
    modified: new Date().toISOString(),
    nodes:    prefabNodes,
  };
}

/**
 * Deserialize a PrefabAsset into SceneNode[] (v1 shape) with fresh UUIDs.
 *
 * - Generates fresh UUIDs for all nodes.
 * - Root's parent set to parentUUID (or null).
 * - Does NOT set nodeType/asset on the root — InstantiatePrefabCommand handles that.
 *
 * Note: This function converts the components bag back into v1 SceneNode fields.
 */
export function deserializeFromPrefab(
  prefab: PrefabAsset,
  parentUUID: NodeUUID | null = null,
): SceneNode[] {
  const localIdToUUID = new Map<number, NodeUUID>();
  prefab.nodes.forEach(n => localIdToUUID.set(n.localId, asNodeUUID(generateUUID())));

  return prefab.nodes.map(prefabNode => {
    const comps = prefabNode.components as Record<string, unknown>;

    // Resolve nodeType from components bag
    let nodeType: SceneNode['nodeType'] = 'group';
    let asset: string | undefined;
    let light: SceneNode['light'];
    let camera: SceneNode['camera'];
    let mat: SceneNode['mat'];

    if (comps['mesh']) {
      const mesh = comps['mesh'] as { path?: string };
      nodeType = 'mesh';
      if (mesh.path) asset = `project://${mesh.path}`;
    } else if (comps['geometry']) {
      const geo = comps['geometry'] as { type: string };
      nodeType = 'mesh';
      asset = `primitives://${geo.type}`;
    } else if (comps['prefab']) {
      const pref = comps['prefab'] as { asset?: string };
      nodeType = 'prefab';
      if (pref.asset) asset = pref.asset;
    } else if (comps['light']) {
      const l = comps['light'] as { type: string; color: number; intensity: number };
      nodeType = 'light';
      light = { type: l.type as NonNullable<SceneNode['light']>['type'], color: l.color, intensity: l.intensity };
    } else if (comps['camera']) {
      const c = comps['camera'] as { type: string; fov: number; near: number; far: number };
      nodeType = 'camera';
      camera = { type: 'perspective', fov: c.fov, near: c.near, far: c.far };
    }

    if (comps['material']) {
      mat = comps['material'] as SceneNode['mat'];
    }

    const node: SceneNode = {
      id:       localIdToUUID.get(prefabNode.localId)!,
      name:     prefabNode.name,
      parent:   prefabNode.parentLocalId === null
        ? parentUUID
        : (localIdToUUID.get(prefabNode.parentLocalId) ?? null),
      order:    prefabNode.order,
      nodeType,
      position: [...prefabNode.position] as [number, number, number],
      rotation: [...prefabNode.rotation] as [number, number, number],
      scale:    [...prefabNode.scale]    as [number, number, number],
      userData: {},
    };

    if (asset !== undefined) node.asset = asset;
    if (mat   !== undefined) node.mat   = mat;
    if (light !== undefined) node.light = light;
    if (camera !== undefined) node.camera = camera;

    return node;
  });
}

/** BFS collect root + all descendants, root-first */
function collectSubtree(rootUUID: NodeUUID, allNodes: SceneNode[]): SceneNode[] {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const result: SceneNode[] = [];
  const queue: NodeUUID[] = [rootUUID];

  while (queue.length > 0) {
    const uuid = queue.shift()!;
    const node = nodeMap.get(uuid);
    if (!node) continue;
    result.push(node);
    const children = allNodes
      .filter(n => n.parent === uuid)
      .sort((a, b) => a.order - b.order);
    queue.push(...children.map(c => c.id));
  }

  return result;
}
