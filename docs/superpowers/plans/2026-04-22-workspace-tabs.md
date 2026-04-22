# Workspace Tabs Implementation Plan

> **Execution Note:** This project uses its own AT/AD/QC pipeline (see root `CLAUDE.md`). Each Task below maps to one GitHub issue. AH dispatches AT → AT writes `src/app/CLAUDE.md` 當前任務 block → AD implements → QC reviews. Steps inside each task are guidance for AT; AT may further split into AD steps.

**Goal:** 在 Erythos 頂層加 Workspace tabs（Blender 風），每個 workspace 持一份 Area 佈局快照。

**Architecture:** 單一 Dockview 實例 + `api.clear()` + `fromJSON()` 換骨策略。Workspace state 集中在 `workspaceStore.ts`，Solid signal 訂閱。viewport camera 位置跨 workspace 共用（module-level Map，非 localStorage）。

**Tech Stack:** TypeScript strict + SolidJS + Dockview + vitest。

**Spec reference:** `docs/superpowers/specs/2026-04-22-workspace-tabs-design.md`

---

## File Structure

**新增**：
- `src/app/workspaceStore.ts` — 純函式 API + Solid signal 包裝
- `src/app/__tests__/workspaceStore.test.ts` — vitest
- `src/app/layout/WorkspaceTabBar.tsx` — tab 列 UI
- `src/app/layout/WorkspaceTab.tsx` — 單 tab 組件（含改名 / 右鍵 / drag）
- `src/app/viewportState.ts` — Viewport camera snapshot store

**修改**：
- `src/app/layout/DockLayout.tsx` — 串 workspaceStore，切 workspace 時 clear + apply
- `src/app/AreaShell.tsx` — setEditorType 改呼 workspaceStore
- `src/app/App.tsx` — 插入 `<WorkspaceTabBar />` 於 Toolbar 與 DockLayout 之間
- `src/panels/viewport/ViewportPanel.tsx` — mount/unmount 串 viewportState

**刪除 / 改名**：
- 刪 `src/app/editorTypeStore.ts`（併入 workspaceStore）
- `src/app/layout/defaultLayout.ts` → 改名 `workspaceLayout.ts`

---

## Task 1: workspaceStore + 測試 + migration

**GitHub issue**: `[app] Wave 2-1: workspaceStore 純函式 + migration + vitest`

**Files:**
- Create: `src/app/workspaceStore.ts`
- Create: `src/app/__tests__/workspaceStore.test.ts`

**Depends on:** 無
**Blocks:** Task 2, 3, 4, 7

### Types 與 API 骨幹

```ts
// src/app/workspaceStore.ts
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

const STORAGE_KEY = 'erythos-workspaces-v1';
const LEGACY_KEY = 'erythos-layout-v2';

export const LAYOUT_PRESET_ID = 'layout-preset';
export const DEBUG_PRESET_ID = 'debug-preset';

// ── Preset ─────────────────────────────────────────────────────────────
export function createLayoutPreset(): Workspace { /* 見 Step 實作 */ }
export function createDebugPreset(): Workspace { /* 見 Step 實作 */ }
export function isPresetId(id: string): boolean {
  return id === LAYOUT_PRESET_ID || id === DEBUG_PRESET_ID;
}

// ── Pure functions（不可變更新）───────────────────────────────────────
export function loadStore(): WorkspaceStore;       // migration + preset init + corruption fallback
export function saveStore(store: WorkspaceStore): void;  // try/catch
export function setCurrent(s: WorkspaceStore, id: string): WorkspaceStore;
export function addWorkspace(s: WorkspaceStore, baseId?: string): WorkspaceStore;
export function deleteWorkspace(s: WorkspaceStore, id: string): WorkspaceStore;  // 最後一個拒絕 → 回傳原 s
export function renameWorkspace(s: WorkspaceStore, id: string, name: string): WorkspaceStore;
export function duplicateWorkspace(s: WorkspaceStore, id: string): WorkspaceStore;  // 不改 current
export function reorderWorkspace(s: WorkspaceStore, fromIdx: number, toIdx: number): WorkspaceStore;
export function updateCurrentWorkspace(
  s: WorkspaceStore,
  patch: Partial<Pick<Workspace, 'grid' | 'editorTypes'>>
): WorkspaceStore;
export function resetWorkspaceToPreset(s: WorkspaceStore, id: string): WorkspaceStore;  // 只對 preset id 有效

// ── Signal wrapper ─────────────────────────────────────────────────────
const [store, setStore] = createSignal<WorkspaceStore>(loadStore());
export { store };
export function mutate(fn: (s: WorkspaceStore) => WorkspaceStore): void {
  const next = fn(store());
  setStore(next);
  saveStore(next);
}

// ── Convenience readers ────────────────────────────────────────────────
export function currentWorkspace(): Workspace {
  const s = store();
  return s.workspaces.find(w => w.id === s.currentWorkspaceId) ?? s.workspaces[0];
}
```

