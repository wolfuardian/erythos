# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->
- [ ] Context 面板顯示場景完整結構原始碼（#53）
  - 修改 `src/app/panels/context/ContextPanel.tsx`：
    - 使用 `useEditor()` 取得 bridge
    - 從 bridge 讀取 `editor.scene`，呼叫 `scene.toJSON()` 取得場景 JSON
    - 用 `JSON.stringify(json, null, 2)` 格式化
    - 以 `<pre>` 呈現格式化後的 JSON 原始碼
    - 需響應式更新：場景變更（sceneGraphChanged）時重新取得 JSON
  - 修改 `src/app/bridge.ts`（如需要）：
    - 確保 bridge 暴露 editor 或 scene 參照，供 ContextPanel 存取

## 通用 SOP
遵守 [開發成員 SOP](../../docs/dev-sop.md)。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## Git 規則
- 工作分支：feat/context-scene-json
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
