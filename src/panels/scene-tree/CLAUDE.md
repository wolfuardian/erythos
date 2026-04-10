# Scene Tree 模組

## 範圍限制
只能修改 src/panels/scene-tree/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/viewport/、src/panels/properties/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->

## 通用 SOP
遵守 [開發成員 SOP](../../../docs/dev-sop.md)。

## 慣例
- 透過 bridge signal 取得狀態，不直接操作 core
- 選取物體透過 `editor.selection.select()` 
- 用 SolidJS 響應式更新 UI

## Git 規則
- 工作分支：feat/multiselect-scene-tree
- commit 訊息格式：`[scene-tree] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[scene-tree] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->
- [ ] 多選功能 — scene-tree 層（#9）
  - **SceneTreePanel.tsx**：
    - `bridge.selectedObject` → `bridge.selectedObjects`
    - 普通點擊：`editor.selection.select(obj)`（取代選取）
    - Ctrl+Click：`editor.selection.toggle(obj)`（追加/移除）
    - 視覺：所有在 `bridge.selectedObjects()` 中的項目都高亮（用 `selection.has(obj)` 或比對陣列）
    - 注意 Mac 上 Ctrl+Click 行為不同，用 `e.ctrlKey || e.metaKey` 判斷

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
- build 失敗（非本模組）：3 處 `bridge.selectedObject` 尚未遷移 — ViewportPanel.tsx×2, PropertiesPanel.tsx×1，屬 viewport / properties 模組範圍
