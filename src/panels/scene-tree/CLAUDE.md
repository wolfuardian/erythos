# Scene Tree 模組

## 範圍限制
只能修改 src/panels/scene-tree/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/viewport/、src/panels/properties/。

## 當前任務
<!-- 由主腦填寫，無任務時留空 -->

## 慣例
- 透過 bridge signal 取得狀態，不直接操作 core
- 選取物體透過 `editor.selection.select()`
- 用 SolidJS 響應式更新 UI

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
