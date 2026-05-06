# Context Panel 模組

## 範圍限制
只能修改 src/panels/context/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/scene-tree/、src/panels/properties/、src/panels/viewport/、src/panels/environment/、src/panels/project/、src/panels/settings/。

## 慣例
- 透過 bridge signal（`selectedUUIDs` / `nodes` / `sceneVersion` / `getNode` / `editor.sceneDocument.serialize`）取得狀態，不直接操作 core
- 持久化 panel UI 狀態用 `useAreaState`（area-scoped），不要自己寫 localStorage
- 樣式用 CSS Modules（colocated `*.module.css`）+ `var(--bg-*)` token