### Steps

- [ ] **Step 1.1**: 寫 `createLayoutPreset()` / `createDebugPreset()`。`grid` 先放 placeholder（空物件 `{}`）— 真正的 grid 在 Task 3 從 Dockview `api.toJSON()` 取樣後填入常數。本 task 只要測 shape。
- [ ] **Step 1.2**: 寫 `loadStore()`，先處理三路：新 key 讀出 → 校正 currentWorkspaceId / workspaces 不為空；新 key 無 + 舊 key 有 → migration（舊 grid + editorTypes 包成 Layout preset，補建 Debug preset，currentId = layout-preset，寫新 key 刪舊 key）；皆無 → 建兩 preset，currentId = layout-preset
- [ ] **Step 1.3**: 寫純函式 mutation（`setCurrent / add / delete / rename / duplicate / reorder / updateCurrentWorkspace / resetWorkspaceToPreset`）
  - `addWorkspace`：baseId 省略用 current；複製 grid + editorTypes（deep clone，用 `JSON.parse(JSON.stringify(...))`）；name 規則 = baseName + `.NNN`（見 Step 1.4）；新 id 用 `generateUUID()`；setCurrent 到新 id
  - `deleteWorkspace`：若 `s.workspaces.length === 1` 回傳原 s；若刪的是 current → currentId 改為左鄰居（無則右鄰居）
  - `duplicateWorkspace`：同 add 但不改 current
  - `reorderWorkspace`：陣列 splice 搬動
  - `updateCurrentWorkspace`：merge patch 到 current workspace
  - `resetWorkspaceToPreset`：若 `!isPresetId(id)` 回原 s；否則該 workspace 重寫為 preset 值但保留 `name`
- [ ] **Step 1.4**: 寫 name 遞增規則 `nextDuplicateName(existing: string[], base: string)`：若 base 叫 `Foo` → 找未占 `Foo.NNN` 的最小數（`.001` 起）。若 base 本身已含 `.NNN` 後綴 → 取 root 重算。例：
  - `Layout` 存在 → 新建名為 `Layout.001`
  - `Layout`, `Layout.001` 存在 → 新建名為 `Layout.002`
  - base = `Layout.001` → root 是 `Layout`；若 `.001` 已占 → 找 `.002`
- [ ] **Step 1.5**: 寫 `saveStore()` — try/catch，quota 爆吞錯
- [ ] **Step 1.6**: 寫 vitest 測試
  - round-trip：`saveStore` → `loadStore` 同值
  - migration：localStorage 放舊 key → `loadStore` 產生 2 workspace（Layout 含舊 grid、Debug preset）、舊 key 被刪
  - corruption fallback：舊 key 放爛字串 → `loadStore` 產生 2 preset
  - add：count +1、newId === currentId、grid 深複製（改新 grid 不影響 base）
  - delete：正常刪 → 陣列 -1；刪當前 → currentId 校正到鄰居；刪最後一個 → 回原 store
  - rename：name 變、其他不變
  - duplicate：count +1、currentId 不變
  - reorder：陣列順序變、currentId 不變
  - updateCurrentWorkspace：只改 current、其他 workspace 不變
  - resetWorkspaceToPreset：preset id → grid/editorTypes 回預設、name 保留；自建 id → 回原 store
  - nextDuplicateName 規則（見 Step 1.4 例）
  - Mock `localStorage`（vitest 內用 `beforeEach` 建 in-memory mock）
