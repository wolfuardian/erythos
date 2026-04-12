# Components 模組

## 範圍限制
只能修改 src/components/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/panels/、src/app/。

## 當前任務
<!-- 由主腦在準備 worktree 時填寫 -->

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循 Toolbar.tsx 現有的元件風格和按鈕寫法
- 用 createSignal 管理元件內部狀態
- ErrorDialog 是通用元件：不要在裡面寫死任何 GLTF 字樣
- 匯出 ErrorDialog 讓其他模組也能用
- 元件一律用 named export（`export { Foo }`），不用 default export，確保跨模組 import 一致
- 全域事件 listener（keydown、resize 等）必須用 `createEffect` 搭配 `onCleanup`，依響應式狀態動態綁定/解綁，不可在 `onMount` 中無條件註冊

## Git 規則
- commit 訊息格式：`[components] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[components] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 備忘錄
工作中若有 insight、意外發現、改進建議，寫入 `.ai/memos/#N-簡述.md`（N = issue 編號）。
一個任務最多一個檔案，必須在開 PR 之前 commit + push。主腦 merge 後 review。

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
