import type { SceneNode } from './SceneFormat';
import type { PrefabAsset, PrefabNode } from './PrefabFormat';
import { generateUUID } from '../../utils/uuid';
import { asNodeUUID, asPrefabId, asAssetPath } from '../../utils/branded';
import type { NodeUUID } from '../../utils/branded';

/**
 * 將 SceneNode 子樹序列化為 PrefabAsset。
 * - UUID 全部剝除，改用 localId 整數做親子引用
 * - root 的 parent（無論指向什麼場景節點）在 prefab 內一律變成 null
 * - 剝除 root node 的 components.prefab（避免 prefab 自我引用）
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
    // 剝除 components.prefab（不讓 prefab 資產知道自己是某個場景實例）
    const components: Record<string, unknown> = { ...(node.components as Record<string, unknown>) };
    delete components['prefab'];
    // Strip runtime-only blob URL fields so they are not persisted to disk.
    // mesh.url and prefab.url are session-scoped; they must be rehydrated from
    // mesh.path / prefab.path on the next session load.
    if (components['mesh'] && typeof components['mesh'] === 'object') {
      const mesh = { ...(components['mesh'] as Record<string, unknown>) };
      delete mesh['url'];
      components['mesh'] = mesh;
    }
    return {
      localId,
      parentLocalId: node.parent !== null
        ? (uuidToLocalId.get(node.parent) ?? null)
        : null,
      name: node.name,
      order: node.order,
      position: [...node.position] as [number, number, number],
      rotation: [...node.rotation] as [number, number, number],
      scale: [...node.scale] as [number, number, number],
      components,
    };
  });

  return {
    version: 1,
    id: asPrefabId(generateUUID()),
    name,
    modified: new Date().toISOString(),
    nodes: prefabNodes,
  };
}

/**
 * 將 PrefabAsset 反序列化為 SceneNode[]。
 * - 為每個節點生成全新的 UUID
 * - 根節點的 parent 設為 parentUUID（null 預設）
 * - 不加 components.prefab：由 InstantiatePrefabCommand 負責加上 prefab 標記
 */
export function deserializeFromPrefab(
  prefab: PrefabAsset,
  parentUUID: NodeUUID | null = null,
): SceneNode[] {
  const localIdToUUID = new Map<number, NodeUUID>();
  prefab.nodes.forEach(n => localIdToUUID.set(n.localId, asNodeUUID(generateUUID())));

  return prefab.nodes.map(prefabNode => {
    const components = { ...(prefabNode.components as Record<string, unknown>) };
    // Mint AssetPath for mesh.path / prefab.path at the deserialise boundary —
    // PrefabAsset originates from JSON.parse (PrefabRegistry.loadFromURL); paths arrive as plain strings.
    if (components['mesh'] && typeof components['mesh'] === 'object') {
      const mesh = components['mesh'] as Record<string, unknown>;
      if (typeof mesh['path'] === 'string') {
        mesh['path'] = asAssetPath(mesh['path'] as string);
      }
    }
    if (components['prefab'] && typeof components['prefab'] === 'object') {
      const prefabComp = components['prefab'] as Record<string, unknown>;
      if (typeof prefabComp['path'] === 'string') {
        prefabComp['path'] = asAssetPath(prefabComp['path'] as string);
      }
    }
    return {
      id: localIdToUUID.get(prefabNode.localId)!,
      name: prefabNode.name,
      parent: prefabNode.parentLocalId === null
        ? parentUUID
        : (localIdToUUID.get(prefabNode.parentLocalId) ?? null),
      order: prefabNode.order,
      position: [...prefabNode.position] as [number, number, number],
      rotation: [...prefabNode.rotation] as [number, number, number],
      scale: [...prefabNode.scale] as [number, number, number],
      components,
      userData: {},
    };
  });
}

/** BFS 收集 root + 所有後代，按廣度優先順序排列（root 永遠是第一個） */
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