- [ ] **Step 1.7**: `npm run build` 過；`npm run test -- workspaceStore` 全過
- [ ] **Step 1.8**: Commit + PR

**Commit message**:
```
[app] workspaceStore 純函式 + migration + vitest (refs #<issue>)
```

---

## Task 2: viewportState 模組

**GitHub issue**: `[app] Wave 2-2: viewportState camera snapshot 模組`

**Files:**
- Create: `src/app/viewportState.ts`
- Modify: `src/panels/viewport/ViewportPanel.tsx`（mount restore、unmount save）

**Depends on:** 無（可與 Task 1 並行）
**Blocks:** Task 3

### Types 與 API

```ts
// src/app/viewportState.ts
export interface ViewportSnapshot {
  position: [number, number, number];
  target: [number, number, number];
}

const SNAPSHOTS = new Map<string, ViewportSnapshot>();

export function getSnapshot(panelId: string): ViewportSnapshot | undefined {
  return SNAPSHOTS.get(panelId);
}

export function setSnapshot(panelId: string, snap: ViewportSnapshot): void {
  SNAPSHOTS.set(panelId, snap);
}

export function clearSnapshot(panelId: string): void {
  SNAPSHOTS.delete(panelId);
}
```

### Steps

- [ ] **Step 2.1**: 建 `viewportState.ts`，API 如上
- [ ] **Step 2.2**: 在 `ViewportPanel.tsx` 找 `viewport = new Viewport(...)` 位置（line ~188），取得當前 `panel.id`（透過 AreaContext）
- [ ] **Step 2.3**: mount 後若有 snapshot → `viewport.cameraCtrl.camera.position.set(...)` + `viewport.cameraCtrl.controls.target.set(...)` + `controls.update()`
- [ ] **Step 2.4**: onCleanup（line ~382）前 read `camera.position.toArray()` + `controls.target.toArray()`，`setSnapshot(panelId, {...})`
- [ ] **Step 2.5**: 手動測：開 viewport → 拖動 camera → F12 觀察 snapshot；切 editor type 離開 → 切回 viewport → camera 位置保留
- [ ] **Step 2.6**: `npm run build` 過
- [ ] **Step 2.7**: Commit + PR

**不寫測試**：DOM + WebGL 互動，現有 infra 無覆蓋。靠手動 QA + `role-pr-qc` diff。

---

## Task 3: DockLayout + AreaShell 串 workspaceStore

**GitHub issue**: `[app] Wave 2-3: DockLayout / AreaShell 串 workspaceStore（切 workspace 真換畫面）`

**Files:**
- Modify: `src/app/layout/DockLayout.tsx`
- Modify: `src/app/AreaShell.tsx`
- Modify: `src/app/App.tsx`
- Rename + rewrite: `src/app/layout/defaultLayout.ts` → `src/app/layout/workspaceLayout.ts`
- Delete: `src/app/editorTypeStore.ts`

**Depends on:** Task 1, Task 2
**Blocks:** Task 4

### 新 `workspaceLayout.ts`

```ts
import type { DockviewApi } from 'dockview-core';
import type { Workspace } from '../workspaceStore';

export function applyWorkspace(api: DockviewApi, workspace: Workspace): void {
  if (workspace.grid && typeof workspace.grid === 'object' && Object.keys(workspace.grid as object).length > 0) {
    try {
      api.fromJSON(workspace.grid as never);
      return;
    } catch {
      // fall through to preset-aware fallback
    }
  }
  // Preset 無 grid（首次 preset 建立，grid 為空）→ 套固定初始佈局
  applyPresetFallback(api, workspace.id);
}

function applyPresetFallback(api: DockviewApi, workspaceId: string): void {
  // LAYOUT_PRESET_ID / DEBUG_PRESET_ID 各自一套 api.addPanel 呼叫
  // 自建 workspace 走到此分支 → 建空白單 viewport
}
```

