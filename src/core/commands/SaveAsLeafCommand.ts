import { Command } from '../Command';
import type { Editor } from '../Editor';
import { serializeToLeaf } from '../scene/LeafSerializer';
import * as LeafStore from '../scene/LeafStore';
import type { LeafAsset } from '../scene/LeafFormat';

export class SaveAsLeafCommand extends Command {
  readonly type = 'SaveAsLeaf';
  private readonly rootUUID: string;
  private readonly name: string;
  private savedAsset: LeafAsset | null = null;

  constructor(editor: Editor, rootUUID: string, name: string) {
    super(editor);
    this.rootUUID = rootUUID;
    this.name = name;
  }

  execute(): void {
    const allNodes = this.editor.sceneDocument.getAllNodes();
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;

    // 序列化子樹為 LeafAsset
    this.savedAsset = serializeToLeaf(this.rootUUID, allNodes, this.name);

    // 持久化到 IndexedDB（fire-and-forget，非同步不阻塞 undo/redo）
    void LeafStore.put(this.savedAsset.id, this.savedAsset);

    // 在 root node 標記 leaf 實例
    const newComponents = {
      ...(root.components as Record<string, unknown>),
      leaf: { id: this.savedAsset.id },
    };
    this.editor.sceneDocument.updateNode(this.rootUUID, { components: newComponents });
  }

  undo(): void {
    if (!this.savedAsset) return;

    // 從 store 移除（fire-and-forget）
    void LeafStore.remove(this.savedAsset.id);

    // 移除 root node 的 leaf 標記
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;
    const { leaf: _leaf, ...restComponents } = root.components as Record<string, unknown> & { leaf?: unknown };
    this.editor.sceneDocument.updateNode(this.rootUUID, { components: restComponents });
  }
}
