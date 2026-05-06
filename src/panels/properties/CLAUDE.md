# Properties 模組

## 範圍限制
只能修改 src/panels/properties/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/viewport/、src/panels/scene-tree/。

## 慣例
- 透過 bridge signal 取得選中物體，不直接操作 core
- 屬性變更透過 editor 的 command 執行，確保 undo/redo
- 用 SolidJS 響應式更新 UI
