import { Command } from '../Command';
import type { Editor } from '../Editor';
import type { SceneNode } from '../scene/SceneFormat';

export class ImportGLTFCommand extends Command {
  readonly type = 'ImportGLTF';
  private readonly nodes: SceneNode[];

  constructor(editor: Editor, nodes: SceneNode[]) {
    super(editor);
    this.nodes = structuredClone(nodes);
  }

  execute(): void {
    for (const node of this.nodes) {
      this.editor.sceneDocument.addNode(node);
    }
    if (this.nodes.length > 0) {
      this.editor.selection.select(this.nodes[0].id);
    }
  }

  undo(): void {
    this.editor.selection.clear();
    for (const node of [...this.nodes].reverse()) {
      this.editor.sceneDocument.removeNode(node.id);
    }
  }
}
