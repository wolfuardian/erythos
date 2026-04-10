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
- 工作分支：fix/gizmo-broken
- commit 訊息格式：`[viewport] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->
- [ ] Transform gizmo（移動/旋轉/縮放）失效（#7）
  - 可能原因：`GizmoManager` 建構時 canvas 尚未掛載到 DOM，TransformControls 的 pointer 事件無法正確運作（類似 #5 OrbitControls 的問題）
  - 調查 `GizmoManager.ts` 和 `Viewport.ts` 中 TransformControls 的初始化時機
  - 確認 gizmo 的 attach/detach 是否正常觸發
  - 修復後驗證：選中物體 → gizmo 出現 → 可拖曳移動/旋轉/縮放

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
