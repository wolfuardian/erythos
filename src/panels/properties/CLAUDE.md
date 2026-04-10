# Properties 模組

## 範圍限制
只能修改 src/panels/properties/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/viewport/、src/panels/scene-tree/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->

## 通用 SOP
遵守 [開發成員 SOP](../../../docs/dev-sop.md)。

## 慣例
- 透過 bridge signal 取得選中物體，不直接操作 core
- 屬性變更透過 editor 的 command 執行，確保 undo/redo
- 用 SolidJS 響應式更新 UI

## Git 規則
- 工作分支：feat/multiselect-properties
- commit 訊息格式：`[properties] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[properties] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->
- [ ] 多選功能 — properties 層（#9）
  - **PropertiesPanel.tsx**：
    - `bridge.selectedObject` → `bridge.selectedObjects`
    - `selectedObjects().length === 0`：顯示「No object selected」（現有行為）
    - `selectedObjects().length === 1`：顯示該物體屬性（現有行為不變）
    - `selectedObjects().length > 1`：顯示共同屬性，值不同的欄位顯示「—」
  - 需讀取 `src/core/Selection.ts` 了解新 API（`all`, `count`, `primary`）

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
- build 仍有 3 處跨模組 `bridge.selectedObject` 錯誤（SceneTreePanel×1, ViewportPanel×2），屬 scene-tree / viewport 模組範圍，properties 層改動本身無型別錯誤
