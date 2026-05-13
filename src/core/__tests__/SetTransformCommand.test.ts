import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { SetTransformCommand } from '../commands/SetTransformCommand';
import type { Vec3 } from '../scene/SceneFormat';
import { LocalProjectManager as ProjectManager } from '../project/LocalProjectManager';

describe('SetTransformCommand', () => {
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

  function addNode(name: string) {
    const node = editor.sceneDocument.createNode(name);
    editor.sceneDocument.addNode(node);
    return node;
  }

  // ── position ────────────────────────────────────────────────────────────────

  it('execute updates position', () => {
    const node = addNode('Cube');
    const newPos: Vec3 = [1, 2, 3];
    const cmd = new SetTransformCommand(editor, node.id, 'position', newPos, node.position);
    cmd.execute();
    expect(editor.sceneDocument.getNode(node.id)?.position).toEqual([1, 2, 3]);
  });

  it('undo restores position', () => {
    const node = addNode('Cube');
    const oldPos: Vec3 = [...node.position] as Vec3;
    const cmd = new SetTransformCommand(editor, node.id, 'position', [5, 5, 5], oldPos);
    cmd.execute();
    cmd.undo();
    expect(editor.sceneDocument.getNode(node.id)?.position).toEqual(oldPos);
  });

  // ── rotation ────────────────────────────────────────────────────────────────

  it('execute updates rotation', () => {
    const node = addNode('Cube');
    const newRot: Vec3 = [0.1, 0.2, 0.3];
    const cmd = new SetTransformCommand(editor, node.id, 'rotation', newRot, node.rotation);
    cmd.execute();
    expect(editor.sceneDocument.getNode(node.id)?.rotation).toEqual([0.1, 0.2, 0.3]);
  });

  it('undo restores rotation', () => {
    const node = addNode('Cube');
    const oldRot: Vec3 = [...node.rotation] as Vec3;
    const cmd = new SetTransformCommand(editor, node.id, 'rotation', [1, 1, 1], oldRot);
    cmd.execute();
    cmd.undo();
    expect(editor.sceneDocument.getNode(node.id)?.rotation).toEqual(oldRot);
  });

  // ── scale ───────────────────────────────────────────────────────────────────

  it('execute updates scale', () => {
    const node = addNode('Cube');
    const newScale: Vec3 = [2, 2, 2];
    const cmd = new SetTransformCommand(editor, node.id, 'scale', newScale, node.scale);
    cmd.execute();
    expect(editor.sceneDocument.getNode(node.id)?.scale).toEqual([2, 2, 2]);
  });

  it('undo restores scale', () => {
    const node = addNode('Cube');
    const oldScale: Vec3 = [...node.scale] as Vec3;
    const cmd = new SetTransformCommand(editor, node.id, 'scale', [3, 3, 3], oldScale);
    cmd.execute();
    cmd.undo();
    expect(editor.sceneDocument.getNode(node.id)?.scale).toEqual(oldScale);
  });

  // ── canMerge ────────────────────────────────────────────────────────────────

  it('canMerge returns true for same uuid and same property', () => {
    const node = addNode('Cube');
    const cmd1 = new SetTransformCommand(editor, node.id, 'position', [1, 0, 0], [0, 0, 0]);
    const cmd2 = new SetTransformCommand(editor, node.id, 'position', [2, 0, 0], [1, 0, 0]);
    expect(cmd1.canMerge!(cmd2)).toBe(true);
  });

  it('canMerge returns false for different uuid', () => {
    const node1 = addNode('Cube1');
    const node2 = addNode('Cube2');
    const cmd1 = new SetTransformCommand(editor, node1.id, 'position', [1, 0, 0], [0, 0, 0]);
    const cmd2 = new SetTransformCommand(editor, node2.id, 'position', [2, 0, 0], [0, 0, 0]);
    expect(cmd1.canMerge!(cmd2)).toBe(false);
  });

  it('canMerge returns false for different property', () => {
    const node = addNode('Cube');
    const cmd1 = new SetTransformCommand(editor, node.id, 'position', [1, 0, 0], [0, 0, 0]);
    const cmd2 = new SetTransformCommand(editor, node.id, 'rotation', [1, 0, 0], [0, 0, 0]);
    expect(cmd1.canMerge!(cmd2)).toBe(false);
  });

  // ── update ──────────────────────────────────────────────────────────────────

  it('update overwrites newValue so execute uses the latest value', () => {
    const node = addNode('Cube');
    const cmd1 = new SetTransformCommand(editor, node.id, 'position', [1, 0, 0], [0, 0, 0]);
    const cmd2 = new SetTransformCommand(editor, node.id, 'position', [5, 5, 5], [1, 0, 0]);
    cmd1.update!(cmd2);
    cmd1.execute();
    expect(editor.sceneDocument.getNode(node.id)?.position).toEqual([5, 5, 5]);
  });

  it('update does not mutate the source command newValue', () => {
    const node = addNode('Cube');
    const cmd1 = new SetTransformCommand(editor, node.id, 'position', [1, 0, 0], [0, 0, 0]);
    const cmd2 = new SetTransformCommand(editor, node.id, 'position', [5, 5, 5], [1, 0, 0]);
    cmd1.update!(cmd2);
    // cmd2's newValue should remain [5, 5, 5], unaffected
    cmd2.execute();
    expect(editor.sceneDocument.getNode(node.id)?.position).toEqual([5, 5, 5]);
  });
});
