# Viewport 模組

## 範圍限制
只能修改 src/viewport/ 和 src/panels/viewport/ 底下的檔案。
不得修改 src/core/、src/components/、src/app/、src/panels/properties/、src/panels/scene-tree/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 用 SolidJS 的 onMount/onCleanup 管理 DOM 事件監聽
- 用 createSignal 管理元件狀態
- 不要在 Viewport class 內部處理檔案 I/O，拖放邏輯留在 ViewportPanel 元件層
- 樣式用 inline style，配合現有 CSS 變數 var(--bg-*)

## Git 規則
- 工作分支：feat/multiselect-viewport
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
- [ ] 多選功能 — viewport 層（#9）
  - **ViewportPanel.tsx**：
    - `bridge.selectedObject` → `bridge.selectedObjects`（2 處）
    - 更新 createEffect 中的同步邏輯：呼叫 `viewport.setSelectedObjects(objects)` 而非 `setSelectedObject(obj)`
  - **Viewport.ts**：
    - `setSelectedObject(obj)` → `setSelectedObjects(objects: Object3D[])`
    - 多物體時呼叫 `this.gizmo.attachMulti(objects)`
    - 單物體時維持 `this.gizmo.attach(objects[0])`
    - 空選取時 `this.gizmo.detach()`
    - PostProcessing 已支援陣列，直接傳入
  - **SelectionPicker.ts**：
    - `onSelect` callback 簽名改為 `(object: Object3D | null, modifier: { ctrl: boolean }) => void`
    - `onPointerUp` 中讀取 `e.ctrlKey || e.metaKey`，傳給 callback
  - **GizmoManager.ts**：
    - 新增 `attachMulti(objects: Object3D[])` 方法
    - 計算所有物體包圍盒中心，建立臨時 pivot Object3D
    - TransformControls 附著到 pivot
    - 拖曳時同步 delta 到所有物體
    - 拖曳結束回傳所有物體的 start transform 供 undo
  - 參考根目錄 CLAUDE.md「介面契約：多選功能」

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
- build 仍有 2 處跨模組錯誤（非本次引入，bridge 遷移後即存在）：
  - `src/panels/properties/PropertiesPanel.tsx(12)` — `bridge.selectedObject` → 屬 properties 模組
  - `src/panels/scene-tree/SceneTreePanel.tsx(15)` — `bridge.selectedObject` → 屬 scene-tree 模組
