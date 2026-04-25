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

    // 在 root node 標記 prefab 實例
    const newComponents = {
      ...(root.components as Record<string, unknown>),
      prefab: { id: this.savedAsset.id },
    };
    this.editor.sceneDocument.updateNode(this.rootUUID, { components: newComponents });
  }

  undo(): void {
    if (!this.savedAsset) return;

    // 從記憶體快取與 IndexedDB 移除
    this.editor.unregisterPrefab(this.savedAsset.id);

    // 移除 root node 的 prefab 標記
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;
    const { prefab: _prefab, ...restComponents } = root.components as Record<string, unknown> & { prefab?: unknown };
    this.editor.sceneDocument.updateNode(this.rootUUID, { components: restComponents });
  }
}
