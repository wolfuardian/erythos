import { Command } from '../Command';
import type { Editor } from '../Editor';
import type { SceneNode } from '../scene/SceneFormat';

export class AddNodeCommand extends Command {
  readonly type = 'AddNode';
  private node: SceneNode;

  constructor(editor: Editor, node: SceneNode) {
    super(editor);
    this.node = structuredClone(node);
  }

  execute(): void {
    this.editor.sceneDocument.addNode(this.node);
  }

  undo(): void {
    this.editor.sceneDocument.removeNode(this.node.id);
  }
}
