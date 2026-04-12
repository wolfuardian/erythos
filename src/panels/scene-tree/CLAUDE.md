# Scene Tree 模組

## 範圍限制
只能修改 src/panels/scene-tree/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/viewport/、src/panels/properties/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->

## 通用 SOP
遵守 [開發成員 SOP](../../../docs/dev-sop.md)。**進場第一步：`npm install`**

## 慣例
- 透過 bridge signal 取得狀態，不直接操作 core
- 選取物體透過 `editor.selection.select()` 
- 用 SolidJS 響應式更新 UI

## Git 規則
- commit 訊息格式：`[scene-tree] 簡述 (refs #N)`
- 每完成一個任務步驟就 commit + push，不要等全部做完才一次 commit
- 完成所有任務後，做一次 `npm run build` 確認無錯誤，再做最終 commit
- build 通過後開 PR：
  ```bash
  gh pr create --title "[scene-tree] 簡述 (refs #N)" --body "改動摘要"
  ```
- 不得操作 main/master 分支
- 不得 merge 其他分支

## 備忘錄
工作中若有 insight、意外發現、改進建議，寫入 `.ai/memos/#N-簡述.md`（N = issue 編號）。
一個任務最多一個檔案，必須在開 PR 之前 commit + push。主腦 merge 後 review。

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
