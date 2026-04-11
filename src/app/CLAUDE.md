# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] Status bar 顯示自動儲存狀態（#44）
  - 修改 `src/app/bridge.ts`：
    - 新增 `autosaveStatus: Accessor<'idle' | 'pending' | 'saved'>` signal
    - 監聽 `autosaveStatusChanged` 事件更新 signal
    - 記得在 `dispose()` 中 off 事件
  - 修改 `src/app/App.tsx`：
    - 在 status bar 右下角（重設佈局按鈕左側）顯示自動儲存狀態
    - `'pending'` → 顯示 "儲存中…"（灰色）
    - `'saved'` → 顯示 "已儲存"（綠色或 muted）
    - `'idle'` → 不顯示或顯示空白
    - 樣式參考現有 status bar 的 inline style 慣例

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## Git 規則
- 工作分支：feat/autosave-status-ui
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
