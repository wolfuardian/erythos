# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #512: workspaceStore 純函式 + migration + vitest

**Branch**: `feat/512-workspace-store`
**Commit prefix**: `[app]`

新增兩檔：`src/app/workspaceStore.ts`（store 邏輯）+ `src/app/__tests__/workspaceStore.test.ts`（vitest）。不修改任何現有檔案。

### 檔案 1：`src/app/workspaceStore.ts`（整檔新增）

```ts
import { createSignal } from 'solid-js';
import { generateUUID } from '../utils/uuid';

export interface Workspace {
  id: string;
  name: string;
  grid: unknown;                       // Dockview toJSON()
  editorTypes: Record<string, string>; // panelId → editorType
}

export interface WorkspaceStore {
  version: 1;
  currentWorkspaceId: string;
  workspaces: Workspace[];
}

export const STORAGE_KEY = 'erythos-workspaces-v1';
export const LEGACY_KEY  = 'erythos-layout-v2';

export const LAYOUT_PRESET_ID = 'layout-preset';
export const DEBUG_PRESET_ID  = 'debug-preset';

// ── Presets ────────────────────────────────────────────────────────────
export function createLayoutPreset(): Workspace {
  return { id: LAYOUT_PRESET_ID, name: 'Layout', grid: {}, editorTypes: {} };
}
export function createDebugPreset(): Workspace {
  return { id: DEBUG_PRESET_ID, name: 'Debug', grid: {}, editorTypes: {} };
}
export function isPresetId(id: string): boolean {
  return id === LAYOUT_PRESET_ID || id === DEBUG_PRESET_ID;
}

// ── Name helper（export 供測試直接呼叫）───────────────────────────────
export function nextDuplicateName(existing: string[], base: string): string {
  const root = base.replace(/\.\d{3}$/, '');
  for (let n = 1; n <= 999; n++) {
    const candidate = `${root}.${String(n).padStart(3, '0')}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${root}.${generateUUID().slice(0, 8)}`;
}

// ── Pure functions ─────────────────────────────────────────────────────
export function loadStore(): WorkspaceStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceStore;
      if (
        parsed.version === 1 &&
        typeof parsed.currentWorkspaceId === 'string' &&
        Array.isArray(parsed.workspaces) &&
        parsed.workspaces.length > 0
      ) {
        const ids = parsed.workspaces.map(w => w.id);
        if (!ids.includes(parsed.currentWorkspaceId)) {
          parsed.currentWorkspaceId = ids[0];
        }
        return parsed;
      }
    }
  } catch { /* fall through */ }

  // Migration from legacy key
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { grid?: unknown; editorTypes?: Record<string, string> };
      const layoutWorkspace: Workspace = {
        ...createLayoutPreset(),
        grid: legacy.grid ?? {},
        editorTypes: legacy.editorTypes ?? {},
      };
      const store: WorkspaceStore = {
        version: 1,
        currentWorkspaceId: LAYOUT_PRESET_ID,
        workspaces: [layoutWorkspace, createDebugPreset()],
      };
      saveStore(store);
      localStorage.removeItem(LEGACY_KEY);
      return store;
    }
  } catch { /* fall through */ }

  // Fresh install
  const fresh: WorkspaceStore = {
    version: 1,
    currentWorkspaceId: LAYOUT_PRESET_ID,
    workspaces: [createLayoutPreset(), createDebugPreset()],
  };
  saveStore(fresh);
  return fresh;
}

export function saveStore(store: WorkspaceStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* quota exceeded — ignore */ }
}

export function setCurrent(s: WorkspaceStore, id: string): WorkspaceStore {
  return { ...s, currentWorkspaceId: id };
}

export function addWorkspace(s: WorkspaceStore, baseId?: string): WorkspaceStore {
  const base = s.workspaces.find(w => w.id === (baseId ?? s.currentWorkspaceId)) ?? s.workspaces[0];
  const names = s.workspaces.map(w => w.name);
  const newW: Workspace = {
    id: generateUUID(),
    name: nextDuplicateName(names, base.name),
    grid: JSON.parse(JSON.stringify(base.grid)),
    editorTypes: JSON.parse(JSON.stringify(base.editorTypes)),
  };
  return { ...s, currentWorkspaceId: newW.id, workspaces: [...s.workspaces, newW] };
}

export function deleteWorkspace(s: WorkspaceStore, id: string): WorkspaceStore {
  if (s.workspaces.length === 1) return s;
  const idx = s.workspaces.findIndex(w => w.id === id);
  if (idx === -1) return s;
  const next = s.workspaces.filter(w => w.id !== id);
  let nextCurrent = s.currentWorkspaceId;
  if (nextCurrent === id) {
    nextCurrent = (next[idx - 1] ?? next[idx])!.id;
  }
  return { ...s, currentWorkspaceId: nextCurrent, workspaces: next };
}

export function renameWorkspace(s: WorkspaceStore, id: string, name: string): WorkspaceStore {
  return { ...s, workspaces: s.workspaces.map(w => w.id === id ? { ...w, name } : w) };
}

export function duplicateWorkspace(s: WorkspaceStore, id: string): WorkspaceStore {
  const base = s.workspaces.find(w => w.id === id);
  if (!base) return s;
  const names = s.workspaces.map(w => w.name);
  const newW: Workspace = {
    id: generateUUID(),
    name: nextDuplicateName(names, base.name),
    grid: JSON.parse(JSON.stringify(base.grid)),
    editorTypes: JSON.parse(JSON.stringify(base.editorTypes)),
  };
  return { ...s, workspaces: [...s.workspaces, newW] }; // currentId 不變
}

export function reorderWorkspace(s: WorkspaceStore, fromIdx: number, toIdx: number): WorkspaceStore {
  const ws = [...s.workspaces];
  const [moved] = ws.splice(fromIdx, 1);
  ws.splice(toIdx, 0, moved);
  return { ...s, workspaces: ws };
}

export function updateCurrentWorkspace(
  s: WorkspaceStore,
  patch: Partial<Pick<Workspace, 'grid' | 'editorTypes'>>
): WorkspaceStore {
  return {
    ...s,
    workspaces: s.workspaces.map(w => w.id === s.currentWorkspaceId ? { ...w, ...patch } : w),
  };
}

export function resetWorkspaceToPreset(s: WorkspaceStore, id: string): WorkspaceStore {
  if (!isPresetId(id)) return s;
  const preset = id === LAYOUT_PRESET_ID ? createLayoutPreset() : createDebugPreset();
  return {
    ...s,
    workspaces: s.workspaces.map(w => w.id === id ? { ...preset, name: w.name } : w),
  };
}

// ── Signal wrapper ─────────────────────────────────────────────────────
const [store, setStore] = createSignal<WorkspaceStore>(loadStore());
export { store };

export function mutate(fn: (s: WorkspaceStore) => WorkspaceStore): void {
  const next = fn(store());
  setStore(next);
  saveStore(next);
}

export function currentWorkspace(): Workspace {
  const s = store();
  return s.workspaces.find(w => w.id === s.currentWorkspaceId) ?? s.workspaces[0];
}
```

