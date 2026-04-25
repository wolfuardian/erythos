import { Command } from '../Command';
import type { Editor } from '../Editor';
import { serializeToPrefab } from '../scene/PrefabSerializer';
import type { PrefabAsset } from '../scene/PrefabFormat';

export class SaveAsPrefabCommand extends Command {
  readonly type = 'SaveAsLeaf';  // ← type 字串是持久化（undo/redo history），PR 1 不改
  private readonly rootUUID: string;
  private readonly name: string;
  private savedAsset: PrefabAsset | null = null;

  constructor(editor: Editor, rootUUID: string, name: string) {
    super(editor);
    this.rootUUID = rootUUID;
    this.name = name;
  }

  execute(): void {
    const allNodes = this.editor.sceneDocument.getAllNodes();
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;

    // 序列化子樹為 PrefabAsset
    this.savedAsset = serializeToPrefab(this.rootUUID, allNodes, this.name);

    // 持久化到 IndexedDB（透過 editor.registerPrefab，同時更新記憶體快取並觸發事件）
    this.editor.registerPrefab(this.savedAsset);

    // 在 root node 標記 leaf 實例（'leaf' key 是 scene 持久化 key，PR 3 前保留）
    const newComponents = {
      ...(root.components as Record<string, unknown>),
      leaf: { id: this.savedAsset.id },  // ← PR 3 才改為 'prefab'
    };
    this.editor.sceneDocument.updateNode(this.rootUUID, { components: newComponents });
  }

  undo(): void {
    if (!this.savedAsset) return;

    // 從記憶體快取與 IndexedDB 移除
    this.editor.unregisterPrefab(this.savedAsset.id);

    // 移除 root node 的 leaf 標記
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;
    const { leaf: _leaf, ...restComponents } = root.components as Record<string, unknown> & { leaf?: unknown };
    this.editor.sceneDocument.updateNode(this.rootUUID, { components: restComponents });
  }
}
