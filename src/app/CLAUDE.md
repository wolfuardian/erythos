# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] 新增上下文（Context）面板（#52）
  - 新增 `src/app/panels/context/ContextPanel.tsx`：
    - 建立基本面板元件，初期顯示「Context」標題即可
    - 使用 `useEditor()` 取得 bridge（未來會讀取場景結構）
    - 樣式沿用其他面板慣例（inline style + CSS 變數）
  - 修改 `src/app/App.tsx`：
    - import ContextPanel
    - 在 COMPONENTS 中註冊 `'context': () => <ContextPanel />`
  - 修改 `src/app/layout/defaultLayout.ts`：
    - 在 default layout 中加入 context 面板，位置為 scene-tree 面板的 tab（`direction: 'within'`, `referencePanel: 'scene-tree'`）

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## Git 規則
- 工作分支：feat/context-panel
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
