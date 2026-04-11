# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] ProjectPanel 雙擊 scene 檔整合場景讀取（#71）
  - 修改 `src/app/panels/project/ProjectPanel.tsx`：
    - 取代 L178-181 的 `console.log` 佔位
    - 使用 `useEditor()` 取得 bridge（需要 `editor` 和 `confirmBeforeLoad`）
    - 雙擊流程：
      1. 讀取 `bridge.confirmBeforeLoad()`
      2. 若為 true：顯示 ConfirmDialog 詢問（import from `src/components/ConfirmDialog.tsx`）
      3. 確認後（或設定為 false 直接執行）：呼叫 `restoreSnapshot(bridge.editor, data)` 還原場景
    - 注意：目前 ProjectPanel 是 mock 資料，沒有真實檔案可讀。場景讀取來源參考 Toolbar 的 Load 按鈕做法（`src/components/Toolbar.tsx` 中的 handleLoad）— 使用檔案選擇器 + FileReader
    - 失敗時用 ErrorDialog 顯示錯誤（已有於 `src/components/ErrorDialog.tsx`）
  - 參考：
    - `restoreSnapshot` 位於 `src/core/scene/AutoSave.ts`（已 export）
    - `ConfirmDialog` 位於 `src/components/ConfirmDialog.tsx`
    - Toolbar 的 Load 實作可作為範本

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## Git 規則
- 工作分支：feat/project-scene-integrate
- commit 訊息格式：`[app] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[app] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
