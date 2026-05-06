# Scene Tree 模組

## 範圍限制
只能修改 src/panels/scene-tree/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/viewport/、src/panels/properties/。

## 慣例
- 透過 bridge signal 取得狀態，不直接操作 core
- 選取物體透過 `editor.selection.select()`
- 用 SolidJS 響應式更新 UI