### 新 `DockLayout.tsx` 骨幹

```tsx
import { onMount, onCleanup, createEffect, type Component } from 'solid-js';
import { createDockview, type PanelComponent, type DockviewApi } from './solid-dockview';
import { applyWorkspace } from './workspaceLayout';
import { store, currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';

const DEBOUNCE_MS = 300;

const DockLayout: Component<{ components: Record<string, PanelComponent> }> = (props) => {
  let containerRef!: HTMLDivElement;
  let api: DockviewApi;
  let saveTimer: number | undefined;

  const scheduleSave = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!api) return;
      mutate(s => updateCurrentWorkspace(s, {
        grid: api.toJSON(),
        editorTypes: collectEditorTypes(api),
      }));
    }, DEBOUNCE_MS);
  };

  onMount(() => {
    api = createDockview({ parentElement: containerRef, components: props.components });
    applyWorkspace(api, currentWorkspace());

    const disposeLayout = api.onDidLayoutChange(scheduleSave);

    // 切 workspace → clear + apply
    let lastId = store().currentWorkspaceId;
    const stopEffect = createEffect(() => {
      const s = store();
      if (s.currentWorkspaceId !== lastId) {
        lastId = s.currentWorkspaceId;
        api.clear();
        applyWorkspace(api, currentWorkspace());
      }
    });

    onCleanup(() => {
      window.clearTimeout(saveTimer);
      disposeLayout.dispose();
      api.dispose();
    });
  });

  return <div ref={containerRef} class="erythos-dock" style={{ width: '100%', height: '100%', overflow: 'hidden' }} />;
};
```

### AreaShell 改動

```tsx
// AreaShell.tsx
// 原本 setType 呼 editorTypeStore.setEditorType
// 改呼 mutate(s => updateCurrentWorkspace(s, { editorTypes: { ...s.workspaces.find(w=>w.id===s.currentWorkspaceId)!.editorTypes, [panelId]: nextId }}))
// 讀 initial 值：currentWorkspace().editorTypes[panel.id] ?? props.initialEditorType
```

### Steps

- [ ] **Step 3.1**: 建 `workspaceLayout.ts`。`applyPresetFallback` 內容 = 從原 `defaultLayout.ts` 移過來，但按 workspace id 分支（Layout = 現有 3 欄、Debug = viewport + environment 右 300 + leaf 底 200、自建 = 單 viewport）
- [ ] **Step 3.2**: 改 `DockLayout.tsx` 按上方骨幹重寫
- [ ] **Step 3.3**: 改 `AreaShell.tsx` 改讀寫走 workspaceStore
- [ ] **Step 3.4**: 刪 `editorTypeStore.ts`
- [ ] **Step 3.5**: 刪 `defaultLayout.ts`（被 workspaceLayout 取代）
- [ ] **Step 3.6**: 搜全專案 import 殘餘引用：`grep -rn "editorTypeStore\|defaultLayout" src/`，修掉
- [ ] **Step 3.7**: `npm run build` 過
- [ ] **Step 3.8**: 手動 QA：首次開啟 → 看到 Layout preset 的 3 欄；F12 改 `workspaceStore` signal 的 currentWorkspaceId 為 `debug-preset` → 畫面應切到 Debug 佈局
- [ ] **Step 3.9**: Commit + PR

---

## Task 4: WorkspaceTabBar 基本切換 + 新增

**GitHub issue**: `[app] Wave 2-4: WorkspaceTabBar 切換 + 新增`

**Files:**
- Create: `src/app/layout/WorkspaceTabBar.tsx`
- Create: `src/app/layout/WorkspaceTab.tsx`
- Modify: `src/app/App.tsx`（插入 `<WorkspaceTabBar />`）

