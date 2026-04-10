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
- 工作分支：fix/focus-tween
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
- [ ] focusObject 應保留飛向目標的 tween 動畫（#16）
  - `CameraController.ts`：在 `focusObject()` 方法中加回 tween 動畫
  - 用 `requestAnimationFrame` 迴圈，easeOutCubic 緩動，約 400ms
  - lerp camera.position 和 controls.target 到目標位置
  - 需要 `focusAnim` 欄位追蹤動畫 ID，dispose 時 cancelAnimationFrame
  - 注意：OrbitControls damping 已關閉（#15），不要重新開啟

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
