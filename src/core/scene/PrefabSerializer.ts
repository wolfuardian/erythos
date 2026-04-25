import type { SceneNode } from './SceneFormat';
import type { PrefabAsset, PrefabNode } from './PrefabFormat';
import { generateUUID } from '../../utils/uuid';

/**
 * 將 SceneNode 子樹序列化為 PrefabAsset。
 * - UUID 全部剝除，改用 localId 整數做親子引用
 * - root 的 parent（無論指向什麼場景節點）在 prefab 內一律變成 null
 * - 剝除 root node 的 components.leaf（避免 prefab 自我引用）
 */
export function serializeToPrefab(
  rootUUID: string,
  allNodes: SceneNode[],
  name: string,
): PrefabAsset {
  const subtree = collectSubtree(rootUUID, allNodes);

  const uuidToLocalId = new Map<string, number>();
  subtree.forEach((node, i) => uuidToLocalId.set(node.id, i));

  const prefabNodes: PrefabNode[] = subtree.map((node, localId) => {
    // 剝除 components.leaf（不讓 prefab 資產知道自己是某個場景實例）
    const components: Record<string, unknown> = { ...(node.components as Record<string, unknown>) };
    delete components['leaf'];  // ← 'leaf' 字面是 scene 持久化 key，PR 3 處理前保留

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
    id: generateUUID(),
    name,
    modified: new Date().toISOString(),
    nodes: prefabNodes,
  };
}

/**
 * 將 PrefabAsset 反序列化為 SceneNode[]。
 * - 為每個節點生成全新的 UUID
 * - 根節點的 parent 設為 parentUUID（null 預設）
 * - 不加 components.leaf：由 InstantiatePrefabCommand 負責加上 leaf 標記
 */
export function deserializeFromPrefab(
  prefab: PrefabAsset,
  parentUUID: string | null = null,
): SceneNode[] {
  const localIdToUUID = new Map<number, string>();
  prefab.nodes.forEach(n => localIdToUUID.set(n.localId, generateUUID()));

  return prefab.nodes.map(prefabNode => ({
    id: localIdToUUID.get(prefabNode.localId)!,
    name: prefabNode.name,
    parent: prefabNode.parentLocalId === null
      ? parentUUID
      : (localIdToUUID.get(prefabNode.parentLocalId) ?? null),
    order: prefabNode.order,
    position: [...prefabNode.position] as [number, number, number],
    rotation: [...prefabNode.rotation] as [number, number, number],
    scale: [...prefabNode.scale] as [number, number, number],
    components: { ...(prefabNode.components as Record<string, unknown>) },
    userData: {},
  }));
}

/** BFS 收集 root + 所有後代，按廣度優先順序排列（root 永遠是第一個） */
function collectSubtree(rootUUID: string, allNodes: SceneNode[]): SceneNode[] {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const result: SceneNode[] = [];
  const queue = [rootUUID];

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
