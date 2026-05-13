import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Editor } from '../Editor';
import { SetMaterialPropertyCommand } from '../commands/SetMaterialPropertyCommand';
import type { MaterialOverride } from '../scene/SceneFormat';
import { LocalProjectManager as ProjectManager } from '../project/LocalProjectManager';
import type { NodeUUID } from '../../utils/branded';

describe('SetMaterialPropertyCommand', () => {
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

  function addNodeWithMaterial(name: string, mat: MaterialOverride) {
    const node = editor.sceneDocument.createNode(name);
    node.nodeType = 'mesh';
    node.asset = 'project://primitives/box';
    node.mat = mat;
    editor.sceneDocument.addNode(node);
    return editor.sceneDocument.getNode(node.id)!;
  }

  function getMaterial(id: NodeUUID) {
    return editor.sceneDocument.getNode(id)?.mat as MaterialOverride;
  }

  // ── color ────────────────────────────────────────────────────────────────

  it('execute updates color', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'color', 0xff0000, 0xffffff));
    expect(getMaterial(node.id).color).toBe(0xff0000);
  });

  it('undo restores color', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'color', 0xff0000, 0xffffff));
    editor.undo();
    expect(getMaterial(node.id).color).toBe(0xffffff);
  });

  // ── roughness ────────────────────────────────────────────────────────────

  it('execute updates roughness', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff, roughness: 1 });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'roughness', 0.3, 1));
    expect(getMaterial(node.id).roughness).toBe(0.3);
  });

  it('undo restores roughness', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff, roughness: 1 });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'roughness', 0.3, 1));
    editor.undo();
    expect(getMaterial(node.id).roughness).toBe(1);
  });

  // ── boolean fields ───────────────────────────────────────────────────────

  it('execute toggles transparent', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff, transparent: false });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'transparent', true, false));
    expect(getMaterial(node.id).transparent).toBe(true);
  });

  it('undo restores transparent', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff, transparent: false });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'transparent', true, false));
    editor.undo();
    expect(getMaterial(node.id).transparent).toBe(false);
  });

  // ── does not drop nodeType/asset alongside mat ────────────────────────────

  it('execute preserves nodeType and asset alongside material', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'color', 0x123456, 0xffffff));
    const updated = editor.sceneDocument.getNode(node.id)!;
    expect(updated.nodeType).toBe('mesh');
    expect(updated.asset).toBe('project://primitives/box');
    expect(updated.mat?.color).toBe(0x123456);
  });

  // ── canMerge ─────────────────────────────────────────────────────────────

  it('canMerge returns true for same uuid and same property', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff });
    const cmd1 = new SetMaterialPropertyCommand(editor, node.id, 'color', 0xff0000, 0xffffff);
    const cmd2 = new SetMaterialPropertyCommand(editor, node.id, 'color', 0x00ff00, 0xff0000);
    expect(cmd1.canMerge!(cmd2)).toBe(true);
  });

  it('canMerge returns false for different uuid', () => {
    const n1 = addNodeWithMaterial('Box1', { color: 0xffffff });
    const n2 = addNodeWithMaterial('Box2', { color: 0xffffff });
    const cmd1 = new SetMaterialPropertyCommand(editor, n1.id, 'color', 0xff0000, 0xffffff);
    const cmd2 = new SetMaterialPropertyCommand(editor, n2.id, 'color', 0xff0000, 0xffffff);
    expect(cmd1.canMerge!(cmd2)).toBe(false);
  });

  it('canMerge returns false for different property', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff, roughness: 1 });
    const cmd1 = new SetMaterialPropertyCommand(editor, node.id, 'color', 0xff0000, 0xffffff);
    const cmd2 = new SetMaterialPropertyCommand(editor, node.id, 'roughness', 0.5, 1);
    expect(cmd1.canMerge!(cmd2)).toBe(false);
  });

  // ── update (merge) ───────────────────────────────────────────────────────

  it('update overwrites newValue so merged command uses latest value', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff });
    const cmd1 = new SetMaterialPropertyCommand(editor, node.id, 'color', 0xff0000, 0xffffff);
    const cmd2 = new SetMaterialPropertyCommand(editor, node.id, 'color', 0x0000ff, 0xff0000);
    cmd1.update!(cmd2);
    cmd1.execute();
    expect(getMaterial(node.id).color).toBe(0x0000ff);
  });

  it('undo after merge restores original oldValue', () => {
    const node = addNodeWithMaterial('Box', { color: 0xffffff });
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'color', 0xff0000, 0xffffff));
    // second execute merges (updatable=true, same uuid+prop)
    editor.execute(new SetMaterialPropertyCommand(editor, node.id, 'color', 0x0000ff, 0xff0000));
    editor.undo();
    expect(getMaterial(node.id).color).toBe(0xffffff);
  });
});
