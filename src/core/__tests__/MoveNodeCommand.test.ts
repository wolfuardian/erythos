import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { AddNodeCommand } from '../commands/AddNodeCommand';
import { MoveNodeCommand } from '../commands/MoveNodeCommand';
import type { SceneNode } from '../scene/SceneFormat';
import { LocalProjectManager as ProjectManager } from '../project/LocalProjectManager';

// Helper: add a node and return it.
function addNode(editor: Editor, node: SceneNode): SceneNode {
  editor.execute(new AddNodeCommand(editor, node));
  return node;
}

describe('MoveNodeCommand', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor(new ProjectManager());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('basic reparent: root node moves under another node', () => {
    const parent = addNode(editor, { ...editor.sceneDocument.createNode('Parent'), order: 0 });
    const child  = addNode(editor, { ...editor.sceneDocument.createNode('Child'),  order: 1 });

    editor.execute(new MoveNodeCommand(editor, child.id, parent.id, 0));

    const updated = editor.sceneDocument.getNode(child.id)!;
    expect(updated.parent).toBe(parent.id);
  });

  it('reorder within same parent: first child moves to end', () => {
    const parent = addNode(editor, { ...editor.sceneDocument.createNode('Parent'), order: 0 });
    const a = addNode(editor, { ...editor.sceneDocument.createNode('A'), parent: parent.id, order: 1 });
    const b = addNode(editor, { ...editor.sceneDocument.createNode('B'), parent: parent.id, order: 2 });

    // Move A after B (insertIndex = 1 among siblings [B] after filtering A out).
    editor.execute(new MoveNodeCommand(editor, a.id, parent.id, 1));

    const updatedA = editor.sceneDocument.getNode(a.id)!;
    const updatedB = editor.sceneDocument.getNode(b.id)!;
    expect(updatedA.parent).toBe(parent.id);
    // A's order should be greater than B's order.
    expect(updatedA.order).toBeGreaterThan(updatedB.order);
  });

  it('insert between two siblings produces a fractional order between them', () => {
    addNode(editor, { ...editor.sceneDocument.createNode('A'), order: 0 });
    addNode(editor, { ...editor.sceneDocument.createNode('B'), order: 2 });
    const c = addNode(editor, { ...editor.sceneDocument.createNode('C'), order: 10 });

    // Insert C between A (order=0) and B (order=2) → expect order in (0, 2).
    editor.execute(new MoveNodeCommand(editor, c.id, null, 1));

    const updatedC = editor.sceneDocument.getNode(c.id)!;
    expect(updatedC.order).toBeGreaterThan(0);
    expect(updatedC.order).toBeLessThan(2);
  });

  it('cycle check: cannot reparent node into its own descendant', () => {
    const grandparent = addNode(editor, { ...editor.sceneDocument.createNode('GP'), order: 0 });
    const child = addNode(editor, { ...editor.sceneDocument.createNode('Child'), parent: grandparent.id, order: 0 });

    expect(() => {
      editor.execute(new MoveNodeCommand(editor, grandparent.id, child.id, 0));
    }).toThrow('Cannot move node into its own descendant');
  });

  it('undo restores original parent and relative order position', () => {
    const target = addNode(editor, { ...editor.sceneDocument.createNode('Target'), order: 0 });
    const node   = addNode(editor, { ...editor.sceneDocument.createNode('Node'),   order: 5 });

    const originalParent = node.parent;
    const originalOrder  = node.order;

    editor.execute(new MoveNodeCommand(editor, node.id, target.id, 0));
    editor.undo();

    const restored = editor.sceneDocument.getNode(node.id)!;
    expect(restored.parent).toBe(originalParent);
    expect(restored.order).toBe(originalOrder);
  });
});
