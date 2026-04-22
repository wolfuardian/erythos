import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadStore, saveStore,
  addWorkspace, deleteWorkspace, renameWorkspace,
  duplicateWorkspace, reorderWorkspace, updateCurrentWorkspace, resetWorkspaceToPreset,
  nextDuplicateName,
  STORAGE_KEY, LEGACY_KEY, LAYOUT_PRESET_ID, DEBUG_PRESET_ID,
  createLayoutPreset,
} from '../workspaceStore';
import type { WorkspaceStore } from '../workspaceStore';

let storage: Record<string, string> = {};
beforeEach(() => {
  storage = {};
  vi.stubGlobal('localStorage', {
    getItem:    (k: string) => storage[k] ?? null,
    setItem:    (k: string, v: string) => { storage[k] = v; },
    removeItem: (k: string) => { delete storage[k]; },
    clear:      () => { storage = {}; },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

it('round-trip: saveStore → loadStore 同值', () => {
  const s = loadStore();
  saveStore(s);
  expect(loadStore()).toEqual(s);
});

it('fresh install: 2 preset，currentId = layout-preset', () => {
  const s = loadStore();
  expect(s.workspaces).toHaveLength(2);
  expect(s.currentWorkspaceId).toBe(LAYOUT_PRESET_ID);
  expect(s.workspaces[0].id).toBe(LAYOUT_PRESET_ID);
  expect(s.workspaces[1].id).toBe(DEBUG_PRESET_ID);
});

it('migration: 舊 key 強硬 reset → 2 preset workspace，舊 key 被刪', async () => {
  const { validateTree } = await import('../areaTree');
  const oldGrid = { panels: ['a', 'b'] };
  storage[LEGACY_KEY] = JSON.stringify({ grid: oldGrid, editorTypes: { p1: 'viewport' } });
  const s = loadStore();
  expect(s.workspaces).toHaveLength(2);
  expect(s.workspaces[0].id).toBe(LAYOUT_PRESET_ID);
  expect(validateTree(s.workspaces[0].grid)).toBe(true);
  expect(s.workspaces[0].editorTypes).toMatchObject({
    'scene-tree': 'scene-tree',
    viewport: 'viewport',
    properties: 'properties',
  });
  expect(s.workspaces[1].id).toBe(DEBUG_PRESET_ID);
  expect(validateTree(s.workspaces[1].grid)).toBe(true);
  expect(storage[LEGACY_KEY]).toBeUndefined();
});

it('corruption fallback: 壞字串 → 產生 2 preset', () => {
  storage[STORAGE_KEY] = 'NOT_JSON{{{';
  const s = loadStore();
  expect(s.workspaces).toHaveLength(2);
  expect(s.currentWorkspaceId).toBe(LAYOUT_PRESET_ID);
});

it('add: count +1, newId === currentId, grid 深複製', () => {
  const s0 = loadStore();
  const s1 = addWorkspace(s0);
  expect(s1.workspaces).toHaveLength(3);
  expect(s1.currentWorkspaceId).toBe(s1.workspaces[2].id);
  const newGrid = s1.workspaces[2].grid as Record<string, unknown>;
  newGrid['x'] = 99;
  expect((s0.workspaces[0].grid as Record<string, unknown>)['x']).toBeUndefined();
});

it('delete: 正常刪 → 陣列 -1', () => {
  const s0 = addWorkspace(loadStore());
  expect(deleteWorkspace(s0, s0.workspaces[2].id).workspaces).toHaveLength(2);
});

it('delete: 刪當前 → currentId 校正到左鄰居', () => {
  const s0 = addWorkspace(loadStore());
  const newId = s0.workspaces[2].id;
  const s1 = deleteWorkspace(s0, newId);
  expect(s1.currentWorkspaceId).toBe(s0.workspaces[1].id);
});

it('delete: 刪最後一個 → 回原 store', () => {
  const single: WorkspaceStore = {
    version: 1,
    currentWorkspaceId: LAYOUT_PRESET_ID,
    workspaces: [createLayoutPreset()],
  };
  expect(deleteWorkspace(single, LAYOUT_PRESET_ID)).toBe(single);
});

it('rename: name 變、其他 workspace 不變', () => {
  const s0 = loadStore();
  const s1 = renameWorkspace(s0, LAYOUT_PRESET_ID, 'MyLayout');
  expect(s1.workspaces[0].name).toBe('MyLayout');
  expect(s1.workspaces[1]).toBe(s0.workspaces[1]);
});

it('duplicate: count +1, currentId 不變', () => {
  const s0 = loadStore();
  const s1 = duplicateWorkspace(s0, LAYOUT_PRESET_ID);
  expect(s1.workspaces).toHaveLength(3);
  expect(s1.currentWorkspaceId).toBe(s0.currentWorkspaceId);
});

it('reorder: 陣列順序變、currentId 不變', () => {
  const s0 = loadStore();
  const s1 = reorderWorkspace(s0, 0, 1);
  expect(s1.workspaces[0].id).toBe(DEBUG_PRESET_ID);
  expect(s1.workspaces[1].id).toBe(LAYOUT_PRESET_ID);
  expect(s1.currentWorkspaceId).toBe(s0.currentWorkspaceId);
});

it('updateCurrentWorkspace: 只改 current，其他 workspace 不變', () => {
  const s0 = loadStore();
  const s1 = updateCurrentWorkspace(s0, { grid: { panels: ['x'] } });
  expect((s1.workspaces[0].grid as { panels: string[] }).panels).toEqual(['x']);
  expect(s1.workspaces[1]).toBe(s0.workspaces[1]);
});

it('reset preset: grid/editorTypes 回預設、name 保留', async () => {
  const { validateTree, createLayoutPresetTree } = await import('../areaTree');
  const s0 = renameWorkspace(
    updateCurrentWorkspace(loadStore(), { grid: { x: 1 }, editorTypes: { p: 'v' } }),
    LAYOUT_PRESET_ID, 'MyName'
  );
  const s1 = resetWorkspaceToPreset(s0, LAYOUT_PRESET_ID);
  expect(s1.workspaces[0].name).toBe('MyName');
  expect(validateTree(s1.workspaces[0].grid)).toBe(true);
  expect(s1.workspaces[0].grid).toEqual(createLayoutPresetTree());
  expect(s1.workspaces[0].editorTypes).toEqual({
    'scene-tree': 'scene-tree',
    viewport: 'viewport',
    properties: 'properties',
  });
});

it('reset 自建 id → 回原 store', () => {
  const s0 = addWorkspace(loadStore());
  const customId = s0.workspaces[2].id;
  expect(resetWorkspaceToPreset(s0, customId)).toBe(s0);
});

it('nextDuplicateName: Layout → Layout.001', () => {
  expect(nextDuplicateName(['Layout'], 'Layout')).toBe('Layout.001');
});
it('nextDuplicateName: Layout + Layout.001 → Layout.002', () => {
  expect(nextDuplicateName(['Layout', 'Layout.001'], 'Layout')).toBe('Layout.002');
});
it('nextDuplicateName: base=Layout.001，root 是 Layout', () => {
  expect(nextDuplicateName(['Layout', 'Layout.001'], 'Layout.001')).toBe('Layout.002');
});
