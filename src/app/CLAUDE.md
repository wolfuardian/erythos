# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] ProjectPanel 檔案選取應預設單選（#46）
  - 修改 `src/app/panels/project/ProjectPanel.tsx`：
    - 將選取狀態從 TreeNode 內部提升到 ProjectPanel 層級
    - ProjectPanel 持有 `selectedPaths: Set<string>` signal（用節點路徑或 name 組合做 key）
    - TreeNode 移除內部的 `selected` signal，改從 props 接收：
      - `selected: boolean` — 是否被選取
      - `onSelect: (path: string, modifier: { ctrl: boolean }) => void` — 點擊回呼
    - ProjectPanel 的 onSelect handler：
      - 普通點擊：清除全部 → 選取當前（單選）
      - Ctrl+Click（`e.ctrlKey || e.metaKey`）：toggle 當前（多選）
    - 資料夾點擊仍然只做展開/收合，不參與選取

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## Git 規則
- 工作分支：fix/project-select
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
