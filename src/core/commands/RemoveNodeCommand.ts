import { Command } from '../Command';
import type { Editor } from '../Editor';
import type { SceneNode } from '../scene/SceneFormat';
import type { NodeUUID } from '../../utils/branded';

export class RemoveNodeCommand extends Command {
  readonly type = 'RemoveNode';
  private uuid: NodeUUID;
  private snapshot: SceneNode;
  private childSnapshots: SceneNode[];

  constructor(editor: Editor, uuid: NodeUUID) {
    super(editor);
    this.uuid = uuid;

    const node = editor.sceneDocument.getNode(uuid);
    if (!node) throw new Error(`RemoveNodeCommand: node ${uuid} not found`);
    this.snapshot = structuredClone(node);

    // BFS: collect all descendants in level order (parent before children).
    // execute() reverses this to remove leaves first.
    // undo()    uses this order to restore parents before children.
    this.childSnapshots = [];
    const queue: SceneNode[] = [node];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = editor.sceneDocument.getChildren(current.id);
      for (const child of children) {
        this.childSnapshots.push(structuredClone(child));
        queue.push(child);
      }
    }
  }

  execute(): void {
    // Remove leaves first (reverse BFS order), then self.
    for (let i = this.childSnapshots.length - 1; i >= 0; i--) {
      this.editor.sceneDocument.removeNode(this.childSnapshots[i].id);
    }
    this.editor.sceneDocument.removeNode(this.uuid);
  }

  undo(): void {
    // Restore self first, then children in BFS order (parents before children).
    this.editor.sceneDocument.addNode(this.snapshot);
    for (const child of this.childSnapshots) {
      this.editor.sceneDocument.addNode(child);
    }
  }
}
