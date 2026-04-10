# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## Git 規則
- 工作分支：feat/multiselect-app
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
- [ ] 多選功能 — bridge 層（#9）
  - **bridge.ts**：
    - `selectedObject` signal 改為 `selectedObjects: Accessor<Object3D[]>`
    - 新增監聽 `selectionChanged` 事件，payload 為 `Object3D[]`，更新 signal
    - `EditorBridge` interface 中 `selectedObject` 改為 `selectedObjects`
    - 保留 `objectSelected` 監聽做向後相容（如有其他地方使用），或直接移除改用 `selectionChanged`
  - 參考根目錄 CLAUDE.md「介面契約：多選功能」及 `src/core/Selection.ts` 的新 API

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
- build 失敗：4 處 `bridge.selectedObject` 參照尚未遷移（ViewportPanel×2, PropertiesPanel×1, SceneTreePanel×1），屬 viewport / properties / scene-tree 模組範圍，需各自分支修正
