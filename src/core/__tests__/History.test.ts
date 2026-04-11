import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Object3D } from 'three';
import { Editor } from '../Editor';
import { AddObjectCommand } from '../commands/AddObjectCommand';
import { RemoveObjectCommand } from '../commands/RemoveObjectCommand';

describe('History', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor();
  });

  afterEach(() => {
    editor.dispose();
    vi.useRealTimers();
  });

  it('addObject then undo removes the object', () => {
    const obj = new Object3D();
    obj.name = 'Cube';

    editor.execute(new AddObjectCommand(editor, obj));
    expect(editor.scene.children).toHaveLength(1);

    editor.undo();
    expect(editor.scene.children).toHaveLength(0);
  });

  it('addObject → removeObject → undo restores the object', () => {
    const obj = new Object3D();
    obj.name = 'Cube';

    editor.execute(new AddObjectCommand(editor, obj));
    editor.execute(new RemoveObjectCommand(editor, obj));
    expect(editor.scene.children).toHaveLength(0);

    editor.undo();
    expect(editor.scene.children).toHaveLength(1);
    expect(editor.scene.children[0]).toBe(obj);
  });

  it('redo re-applies the last undone command', () => {
    const obj = new Object3D();

    editor.execute(new AddObjectCommand(editor, obj));
    editor.execute(new RemoveObjectCommand(editor, obj));
    editor.undo(); // undo remove → obj restored
    editor.redo(); // redo remove → obj gone again

    expect(editor.scene.children).toHaveLength(0);
  });

  it('executing a new command clears the redo stack', () => {
    const obj1 = new Object3D();
    const obj2 = new Object3D();

    editor.execute(new AddObjectCommand(editor, obj1));
    editor.undo();
    expect(editor.history.canRedo).toBe(true);

    editor.execute(new AddObjectCommand(editor, obj2));
    expect(editor.history.canRedo).toBe(false);
  });
});
