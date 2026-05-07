import { Command } from '../Command';
import type { Editor } from '../Editor';
import { serializeToPrefab } from '../scene/PrefabSerializer';
import type { PrefabAsset } from '../scene/PrefabFormat';
import type { AssetPath, NodeUUID } from '../../utils/branded';
import type { NodeType, MaterialOverride, LightProps, CameraProps } from '../scene/SceneFormat';

/** Snapshot of type-specific fields captured before execute() modifies the root node. */
interface NodeTypeSnapshot {
  nodeType: NodeType;
  asset: string | undefined;
  mat: MaterialOverride | undefined;
  light: LightProps | undefined;
  camera: CameraProps | undefined;
}

export class SaveAsPrefabCommand extends Command {
  readonly type = 'SaveAsLeaf';  // persisted in undo/redo history — do NOT rename
  private readonly rootUUID: NodeUUID;
  private readonly name: string;
  private savedAsset: PrefabAsset | null = null;
  private savedPath: AssetPath | null = null;
  private savedPrefabUrl: string | null = null;
  /** Snapshot of original node state captured in execute() for undo(). */
  private originalSnapshot: NodeTypeSnapshot | null = null;

  constructor(editor: Editor, rootUUID: NodeUUID, name: string) {
    super(editor);
    this.rootUUID = rootUUID;
    this.name = name;
  }

  execute(): void {
    const allNodes = this.editor.sceneDocument.getAllNodes();
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;

    // Snapshot all type-specific fields before we overwrite them.
    // undo() uses this to restore the original node shape exactly.
    this.originalSnapshot = {
      nodeType: root.nodeType,
      asset:    root.asset,
      mat:      root.mat,
      light:    root.light,
      camera:   root.camera,
    };

    // Serialize subtree to PrefabAsset (v1 shape)
    this.savedAsset = serializeToPrefab(this.rootUUID, allNodes, this.name);

    // Persist to project file; registerPrefab returns path synchronously
    this.savedPath = this.editor.registerPrefab(this.savedAsset);

    // Build prefabs:// URL from the path "prefabs/name.prefab" → "prefabs://name"
    const prefabName = (this.savedPath as string)
      .replace(/^prefabs\//, '')
      .replace(/\.prefab$/, '');
    this.savedPrefabUrl = `prefabs://${prefabName}`;

    // Mark root node as a prefab instance (v1: nodeType + asset).
    // mat/light/camera are intentionally cleared — prefab instances don't carry them.
    this.editor.sceneDocument.updateNode(this.rootUUID, {
      nodeType: 'prefab',
      asset:    this.savedPrefabUrl,
      mat:      undefined,
      light:    undefined,
      camera:   undefined,
    });
  }

  undo(): void {
    if (!this.savedAsset || !this.savedPath || !this.originalSnapshot) return;

    // Remove from PrefabRegistry and project file
    this.editor.unregisterPrefab(this.savedPath);

    // Restore root node to its original type-specific state from snapshot.
    // All 5 type-specific fields are restored — handles group, mesh, light, camera, prefab.
    const root = this.editor.sceneDocument.getNode(this.rootUUID);
    if (!root) return;
    this.editor.sceneDocument.updateNode(this.rootUUID, {
      nodeType: this.originalSnapshot.nodeType,
      asset:    this.originalSnapshot.asset,
      mat:      this.originalSnapshot.mat,
      light:    this.originalSnapshot.light,
      camera:   this.originalSnapshot.camera,
    });
  }
}