**Depends on:** Task 3
**Blocks:** Task 5

### TabBar 骨幹

```tsx
// WorkspaceTabBar.tsx
import { For, type Component } from 'solid-js';
import { store, mutate, addWorkspace } from '../workspaceStore';
import { WorkspaceTab } from './WorkspaceTab';

export const WorkspaceTabBar: Component = () => {
  return (
    <div style={{
      display: 'flex',
      height: 'var(--workspace-tab-height, 32px)',
      background: 'var(--bg-header)',
      'border-bottom': '1px solid var(--border-subtle)',
      'align-items': 'center',
    }}>
      <For each={store().workspaces}>
        {(w) => <WorkspaceTab workspace={w} />}
      </For>
      <button
        onClick={() => mutate(s => addWorkspace(s))}
        style={{
          padding: '0 var(--space-md)',
          background: 'transparent',
          color: 'var(--text-muted)',
          border: 'none',
          cursor: 'pointer',
          'font-size': 'var(--font-size-md)',
        }}
        title="Duplicate current workspace"
      >
        +
      </button>
    </div>
  );
};
```

### Tab 骨幹（Task 4 只做切換；改名 / 刪除 / 右鍵留 Task 5）

```tsx
// WorkspaceTab.tsx
import { type Component } from 'solid-js';
import { store, mutate, setCurrent } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

interface Props { workspace: Workspace }

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;

  return (
    <div
      onClick={() => mutate(s => setCurrent(s, props.workspace.id))}
      style={{
        padding: '0 var(--space-md)',
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        cursor: 'pointer',
        color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive() ? 'var(--bg-app)' : 'transparent',
        'border-bottom': isActive() ? '2px solid var(--accent-blue)' : '2px solid transparent',
        'user-select': 'none',
      }}
    >
      {props.workspace.name}
    </div>
  );
};
```

### App.tsx 改動

```tsx
// 在 <Toolbar /> 與 DockLayout 容器之間插：
<WorkspaceTabBar />
```

### Steps

- [ ] **Step 4.1**: 建 `WorkspaceTab.tsx`（只做切換，樣式照 design spec、顏色用 CSS 變數）
- [ ] **Step 4.2**: 建 `WorkspaceTabBar.tsx`（含 `+` button 呼 addWorkspace）
- [ ] **Step 4.3**: 改 `App.tsx` 插入 `<WorkspaceTabBar />`
- [ ] **Step 4.4**: `npm run build` 過
- [ ] **Step 4.5**: 手動 QA：點 `Debug` tab → 畫面換佈局；點 `+` → 新 tab，name = `Layout.001`（若從 Layout 複製）、畫面換成 Layout preset 的副本；連 `+` 幾次 → name 遞增正確
- [ ] **Step 4.6**: Commit + PR

---

## Task 5: Context menu（rename / delete / duplicate / reset）

**GitHub issue**: `[app] Wave 2-5: WorkspaceTab context menu + 雙擊改名`

**Files:**
- Modify: `src/app/layout/WorkspaceTab.tsx`
- Create: `src/app/layout/WorkspaceContextMenu.tsx`

**Depends on:** Task 4
**Blocks:** Task 6

### Context menu 骨幹

