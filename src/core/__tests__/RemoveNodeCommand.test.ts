import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { RemoveNodeCommand } from '../commands/RemoveNodeCommand';
import { ProjectManager } from '../project/ProjectManager';

describe('RemoveNodeCommand', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor(new ProjectManager());
  });

  afterEach(() => {
    editor.dispose();
    vi.useRealTimers();
  });

  it('execute → node is removed', () => {
    const node = editor.sceneDocument.createNode('Box');
    editor.sceneDocument.addNode(node);

    editor.execute(new RemoveNodeCommand(editor, node.id));

    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
  });

  it('undo → node is restored', () => {
    const node = editor.sceneDocument.createNode('Box');
    editor.sceneDocument.addNode(node);

    editor.execute(new RemoveNodeCommand(editor, node.id));
    editor.undo();

    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
  });

  it('removing parent also removes children, undo restores both', () => {
    const parent = editor.sceneDocument.createNode('Parent');
    editor.sceneDocument.addNode(parent);

    const child = editor.sceneDocument.createNode('Child', parent.id);
    editor.sceneDocument.addNode(child);

    editor.execute(new RemoveNodeCommand(editor, parent.id));

    expect(editor.sceneDocument.hasNode(parent.id)).toBe(false);
    expect(editor.sceneDocument.hasNode(child.id)).toBe(false);

    editor.undo();

    expect(editor.sceneDocument.hasNode(parent.id)).toBe(true);
    expect(editor.sceneDocument.hasNode(child.id)).toBe(true);
  });

  it('deep hierarchy: grandchild also removed and restored', () => {
    const root = editor.sceneDocument.createNode('Root');
    editor.sceneDocument.addNode(root);
    const mid = editor.sceneDocument.createNode('Mid', root.id);
    editor.sceneDocument.addNode(mid);
    const leaf = editor.sceneDocument.createNode('Leaf', mid.id);
    editor.sceneDocument.addNode(leaf);

    editor.execute(new RemoveNodeCommand(editor, root.id));

    expect(editor.sceneDocument.hasNode(root.id)).toBe(false);
    expect(editor.sceneDocument.hasNode(mid.id)).toBe(false);
    expect(editor.sceneDocument.hasNode(leaf.id)).toBe(false);

    editor.undo();

    expect(editor.sceneDocument.hasNode(root.id)).toBe(true);
    expect(editor.sceneDocument.hasNode(mid.id)).toBe(true);
    expect(editor.sceneDocument.hasNode(leaf.id)).toBe(true);
  });
});
