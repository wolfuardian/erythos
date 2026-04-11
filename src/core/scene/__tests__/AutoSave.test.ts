import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Object3D } from 'three';
import { Editor } from '../../Editor';
import { saveSnapshot, restoreSnapshot, hasSnapshot } from '../AutoSave';

describe('AutoSave', () => {
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

  it('hasSnapshot returns false when localStorage is empty', () => {
    expect(hasSnapshot()).toBe(false);
  });

  it('saveSnapshot serializes scene children by name', () => {
    const obj = new Object3D();
    obj.name = 'TestObject';
    editor.addObject(obj);

    const snapshot = saveSnapshot(editor);
    expect(snapshot).toContain('TestObject');
  });

  it('restoreSnapshot round-trips scene children', () => {
    const obj = new Object3D();
    obj.name = 'TestObject';
    editor.addObject(obj);

    const snapshot = saveSnapshot(editor);

    editor.clear();
    expect(editor.scene.children).toHaveLength(0);

    restoreSnapshot(editor, snapshot);
    expect(editor.scene.children).toHaveLength(1);
    expect(editor.scene.children[0].name).toBe('TestObject');
  });

  it('restoreSnapshot clears selection', () => {
    const obj = new Object3D();
    editor.addObject(obj);
    editor.selection.select(obj);
    expect(editor.selection.count).toBe(1);

    const snapshot = saveSnapshot(editor);
    restoreSnapshot(editor, snapshot);

    expect(editor.selection.count).toBe(0);
  });

  it('restoreSnapshot emits sceneGraphChanged', () => {
    const obj = new Object3D();
    editor.addObject(obj);
    const snapshot = saveSnapshot(editor);

    let emitted = false;
    editor.events.on('sceneGraphChanged', () => { emitted = true; });

    restoreSnapshot(editor, snapshot);
    expect(emitted).toBe(true);
  });
});
