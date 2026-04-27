import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { AddNodeCommand } from '../commands/AddNodeCommand';
import { ProjectManager } from '../project/ProjectManager';

describe('AddNodeCommand', () => {
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

  it('execute → node exists in sceneDocument', () => {
    const node = editor.sceneDocument.createNode('Box');
    editor.execute(new AddNodeCommand(editor, node));

    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
  });

  it('undo → node is removed from sceneDocument', () => {
    const node = editor.sceneDocument.createNode('Box');
    editor.execute(new AddNodeCommand(editor, node));
    editor.undo();

    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
  });

  it('redo → node is restored', () => {
    const node = editor.sceneDocument.createNode('Box');
    editor.execute(new AddNodeCommand(editor, node));
    editor.undo();
    editor.redo();

    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
  });
});
