import { Command } from '../Command';
import type { Editor } from '../Editor';
import { deserializeFromPrefab } from '../scene/PrefabSerializer';
import type { PrefabAsset } from '../scene/PrefabFormat';
import type { SceneNode, Vec3 } from '../scene/SceneFormat';

export class InstantiatePrefabCommand extends Command {
  readonly type = 'InstantiateLeaf';  // ← type 字串是持久化（undo/redo history），PR 1 不改
  private readonly asset: PrefabAsset;
  private readonly path: string;
  private readonly position: Vec3 | null;
  private instantiatedNodes: SceneNode[] = [];

  /**
   * @param asset   PrefabAsset（由呼叫端從 PrefabRegistry 取得）
   * @param path    Project-relative path of the prefab file (e.g. "prefabs/chair.prefab")
   * @param position  可選的世界座標，設定 root 節點的初始位置
   */
  constructor(editor: Editor, asset: PrefabAsset, path: string, position: Vec3 | null = null) {
    super(editor);
    this.asset = asset;
    this.path = path;
    this.position = position;
  }

  execute(): void {
    // 反序列化為全新 UUID 的節點（不含 components.prefab）
    const nodes = deserializeFromPrefab(this.asset, null);

    // 根節點加上 prefab 標記（使用 path，不使用 id）
    const root = nodes[0];
    root.components = {
      ...(root.components as Record<string, unknown>),
      prefab: { path: this.path },
    };

    // 若有指定位置，覆蓋根節點位置
    if (this.position) {
      root.position = [...this.position] as Vec3;
    }

    this.instantiatedNodes = nodes;

    for (const node of nodes) {
      this.editor.sceneDocument.addNode(node);
    }

    // 選取根節點
    this.editor.selection.select(root.id);
  }

  undo(): void {
    this.editor.selection.clear();
    for (const node of [...this.instantiatedNodes].reverse()) {
      this.editor.sceneDocument.removeNode(node.id);
    }
    this.instantiatedNodes = [];
  }
}
