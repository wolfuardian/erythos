# Core 模組

## 範圍限制
只能修改 src/core/ 和 src/utils/ 底下的檔案。
不得修改 src/panels/、src/viewport/、src/components/、src/app/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] 引入 vitest 測試框架 + 基礎 snapshot test（#76）
  - 安裝 vitest（dev dependency）：`npm install -D vitest`
  - 新增 `vitest.config.ts`（專案根目錄）：
    - 設定 test 環境（jsdom 或 node，視 Three.js 需求）
    - include `src/**/*.test.ts`
  - 在 `package.json` 加入 script：`"test": "vitest run"`
  - 撰寫基礎測試 `src/core/scene/__tests__/AutoSave.test.ts`：
    - Editor 建立 → 加物件 → saveSnapshot → clear → restoreSnapshot → 驗證 scene.children 一致
  - 撰寫基礎測試 `src/core/__tests__/History.test.ts`：
    - addObject → removeObject → undo → 驗證物件恢復
  - 注意：Three.js 在 Node 環境可能需要 mock（沒有 WebGL context），用最簡單的方式處理，不要過度 mock

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- 遵循現有 Command 模式（參考 AddObjectCommand.ts）
- 事件發射順序：objectAdded → sceneGraphChanged（不能反過來）
- Command 的 undo 中要檢查 selection 狀態並清除
- import three 模組用 `'three'`；`three/examples/jsm/` 底下的模組必須帶 `.js` 後綴（例如 `'three/examples/jsm/loaders/GLTFLoader.js'`），否則 tsc 會 TS2307

## Git 規則
- 工作分支：feat/vitest-setup
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
