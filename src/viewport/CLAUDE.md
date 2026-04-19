# Viewport 模組

## 範圍限制
只能修改 src/viewport/ 和 src/panels/viewport/ 底下的檔案。
不得修改 src/core/、src/components/、src/app/、src/panels/properties/、src/panels/scene-tree/。

## 當前任務
<!-- 由主腦在指派任務時填寫 -->

## 慣例
- 用 SolidJS 的 onMount/onCleanup 管理 DOM 事件監聽
- 用 createSignal 管理元件狀態
- 不要在 Viewport class 內部處理檔案 I/O，拖放邏輯留在 ViewportPanel 元件層
- 樣式用 inline style，配合現有 CSS 變數 var(--bg-*)

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
