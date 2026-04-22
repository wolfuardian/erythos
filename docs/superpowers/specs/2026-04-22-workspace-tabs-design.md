# Workspace Tabs — Design Spec

**Issue**: #458
**Date**: 2026-04-22
**Status**: Draft (pending user approval)
**Wave**: Blender-like UI 重構 Wave 2

---

## 背景與目標

Wave 1（#461–#465）已建立 Area / Editor 抽象：Dockview grid + `AreaShell` 包每個 panel、每 Area 持 `editorType`、localStorage key `erythos-layout-v2` 存單一 grid + editorTypes map。

本 issue 在現有基礎上加 **Workspace tabs**：頂層 tab 列，每個 workspace 持一份 Area 佈局快照（grid tree + editorType 配置）。切 tab 整個 Dockview 重套。

參考 Blender UX：tab 可加、刪、改名、複製、重排，支援 preset reset。

## 範圍決策（brainstorm 結論）

| 項目 | 決策 |
|------|------|
| 功能完整度 | 完整 Blender 等級（加 / 刪 / 改名 / 複製 / 排序 / preset reset） |
| Preset 數 | 2 個：`Layout` / `Debug` |
| 新增行為 | `+` 直接複製當前 workspace，不彈模板選單 |
| 切換策略 | 單一 Dockview 實例 + `api.clear()` + `fromJSON()` 換骨（Editor unmount / remount） |
| Undo 整合 | Workspace 操作不進 undo stack |
| 刪除確認 | 無 confirm dialog，直刪 |
| 跨 workspace 共用 | Scene graph、selection、undo stack、camera 位置共用；grid + editorType 獨立 |
| Editor UI state 保留 | 切 workspace 一律重置（由 #460 後續解決） |

---

## 資料模型

**新檔** `src/app/workspaceStore.ts`

```ts
interface Workspace {
  id: string;                              // uuid（preset 用 stable id：'layout-preset' / 'debug-preset'）
  name: string;                            // 使用者可改
  grid: unknown;                           // Dockview api.toJSON() 結果
  editorTypes: Record<string, string>;     // panelId → editorType
}

interface WorkspaceStore {
  version: 1;
  currentWorkspaceId: string;
  workspaces: Workspace[];                 // 順序 = tab 排序
}
```

**持久化 key**：`erythos-workspaces-v1`
**寫入時機**：workspace 操作即時寫入；grid 變動 debounce 300ms
**Migration**：偵測舊 key `erythos-layout-v2` → 包成單一 `Layout` workspace → 寫新 key → 刪舊 key

**Preset 初始化**（新安裝，新舊 key 皆無）：
- `Layout`（id `layout-preset`）：scene-tree 左 220 / viewport 中 / properties 右 280
- `Debug`（id `debug-preset`）：viewport 中 / environment 右 300 / leaf 底 200
- `currentWorkspaceId` = `layout-preset`

**Migration from `erythos-layout-v2`**：
- 單一舊 grid + editorTypes → 包成一個 workspace（`id: 'layout-preset'`、`name: 'Layout'`），成為「繼承使用者既有佈局」的 Layout 容器
- 同時建 `Debug` preset
- `currentWorkspaceId` = `layout-preset`

Store 提供純函式 API：

```ts
loadStore(): WorkspaceStore                                 // 含 migration + preset 初始化 + corruption fallback
saveStore(store: WorkspaceStore): void                      // try/catch，quota 爆吞錯
setCurrent(store, id): WorkspaceStore
addWorkspace(store, baseId?): WorkspaceStore                // 複製（省略 baseId 則複製當前）
deleteWorkspace(store, id): WorkspaceStore                  // 自動切鄰居；最後一個拒絕
renameWorkspace(store, id, name): WorkspaceStore
duplicateWorkspace(store, id): WorkspaceStore               // 同 addWorkspace(store, id) 但不改 current
reorderWorkspace(store, fromIdx, toIdx): WorkspaceStore
updateCurrentWorkspace(store, patch: Partial<Pick<Workspace, 'grid' | 'editorTypes'>>): WorkspaceStore
resetWorkspaceToPreset(store, id): WorkspaceStore           // 僅對 preset id 有效
```

純函式 + Solid signal wrapper（module-level `createSignal<WorkspaceStore>`）。

---

## 組件結構

```
App.tsx
 ├─ Toolbar                    (existing)
 ├─ WorkspaceTabBar            (new)
 ├─ DockLayout                 (existing, modified)
 └─ StatusBar                  (existing)
```

### `src/app/layout/WorkspaceTabBar.tsx`（新）

- Props：無（訂 workspaceStore signal）
- 渲染水平 tab 列 + 尾端 `+` button
- 子 `WorkspaceTab`：
  - 左鍵切換
  - 雙擊進 inline input（Enter 確認 / Esc 取消）
  - 右鍵 context menu：`Duplicate` / `Reset to default`（僅 preset）/ `Delete`
  - `pointerdown` + `pointermove` 實作 drag-reorder（不引 library）
- 樣式：inline style + CSS variables

### `src/app/layout/DockLayout.tsx`（改）

- Dockview `ready` hook：不再呼 `applyDefaultLayout(api)`，改 `applyWorkspace(api, currentWorkspace())`
- 加 `createEffect`：`currentWorkspaceId` 變 → `api.clear()` → `applyWorkspace(api, next)`
- Dockview `onDidLayoutChange` → `updateCurrentWorkspace({ grid: api.toJSON(), editorTypes: snapshot() })`（debounced）

### `src/app/AreaShell.tsx`（改）