### 檔案 2：`src/app/__tests__/workspaceStore.test.ts`（整檔新增）

```ts
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

it('migration: 舊 key → 2 workspace，Layout 含舊 grid，舊 key 被刪', () => {
  const oldGrid = { panels: ['a', 'b'] };
  storage[LEGACY_KEY] = JSON.stringify({ grid: oldGrid, editorTypes: { p1: 'viewport' } });
  const s = loadStore();
  expect(s.workspaces).toHaveLength(2);
  expect(s.workspaces[0].id).toBe(LAYOUT_PRESET_ID);
  expect(s.workspaces[0].grid).toEqual(oldGrid);
  expect(s.workspaces[0].editorTypes).toEqual({ p1: 'viewport' });
  expect(s.workspaces[1].id).toBe(DEBUG_PRESET_ID);
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

it('reset preset: grid/editorTypes 回預設、name 保留', () => {
  const s0 = renameWorkspace(
    updateCurrentWorkspace(loadStore(), { grid: { x: 1 }, editorTypes: { p: 'v' } }),
    LAYOUT_PRESET_ID, 'MyName'
  );
  const s1 = resetWorkspaceToPreset(s0, LAYOUT_PRESET_ID);
  expect(s1.workspaces[0].name).toBe('MyName');
  expect(s1.workspaces[0].grid).toEqual({});
  expect(s1.workspaces[0].editorTypes).toEqual({});
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
```

### 測試地雷警告

`src/app/workspaceStore.ts` module 頂層 `createSignal<WorkspaceStore>(loadStore())` 會在 **import 時**執行一次 `loadStore()`，signal 初始值固化在 import 時刻（早於 `beforeEach` 的 localStorage mock）。所以測試**必須直接呼叫 `loadStore()` 純函式**，不要讀 `store()` signal。

### 不要做的事

- 不修改 `src/app/editorTypeStore.ts`（Task 3 才刪）
- 不修改 `src/app/layout/*` / `src/app/App.tsx` / `src/app/AreaShell.tsx`
- 不修改 `src/panels/` 任何檔案
- `nextDuplicateName` 必須 export（測試直接呼叫）
- `STORAGE_KEY` / `LEGACY_KEY` 必須 export

### Build / Test 驗收

```bash
npm run build
npm run test -- workspaceStore
```

### Commit（開 PR 前先還原 CLAUDE.md）

```bash
git checkout HEAD -- src/app/CLAUDE.md
git add src/app/workspaceStore.ts src/app/__tests__/workspaceStore.test.ts
git commit -m "[app] workspaceStore 純函式 + migration + vitest (refs #512)"
```

### PR

```bash
gh pr create --base master --head feat/512-workspace-store \
  --title "[app] Wave 2-1: workspaceStore 純函式 + migration + vitest (refs #512)" \
  --body "## Summary
新增 workspaceStore：純函式 API + Solid signal wrapper + migration + vitest。

## Changes
- Create \`src/app/workspaceStore.ts\`
- Create \`src/app/__tests__/workspaceStore.test.ts\`

## Test plan
- [ ] npm run build 過
- [ ] npm run test -- workspaceStore 全過

refs #512"
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
