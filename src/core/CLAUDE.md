# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] restoreSnapshot 版本不符時應 throw（#79）
  - 修改 `src/core/scene/AutoSave.ts`：
    - `restoreSnapshot` 中，版本不符或 JSON parse 失敗時 → **throw Error** 而非靜默 return
    - 錯誤訊息需明確（例如 `"Incompatible snapshot format (expected version X)"` 或 `"Invalid snapshot JSON"`）
  - 修改 `src/core/Editor.ts`：
    - Editor 建構子中呼叫 `restoreSnapshot` 的地方加 try/catch → catch 中 `console.warn` 靜默處理（維持啟動不崩潰）
  - 更新測試 `src/core/scene/__tests__/AutoSave.test.ts`：
    - 新增測試：餵入舊格式資料 → 預期 throw
    - 新增測試：餵入 invalid JSON → 預期 throw

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307

## Git 規則
- 工作分支：fix/restore-snapshot-throw
- commit 訊息格式：`[core] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[core] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
