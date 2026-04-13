import { Command } from '../Command';
import type { Editor } from '../Editor';

export class MoveNodeCommand extends Command {
  readonly type = 'MoveNode';

  private oldParentId: string | null;
  private oldOrder: number;

  constructor(
    editor: Editor,
    private nodeId: string,
    private newParentId: string | null,
    private insertIndex: number,
  ) {
    super(editor);

    const node = editor.sceneDocument.getNode(nodeId);
    if (!node) throw new Error(`MoveNodeCommand: node ${nodeId} not found`);
    this.oldParentId = node.parent;
    this.oldOrder = node.order;
  }

  execute(): void {
    // Cycle check: newParent must not be the node itself or any of its descendants.
    if (this.newParentId !== null) {
      let cursor: string | null = this.newParentId;
      while (cursor !== null) {
        if (cursor === this.nodeId) {
          throw new Error('Cannot move node into its own descendant');
        }
        const parent = this.editor.sceneDocument.getNode(cursor);
        cursor = parent?.parent ?? null;
      }
    }

    // Siblings in new parent (sorted by order, self excluded).
    const siblings = (
      this.newParentId === null
        ? this.editor.sceneDocument.getRoots()
        : this.editor.sceneDocument.getChildren(this.newParentId)
    ).filter(n => n.id !== this.nodeId);

    const newOrder = computeOrder(siblings.map(s => s.order), this.insertIndex);

    this.editor.sceneDocument.updateNode(this.nodeId, {
      parent: this.newParentId,
      order: newOrder,
    });
  }

  undo(): void {
    this.editor.sceneDocument.updateNode(this.nodeId, {
      parent: this.oldParentId,
      order: this.oldOrder,
    });
  }
}

/**
 * Compute a fractional order value for inserting at `index` among `orders`
 * (already sorted ascending). Returns a float that sits between neighbors.
 */
function computeOrder(orders: number[], index: number): number {
  if (orders.length === 0) return 0;
  if (index <= 0) return orders[0] - 1;
  if (index >= orders.length) return orders[orders.length - 1] + 1;
  return (orders[index - 1] + orders[index]) / 2;
}
