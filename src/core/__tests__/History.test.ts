import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { AddNodeCommand } from '../commands/AddNodeCommand';
import { RemoveNodeCommand } from '../commands/RemoveNodeCommand';
import { ProjectManager } from '../project/ProjectManager';

describe('History', () => {
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

  it('addNode then undo removes the node', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.execute(new AddNodeCommand(editor, node));
    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);

    editor.undo();
    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
  });

  it('addNode → removeNode → undo restores the node', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.execute(new AddNodeCommand(editor, node));
    editor.execute(new RemoveNodeCommand(editor, node.id));
    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);

    editor.undo();
    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
  });

  it('redo re-applies the last undone command', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.execute(new AddNodeCommand(editor, node));
    editor.execute(new RemoveNodeCommand(editor, node.id));
    editor.undo(); // undo remove → node restored
    editor.redo(); // redo remove → node gone again

    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
  });

  it('executing a new command clears the redo stack', () => {
    const node1 = editor.sceneDocument.createNode('Cube1');
    const node2 = editor.sceneDocument.createNode('Cube2');

    editor.execute(new AddNodeCommand(editor, node1));
    editor.undo();
    expect(editor.history.canRedo).toBe(true);

    editor.execute(new AddNodeCommand(editor, node2));
    expect(editor.history.canRedo).toBe(false);
  });
});