AreaShell 調 `setEditorType` 現有走 `editorTypeStore`；改為呼 workspaceStore 的 setter（workspaceStore 統一管 editorTypes）。

### `src/app/viewportState.ts`（新，小型 Editor 擴充）

```ts
interface ViewportSnapshot {
  position: [number, number, number];
  target: [number, number, number];
}
```

- Module-level `Map<panelId, ViewportSnapshot>`（跨 workspace 共用）
- Viewport mount 時查 snapshot → restore；unmount 時 save
- 不持久化到 localStorage（只求切換期間記得，session 結束重置）

### 刪除 / 改名

- 刪 `src/app/editorTypeStore.ts`（功能併入 workspaceStore）
- `src/app/layout/defaultLayout.ts` → 改為 `workspaceLayout.ts`；函式 `applyDefaultLayout` / `saveLayout` / `clearSavedLayout` → `applyWorkspace` / 廢除 saveLayout（併入 updateCurrentWorkspace）/ `clearAll`

---

## 資料流 & 生命週期

### 啟動

```
App mount
 → loadStore() (migration if needed, preset init if needed)
 → createSignal(currentWorkspaceId)
 → DockLayout.onReady
    → applyWorkspace(api, currentWorkspace())
```

### 切 workspace

```
user clicks tab / keyboard / context menu action triggers setCurrent
 → currentWorkspaceId signal 變
 → createEffect:
    ├─ Viewport.onCleanup 存 viewportState snapshot
    ├─ api.clear()                 // Dockview 拆所有 panel，Editor component unmount
    ├─ applyWorkspace(api, next)   // fromJSON + editorTypes hydrate
    └─ Viewport mount 時 restore viewportState snapshot
```

### Grid / editorType 變動

```
Dockview.onDidLayoutChange (拖邊、split、close)
 或 AreaShell.setEditorType (使用者從 header dropdown 切 editor)
 → updateCurrentWorkspace({ grid, editorTypes })
 → saveStore() debounced 300ms
```

### Workspace 操作

```
add / delete / rename / duplicate / reorder
 → mutate store signal (純函式不可變更新)
 → saveStore() 立即寫入（非 debounce）
 → 若操作連動切換 current（如刪當前）→ 觸發切換 effect
```

### `+` 新增

- 複製當前 workspace 的 `grid` + `editorTypes`（deep clone）
- `name` 規則：基底名 + 自動遞增（若當前叫 `Foo` → 產 `Foo.001`；若 `Foo.001` 已存在 → `Foo.002`）
- 新 workspace 立即 `setCurrent`

### Reset to default

- 僅對 id ∈ `{'layout-preset', 'debug-preset'}` 的 workspace 有效
- 使用者自建 workspace 的 context menu 此項 disabled
- 重寫該 workspace 的 `grid` + `editorTypes` 為 preset 原始值，保留 `name`

---

## Error handling

| 情境 | 處理 |
|------|------|
| localStorage JSON 壞掉 | `try/catch` → 刪 key → 全新初始化（建 2 preset） |
| localStorage quota 爆 | `saveStore()` 內吞錯（現有 `defaultLayout.ts` 同樣模式） |
| `currentWorkspaceId` 指向不存在 workspace | load 時校正為陣列首個；陣列空 → 重建 2 preset |
| `fromJSON` 套 grid 失敗 | `try/catch` → preset 回預設 / 使用者自建回空白單 Area |
| Workspace mutation concurrency | 純函式不可變更新，signal 原子寫入 |

**不做**：
- Confirm dialog（直刪）
- Undo（不進 Editor undo stack）
- 跨 tab 同步（SPA 單 tab 前提）

---

## 測試

**新測試** `src/app/workspaceStore.test.ts`（vitest）：

- `loadStore` / `saveStore` round-trip
- Migration from `erythos-layout-v2`
- Add / delete / rename / duplicate / reorder 純函式正確性
- 刪當前 workspace → `currentWorkspaceId` 自動修正
- 刪最後一個 → 回傳原 store 不變（UI 層靠 `disabled` 防呆，函式層不丟 error）
- `resetWorkspaceToPreset` 對 preset 有效、對自建無效
- `+` 新增的 name 遞增規則
- Corruption fallback

**不寫**（專案現況無對應 infra）：
- DockLayout.tsx 整合測試
- WorkspaceTabBar UI 互動測試

靠 `npm run build` + 手動 QA + `role-pr-qc` 審 diff 把關。

---

## 已知限制（寫進 spec，不在此 issue 解）

1. Editor 內部 UI state（折疊、捲軸、內部 tab）切 workspace 重置 — 由 #460 解決
2. 兩 workspace 都含同 `panelId` 的 Viewport → 共用同一 camera snapshot（預期行為）
3. 跨裝置同步：無（localStorage 本地）
4. WebGL context 每次切 workspace 重建（A 策略的必然代價，已承認）

---

## 實作拆分建議（下階段 writing-plans 用）

**候選子 issue 切法**（暫訂，plan 階段可調整）：

1. `workspaceStore.ts` + 測試 + migration（純資料層，先拋出來）
2. `WorkspaceTabBar.tsx` 基本切 tab + `+` 新增
3. `DockLayout.tsx` 串 workspaceStore（切 tab 真的換畫面）
4. TabBar context menu（rename / delete / duplicate / reset）
5. TabBar drag-reorder
6. `viewportState.ts` + Viewport 生命週期 hook
7. 刪 `editorTypeStore.ts`、改名 `defaultLayout.ts` → `workspaceLayout.ts`

依賴關係：1 → 2 → 3 是骨幹；4、5、6、7 可並行或 3 之後串接。
