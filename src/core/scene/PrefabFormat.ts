// .prefab 資產格式（純資料型別，不含驗證）
import type { PrefabId } from '../../utils/branded';

export interface PrefabAsset {
  version: 1;
  id: PrefabId;      // prefab 資產識別 ID（非場景節點 UUID）
  name: string;
  modified: string;  // ISO 8601 timestamp
  nodes: PrefabNode[];
}

export interface PrefabNode {
  localId: number;              // 0, 1, 2... 用於親子引用，不是 UUID
  parentLocalId: number | null; // null = root
  name: string;
  order: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  components: Record<string, unknown>; // 與 SceneNode 一致，純資料
  // Convention: when nodeType === 'prefab', components['prefab'] = { asset: 'prefabs://...' }
  // encodes the nested prefab reference. Root node never carries this field (self-ref stripped).
}

/**
 * Extract all nested prefab asset URLs from a PrefabAsset.
 * Walks all nodes and collects `components['prefab'].asset` values.
 * Used by PrefabRegistry to populate PrefabGraph edges on load/set/refetch.
 */
export function extractPrefabDeps(asset: PrefabAsset): Set<string> {
  const deps = new Set<string>();
  for (const node of asset.nodes) {
    const prefabComp = node.components['prefab'] as { asset?: unknown } | undefined;
    if (prefabComp && typeof prefabComp.asset === 'string') {
      deps.add(prefabComp.asset);
    }
  }
  return deps;
}