```tsx
// WorkspaceContextMenu.tsx
import { type Component, Show } from 'solid-js';
import { store, mutate, deleteWorkspace, duplicateWorkspace, resetWorkspaceToPreset, isPresetId } from '../workspaceStore';

interface Props {
  workspaceId: string;
  x: number;
  y: number;
  onClose: () => void;
}

export const WorkspaceContextMenu: Component<Props> = (props) => {
  const canDelete = () => store().workspaces.length > 1;
  const canReset = () => isPresetId(props.workspaceId);

  const handle = (action: () => void) => { action(); props.onClose(); };

  return (
    <div style={{
      position: 'fixed',
      top: `${props.y}px`,
      left: `${props.x}px`,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
      'z-index': 1000,
      'min-width': '160px',
    }}>
      <MenuItem label="Duplicate" onClick={() => handle(() => mutate(s => duplicateWorkspace(s, props.workspaceId)))} />
      <Show when={canReset()}>
        <MenuItem label="Reset to default" onClick={() => handle(() => mutate(s => resetWorkspaceToPreset(s, props.workspaceId)))} />
      </Show>
      <MenuItem label="Delete" disabled={!canDelete()} onClick={() => handle(() => mutate(s => deleteWorkspace(s, props.workspaceId)))} />
    </div>
  );
};

const MenuItem: Component<{ label: string; onClick: () => void; disabled?: boolean }> = (p) => (
  <div
    onClick={() => !p.disabled && p.onClick()}
    style={{
      padding: 'var(--space-sm) var(--space-md)',
      cursor: p.disabled ? 'default' : 'pointer',
      color: p.disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
    }}
  >{p.label}</div>
);
```

### Tab 改動

- `onContextMenu`：阻 default，`setMenuPos({ x: e.clientX, y: e.clientY })`，render `<WorkspaceContextMenu />`
- `onDblClick`：進 inline edit mode，`<input>` 取代 label，Enter/blur 確認、Esc 取消；確認時呼 `renameWorkspace`
- 選單關閉：點 document 任處（`window.addEventListener('click')` 於 onMount，onCleanup 解）

### Steps

- [ ] **Step 5.1**: 建 `WorkspaceContextMenu.tsx`
- [ ] **Step 5.2**: `WorkspaceTab.tsx` 加 `onContextMenu` 處理 + 外部 click 關閉 listener
- [ ] **Step 5.3**: `WorkspaceTab.tsx` 加雙擊 inline edit（`createSignal<boolean>(false)` 切 view / edit；edit 時 render `<input>`；Enter / blur commit、Esc 取消）
- [ ] **Step 5.4**: `npm run build` 過
- [ ] **Step 5.5**: 手動 QA：右鍵 Layout → 看到 Duplicate / Reset / Delete；右鍵自建 → Reset disabled；只剩一個時 Delete disabled；雙擊改名 Enter 確認、Esc 取消；Reset 把 Layout preset 的 grid 還原到預設
- [ ] **Step 5.6**: Commit + PR

---

## Task 6: Drag-reorder

**GitHub issue**: `[app] Wave 2-6: WorkspaceTab drag-reorder`

**Files:**
- Modify: `src/app/layout/WorkspaceTab.tsx`
- Modify: `src/app/layout/WorkspaceTabBar.tsx`（提供 reorder callback / 計算 drop index）

**Depends on:** Task 4（獨立於 Task 5，可與 5 並行）
**Blocks:** 無（收尾）

### 思路

不引 library，用 pointer events：
- `pointerdown` on tab：記錄起始 `clientX` + 原索引
- `pointermove` 全域監聽（window，為了抓離開 tab bar 的拖動）：計算當前位置落在哪個 tab 上 → 以該 tab 的中線為閾值決定 drop index
- `pointerup`：呼 `reorderWorkspace(fromIdx, toIdx)` 並解除全域監聽
- 拖動中視覺反饋：被拖的 tab 加半透明 class + 位移 transform；其餘 tab 用 CSS transition 讓位（可選，首版可只加被拖 tab 半透明，不做其他 tab 讓位動畫）

### Steps

