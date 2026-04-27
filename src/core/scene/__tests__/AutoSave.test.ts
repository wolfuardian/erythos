import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../../Editor';
import { AutoSave, saveSnapshot, restoreSnapshot, hasSnapshot } from '../AutoSave';
import { ProjectManager } from '../../project/ProjectManager';

describe('AutoSave', () => {
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

  it('hasSnapshot returns false when localStorage is empty', () => {
    expect(hasSnapshot()).toBe(false);
  });

  it('saveSnapshot serializes scene nodes by name', () => {
    const node = editor.sceneDocument.createNode('TestObject');
    editor.sceneDocument.addNode(node);

    const snapshot = saveSnapshot(editor);
    expect(snapshot).toContain('TestObject');
  });

  it('restoreSnapshot round-trips scene nodes', () => {
    const node = editor.sceneDocument.createNode('TestObject');
    editor.sceneDocument.addNode(node);

    const snapshot = saveSnapshot(editor);

    editor.clear();
    expect(editor.sceneDocument.getAllNodes()).toHaveLength(0);

    restoreSnapshot(editor, snapshot);
    expect(editor.sceneDocument.getAllNodes()).toHaveLength(1);
    expect(editor.sceneDocument.getAllNodes()[0].name).toBe('TestObject');
  });

  it('restoreSnapshot clears selection', () => {
    const node = editor.sceneDocument.createNode('TestObject');
    editor.sceneDocument.addNode(node);
    editor.selection.select(node.id);
    expect(editor.selection.count).toBe(1);

    const snapshot = saveSnapshot(editor);
    restoreSnapshot(editor, snapshot);

    expect(editor.selection.count).toBe(0);
  });

  it('restoreSnapshot emits sceneReplaced on sceneDocument', () => {
    const node = editor.sceneDocument.createNode('TestObject');
    editor.sceneDocument.addNode(node);
    const snapshot = saveSnapshot(editor);

    let emitted = false;
    editor.sceneDocument.events.on('sceneReplaced', () => { emitted = true; });

    restoreSnapshot(editor, snapshot);
    expect(emitted).toBe(true);
  });

  it('restoreSnapshot throws on invalid JSON', () => {
    expect(() => restoreSnapshot(editor, 'not valid json{{')).toThrow('Invalid snapshot JSON');
  });

  it('restoreSnapshot throws on incompatible version', () => {
    const wrongVersion = JSON.stringify({ version: 99, nodes: [] });
    expect(() => restoreSnapshot(editor, wrongVersion)).toThrow('Unsupported scene version: 99');
  });

  it('scheduleSnapshot does not throw when setItem fails', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const autosave = new AutoSave(editor);
    const node = editor.sceneDocument.createNode('TestObject');
    editor.sceneDocument.addNode(node); // triggers scheduleSnapshot via autosave

    await vi.runAllTimersAsync();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AutoSave] setItem failed'),
      expect.any(DOMException),
    );

    warnSpy.mockRestore();
    setItemSpy.mockRestore();
    autosave.dispose();
  });
});
