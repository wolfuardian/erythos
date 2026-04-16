# Components 模組

## 範圍限制
只能修改 src/components/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/panels/、src/app/。

## 當前任務
<!-- 由主腦在準備 worktree 時填寫 -->

## 通用 SOP
遵守 [開發成員 SOP](../../.ai/roles/developer.md)。

## 慣例
- 遵循 Toolbar.tsx 現有的元件風格和按鈕寫法
- 用 createSignal 管理元件內部狀態
- ErrorDialog 是通用元件：不要在裡面寫死任何 GLTF 字樣
- 匯出 ErrorDialog 讓其他模組也能用
- 元件一律用 named export（`export { Foo }`），不用 default export，確保跨模組 import 一致
- 全域事件 listener（keydown、resize 等）必須用 `createEffect` 搭配 `onCleanup`，依響應式狀態動態綁定/解綁，不可在 `onMount` 中無條件註冊

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
