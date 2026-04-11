# Viewport 模組

## 範圍限制
只能修改 src/viewport/ 和 src/panels/viewport/ 底下的檔案。
不得修改 src/core/、src/components/、src/app/、src/panels/properties/、src/panels/scene-tree/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] 框選拖曳期間顯示 hover 預覽（#28）

  ### 修改 `src/viewport/BoxSelector.ts`
  - `BoxSelectorCallbacks` 新增 `onBoxHover: (objects: Object3D[]) => void`
  - `onPointerMove`：當 `isActive` 時，呼叫 `collectHits()` 取得框內物體，傳給 `onBoxHover`
  - `onPointerUp`（框選結束）和 `cancel()`：呼叫 `onBoxHover([])` 清除 hover

  ### 修改 `src/viewport/Viewport.ts`
  - 新增 `private _boxDragging = false` 旗標
  - 接收 BoxSelector 的 `onBoxHover`：
    - 陣列非空 → `_boxDragging = true`，呼叫 `postProcessing.setHoveredObjects(objects)` + requestRender
    - 陣列為空 → `_boxDragging = false`，呼叫 `postProcessing.setHoveredObjects([])` + requestRender
  - `setHoveredObject()` 中：如果 `_boxDragging` 為 true，直接 return（抑制 SelectionPicker 的單物體 hover）

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 用 SolidJS 的 onMount/onCleanup 管理 DOM 事件監聽
- 用 createSignal 管理元件狀態
- 不要在 Viewport class 內部處理檔案 I/O，拖放邏輯留在 ViewportPanel 元件層
- 樣式用 inline style，配合現有 CSS 變數 var(--bg-*)

## Git 規則
- 工作分支：feat/box-hover
- commit 訊息格式：`[viewport] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[viewport] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->
- [ ] `_boxDragging` 應綁定拖曳生命週期而非命中結果（#36）
  - **問題**：`onBoxHover` 回傳空陣列時就清除 `_boxDragging`，導致框選經過空白區域時 SelectionPicker 的單物體 hover 閃爍
  - **修改 `src/viewport/BoxSelector.ts`**：
    - `BoxSelectorCallbacks` 新增 `onBoxDragStart: () => void` 和 `onBoxDragEnd: () => void`
    - 當拖曳距離超過 `DRAG_THRESHOLD` 進入 `isActive` 時，呼叫 `onBoxDragStart()`
    - `onPointerUp`（框選結束）和 `cancel()` 中，呼叫 `onBoxDragEnd()`
  - **修改 `src/viewport/Viewport.ts`**：
    - `onBoxDragStart`: 設 `_boxDragging = true`
    - `onBoxDragEnd`: 設 `_boxDragging = false`
    - `onBoxHover`: 移除對 `_boxDragging` 的操作，只負責傳遞 hover 物體給 postProcessing

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
