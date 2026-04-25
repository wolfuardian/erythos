# App 前置知識

_Last updated: 2026-04-25 by EX_
_Module path: src/app/_
_Commit 前綴: [app]_

## 檔案速覽

| 檔案 | 職責（1 行） |
|------|------------|
| `App.tsx` | 根元件：建 Editor / bridge / sharedGrid，掛 keybindings，頂層版型 |
| `bridge.ts` | core 事件 → SolidJS signal（EditorBridge），所有 panel 的事件來源 |
| `EditorContext.tsx` | SolidJS Context，`useEditor()` hook，bridge 分發給子樹 |
| `AreaContext.ts` | SolidJS Context，`useArea()` hook，area id + editorType 供子 panel 讀取 |
| `AreaShell.tsx` | 按 areaId 查 editorType → Dynamic 渲染對應 panel |
| `editors.ts` | 所有 EditorDef 匯集，panels/ 逐一 import |
| `workspaceStore.ts` | workspace CRUD + localStorage 持久化（pure fn + signal wrapper） |
| `viewportState.ts` | getPanelState / setPanelState / getSnapshot / setSnapshot 快取層 |
| `areaTree.ts` | AreaTree 型別定義 + preset 工廠函式，ScreenVert/ScreenEdge/ScreenArea |
| `cornerDragStore.ts` | 拖角落 split/merge 預覽狀態（module-level signal，非 Context） |
| `types.ts` | EditorDef / Area 型別 |
| `layout/` | AreaTreeRenderer / AreaSplitter / AreaCornerHandle / WorkspaceTabBar 等 |

## 關鍵 Types / Interfaces

- `EditorBridge`（bridge.ts）：全部 signal + `editor` raw 物件 + `dispose()`
  - 核心 signal：`selectedUUIDs`, `hoveredUUID`, `nodes`, `interactionMode`, `transformMode`, `sceneVersion`, `objectVersion`, `canUndo`, `canRedo`, `autosaveStatus`
  - 專案 signal：`projectOpen`, `projectName`, `projectFiles`, `leafAssets`, `environmentSettings`, `glbKeys`
  - Viewport 協調：`activeViewportId` / `setActiveViewportId`, `draggingViewportId` / `setDraggingViewportId`, `dragTickVersion` / `bumpDragTick`, `sharedGridObjects`
- `Workspace`：`{ id, name, grid: AreaTree, editorTypes: Record<areaId, editorType>, viewportState: Record<areaId, ViewportPanelState> }`
- `WorkspaceStore`：`{ version: 1, currentWorkspaceId, workspaces: Workspace[] }`
- `ViewportPanelState`（workspaceStore.ts）：`{ camera?, sceneLightsOverrides?, lookdevPreset?, hdrIntensity?, hdrRotation? }`
- `AreaTree`（areaTree.ts）：`{ version: 2, verts: ScreenVert[], edges: ScreenEdge[], areas: ScreenArea[] }`
- `CornerDragPhase`（cornerDragStore.ts）：`idle | pending | active`（active 含 previewTree / previewEditorTypes）
- `Area`（types.ts）：`{ id, editorType }`

## 啟動順序（App.tsx）

1. `new Editor()` + `editor.init()`（非同步，fire-and-forget）
2. `new GridHelpers()` → `threeScene.add(grid, axes)`（sharedGridObjects 建立）
3. `createEditorBridge(editor, sharedGridObjects)`
4. `editor.sceneDocument.events.on('sceneReplaced', onSceneReplaced)`（scene replace 後 re-add grid）
5. `onMount`：register keybindings + `editor.keybindings.attach()`
6. `onCleanup`：`bridge.dispose()` → 解除 sceneReplaced 監聽 → `sharedGrid.dispose()` → `editor.dispose()`

## Bridge 事件訂閱源

- `editor.events`：selectionChanged / hoverChanged / interactionModeChanged / transformModeChanged / historyChanged / autosaveStatusChanged / leafStoreChanged / environmentChanged
- `editor.sceneDocument.events`：nodeAdded / nodeRemoved / nodeChanged / sceneReplaced
- `editor.clipboard`：clipboardChanged
- `editor.projectManager.onChange()`（回傳 unsubscribe fn）

## WorkspaceStore Pattern

- Module-level singleton signal：`const [store, setStore] = createSignal<WorkspaceStore>(loadStore())`
- `mutate(fn)` = 唯一寫入入口：`fn(store())` → `setStore` + `saveStore`（localStorage）
- `currentWorkspace()` 直接讀 signal，**非 Context，全域可呼叫**
- 持久化 key：`erythos-workspaces-v1`（STORAGE_KEY）；舊 key `erythos-layout-v2` 在 loadStore 自動遷移刪除
- Preset IDs：`layout-preset` / `debug-preset`（isPresetId() 判斷）

## ViewportState 讀寫路徑

- 寫：`viewportState.setPanelState(workspaceId, areaId, patch)` → `mutate` → localStorage
- 讀：`viewportState.getPanelState(workspaceId, areaId)`
- 舊版相容層：`getSnapshot` / `setSnapshot`（只處理 `camera` 欄位，供向後相容）
- migration 在 `loadStore()` 內：偵測舊格式（直接含 `position` 陣列）→ 包成 `camera` 欄位

## 跨檔依賴

- `App.tsx` → `bridge.ts` → `Editor`（core）
- `App.tsx` → `GridHelpers`（viewport）
- `AreaShell.tsx` → `editors.ts`（匯集所有 panel EditorDef）
- `AreaShell.tsx` → `workspaceStore.ts`（讀 editorType，寫 mutate）
- `AreaShell.tsx` → `cornerDragStore.ts`（drag preview editorTypes）
- 所有 panels → `EditorContext.tsx` / `useEditor()` 取得 bridge（共 13 個 panel 檔案）
- `ViewportPanel.tsx` → `viewportState.ts`（getPanelState / setPanelState）
- `ViewportPanel.tsx` → `workspaceStore.ts`（currentWorkspace，**closure capture only**）

## 已知地雷

- **onCleanup closure capture race**（#588）：panel cleanup 讀 `currentWorkspace().id` 可能拿到已切走的 workspace。正確做法：mount 時 `const workspaceId = currentWorkspace().id` 鎖入 closure，cleanup 用閉包值。
- **sceneReplaced grid 消失**：`SceneSync.rebuild()` 清空 scene children，sharedGrid 會被移除。App.tsx 已訂 `sceneReplaced` 事件 re-add；修改 scene replace 邏輯時需確保此監聽不被破壞。
- **editors.ts 順序**：`editors` array 的順序決定 panel 選擇器 UI 的陳列順序，新增 panel 需同步在此注冊。
- **cornerDragStore 非 Context**：module-level signal，任何元件直接 import 即讀，drag 預覽 editorTypes 與正式 workspaceStore 分開存，preview 結束後由 AreaSplitter 正式寫入 workspaceStore。
- **confirmBeforeLoad signal**：在 bridge.ts module 頂層建立（非 createEditorBridge 內），意即它是全域 singleton，不隨 bridge dispose 重建。

## 最近 PR

- #594 [viewport] per-mode sceneLights override + sub-panel state workspace 持久化
- #592 [viewport] shading lookdev HDR
- #587 [viewport] camera snapshot 持久化（workspace.viewportState, closure capture）
