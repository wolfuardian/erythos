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
}
