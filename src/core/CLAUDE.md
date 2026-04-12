# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務

<!-- 目前無任務 -->

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。**進場第一步：`npm install`**

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307

## Git 規則
- 工作分支：`feat/glb-persistence`
- commit 訊息格式：`[core] 簡述 (refs #119)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[core] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 備忘錄
工作中若有 insight、意外發現、改進建議，寫入 `.ai/memos/#N-簡述.md`（N = issue 編號）。
一個任務最多一個檔案，必須在開 PR 之前 commit + push。主腦 merge 後 review。

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）

**#119 跨模組需求：App 層需呼叫 `editor.init()`**

`Editor.init()` 是 async，目前 app 層（`src/app/`）仍直接使用 `new Editor()`，
autosave 尚未初始化就提供 context 給 UI 會導致：
1. autosave 為 `undefined`，dispose 時 crash
2. 場景 restore 未完成，UI 顯示空場景

需要協調 app 模組，在 `editor.init()` resolve 後再 mount UI / provide context。
詳見 `.ai/memos/#119-glb-persistence.md`。
