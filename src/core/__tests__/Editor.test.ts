import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scene, Object3D } from 'three';
import { Editor } from '../Editor';
import { AddObjectCommand } from '../commands/AddObjectCommand';

describe('Editor', () => {
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

  it('sceneDocument and sceneSync are initialized after construction', () => {
    expect(editor.sceneDocument).toBeDefined();
    expect(editor.sceneSync).toBeDefined();
  });

  it('threeScene getter returns the same Scene instance as editor.scene', () => {
    expect(editor.threeScene).toBeInstanceOf(Scene);
    expect(editor.threeScene).toBe(editor.scene);
  });

  it('addNode registers node in sceneDocument', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.addNode(node);
    expect(editor.sceneDocument.hasNode(node.id)).toBe(true);
  });

  it('addNode syncs node to Three.js via sceneSync', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.addNode(node);
    expect(editor.sceneSync.getObject3D(node.id)).not.toBeNull();
  });

  it('removeNode clears node from sceneDocument and sceneSync', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.addNode(node);
    editor.removeNode(node.id);
    expect(editor.sceneDocument.hasNode(node.id)).toBe(false);
    expect(editor.sceneSync.getObject3D(node.id)).toBeNull();
  });

  it('addObject (legacy API) still works', () => {
    const obj = new Object3D();
    obj.name = 'LegacyObj';
    editor.execute(new AddObjectCommand(editor, obj));
    expect(editor.scene.children).toContain(obj);
  });
});
