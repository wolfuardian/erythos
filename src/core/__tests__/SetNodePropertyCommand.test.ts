import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Editor } from '../Editor';
import { SetNodePropertyCommand } from '../commands/SetNodePropertyCommand';
import { ProjectManager } from '../project/ProjectManager';

describe('SetNodePropertyCommand', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor(new ProjectManager());
  });

  afterEach(() => {
    editor.dispose();
  });

  it('execute → name is updated', () => {
    const node = editor.sceneDocument.createNode('OldName');
    editor.sceneDocument.addNode(node);

    editor.execute(new SetNodePropertyCommand(editor, node.id, 'name', 'NewName'));

    expect(editor.sceneDocument.getNode(node.id)?.name).toBe('NewName');
  });

  it('undo → name is restored', () => {
    const node = editor.sceneDocument.createNode('OldName');
    editor.sceneDocument.addNode(node);

    editor.execute(new SetNodePropertyCommand(editor, node.id, 'name', 'NewName'));
    editor.undo();

    expect(editor.sceneDocument.getNode(node.id)?.name).toBe('OldName');
  });

  it('works for order field', () => {
    const node = editor.sceneDocument.createNode('Node');
    editor.sceneDocument.addNode(node);

    editor.execute(new SetNodePropertyCommand(editor, node.id, 'order', 5));
    expect(editor.sceneDocument.getNode(node.id)?.order).toBe(5);

    editor.undo();
    expect(editor.sceneDocument.getNode(node.id)?.order).toBe(0);
  });
});
