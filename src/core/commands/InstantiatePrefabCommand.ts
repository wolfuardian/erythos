import { Command } from '../Command';
import type { Editor } from '../Editor';
import { generateUUID } from '../../utils/uuid';
import { asNodeUUID } from '../../utils/branded';
import type { AssetPath } from '../../utils/branded';
import type { SceneNode, Vec3 } from '../scene/SceneFormat';
import { CircularReferenceError as _CREImport } from '../io/PrefabGraph';

/** Re-export for consumers that catch cycle errors from commands. */
export { CircularReferenceError } from '../io/PrefabGraph';

export class InstantiatePrefabCommand extends Command {
  readonly type = 'InstantiateLeaf';  // persisted in undo/redo history — do NOT rename
  private readonly prefabAssetUrl: string;  // prefabs:// URL
  private readonly position: Vec3 | null;
  private instantiatedNode: SceneNode | null = null;

  /**
   * @param prefabPath  Project-relative path ("prefabs/chair.prefab") — converted to prefabs:// URL
   * @param position    Optional initial world position
   */
  constructor(editor: Editor, prefabPath: AssetPath, position: Vec3 | null = null) {
    super(editor);
    // Convert "prefabs/chair.prefab" → "prefabs://chair"
    const name = prefabPath
      .replace(/^prefabs\//, '')
      .replace(/\.prefab$/, '');
    this.prefabAssetUrl = `prefabs://${name}`;
    this.position = position;
  }

  execute(): void {
    // Cycle guard: check that instantiating this prefab won't create a reference cycle.
    // Use PrefabGraph if available. Throw CircularReferenceError to abort the command
    // (History.execute will not push the command since it throws before returning).
    {
      const graph = this.editor.prefabGraph;
      const currentScenePath = this.editor.projectManager.currentScenePath();
      if (graph && currentScenePath) {
        graph.assertNoCycle(currentScenePath, this.prefabAssetUrl);
      }
    }

        const node: SceneNode = {
      id: asNodeUUID(generateUUID()),
      name: this.prefabAssetUrl.replace('prefabs://', ''),
      parent: null,
      order: 0,
      nodeType: 'prefab',
      position: this.position ? [...this.position] as Vec3 : [0, 0, 0],
      rotation: [0, 0, 0],
      scale:    [1, 1, 1],
      asset:    this.prefabAssetUrl,
      userData: {},
    };

    this.instantiatedNode = node;
    this.editor.sceneDocument.addNode(node);
    this.editor.selection.select(node.id);
  }

  undo(): void {
    if (!this.instantiatedNode) return;
    this.editor.selection.clear();
    this.editor.sceneDocument.removeNode(this.instantiatedNode.id);
    this.instantiatedNode = null;
  }
}