- [ ] **Step 6.1**: 在 `WorkspaceTabBar.tsx` 建 ref map：`tabRefs = new Map<string, HTMLElement>()`，每個 `WorkspaceTab` 透過 ref callback 註冊
- [ ] **Step 6.2**: `WorkspaceTab.tsx` `onPointerDown`：`setCapture(e.pointerId)`、記錄 startX + 原 idx、加全域 pointermove/pointerup listener
- [ ] **Step 6.3**: pointermove 計算 hoveredIdx（遍歷 tabRefs 找滑鼠 x 在哪個 rect）；更新 `dragState` signal 讓被拖 tab 加視覺樣式
- [ ] **Step 6.4**: pointerup：若 hoveredIdx !== fromIdx → `mutate(s => reorderWorkspace(s, fromIdx, hoveredIdx))`；清 dragState；remove listener
- [ ] **Step 6.5**: 避免與 onClick 衝突：拖動距離 < 5px 才觸發 click，否則視為拖動；用 `startX` + `pointerup` 的 clientX 距離判斷
- [ ] **Step 6.6**: `npm run build` 過
- [ ] **Step 6.7**: 手動 QA：拖 Layout tab 到 Debug 右邊 → 順序交換；拖極短距離 → 仍觸發 click 切換；儲存後重新整理 → 順序保留
- [ ] **Step 6.8**: Commit + PR

---

## Task 7: 收尾 — preset grid 固化、文件更新

**GitHub issue**: `[app] Wave 2-7: Preset grid 固化 + CLAUDE.md 更新`

**Files:**
- Modify: `src/app/workspaceStore.ts`（把 Task 1 的空 grid placeholder 換成真實 Dockview JSON）
- Modify: `src/app/layout/workspaceLayout.ts`（可能可簡化，若 preset grid 已直接存在 workspace.grid，fallback 分支可精簡）
- Modify: `src/app/CLAUDE.md`（更新 慣例 區塊：bridge.ts 外加 workspaceStore 說明）

**Depends on:** Task 3, 4, 5, 6 全部 merge 後
**Blocks:** 無

### Steps

- [ ] **Step 7.1**: 跑 app、套用 Layout preset → F12 執行 `JSON.stringify(api.toJSON())` 拿完整 grid JSON；同樣拿 Debug preset 的 grid JSON
- [ ] **Step 7.2**: 把兩份 JSON 存到 `workspaceStore.ts` 的 `createLayoutPreset()` / `createDebugPreset()` 的 `grid` 欄位（取代空物件 placeholder）
- [ ] **Step 7.3**: 簡化 `workspaceLayout.ts` 的 `applyPresetFallback`：preset 本身已有 grid，只剩「使用者自建 workspace 但 grid 為空 / 壞掉」的 fallback（空白單 viewport）需要保留
- [ ] **Step 7.4**: 更新 `src/app/CLAUDE.md` 慣例區塊 — 加一行「workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout 皆訂 store signal」
- [ ] **Step 7.5**: `npm run build` 過
- [ ] **Step 7.6**: 手動 QA：清 localStorage（F12 `localStorage.clear()`）→ 重新整理 → 看到兩 preset 正確佈局；切 tab 正常
- [ ] **Step 7.7**: Commit + PR

---

## 依賴關係總覽

```
Task 1 (store+test) ──┐
                      ├──→ Task 3 (DockLayout integration) ──→ Task 4 (TabBar basic) ──┬──→ Task 5 (context menu) ──┐
Task 2 (viewportState)┘                                                                 └──→ Task 6 (drag reorder)  ├──→ Task 7 (preset grid + docs)
                                                                                                                    ┘
```

- Task 1 與 Task 2 可並行開工（兩條 branch / worktree）
- Task 3 等 1 + 2 都 merge 後開始
- Task 4 等 3
- Task 5 與 Task 6 可並行（兩條 branch / worktree），都依賴 4
- Task 7 收尾，所有前置 merge 後

---

## 已知限制（本 plan 不解）

從 spec 直接沿用：
1. Editor 內部 UI state（折疊、捲軸）切 workspace 重置 — 由 #460 解
2. 兩 workspace 含同 panelId 的 Viewport → 共用 camera snapshot（預期行為）
3. 跨裝置同步：無
4. WebGL context 每次切 workspace 重建

---

## Commit message 慣例

所有 commit 用 `[app]` 前綴（符合專案 `CLAUDE.md` 模組清單）。每個 PR 結尾帶 `refs #<sub-issue>`。
