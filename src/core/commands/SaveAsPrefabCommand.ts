import { Command } from '../Command';
import type { Editor } from '../Editor';
import { serializeToPrefab } from '../scene/PrefabSerializer';
import type { PrefabAsset } from '../scene/PrefabFormat';
import type { AssetPath, NodeUUID } from '../../utils/branded';

export class SaveAsPrefabCommand extends Command {
  readonly type = 'SaveAsLeaf';  // persisted in undo/redo history — do NOT rename
  private readonly rootUUID: NodeUUID;
  private readonly name: string;
  private savedAsset: PrefabAsset | null = null;
  private savedPath: AssetPath | null = null;
  private savedPrefabUrl: string | null = null;

  constructor(editor: Editor, rootUUID: NodeUUID, name: string) {
    super(editor);
    this.rootUUID = rootUUID;
    this.name = name;
  }

  execute(): void {
    const allNodes = this.editor.sceneDocument.getAllNodes();
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;

    // Serialize subtree to PrefabAsset (v1 shape)
    this.savedAsset = serializeToPrefab(this.rootUUID, allNodes, this.name);

    // Persist to project file; registerPrefab returns path synchronously
    this.savedPath = this.editor.registerPrefab(this.savedAsset);

    // Build prefabs:// URL from the path "prefabs/name.prefab" → "prefabs://name"
    const prefabName = (this.savedPath as string)
      .replace(/^prefabs\//, '')
      .replace(/\.prefab$/, '');
    this.savedPrefabUrl = `prefabs://${prefabName}`;

    // Mark root node as a prefab instance (v1: nodeType + asset)
    this.editor.sceneDocument.updateNode(this.rootUUID, {
      nodeType: 'prefab',
      asset:    this.savedPrefabUrl,
    });
  }

  undo(): void {
    if (!this.savedAsset || !this.savedPath) return;

    // Remove from PrefabRegistry and project file
    this.editor.unregisterPrefab(this.savedPath);

    // Restore root node to mesh nodeType (best-effort — original type was mesh if it had geometry)
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;
    this.editor.sceneDocument.updateNode(this.rootUUID, {
      nodeType: 'mesh',
      asset:    undefined,
    });
  }
}
