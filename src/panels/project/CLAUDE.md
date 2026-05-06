# Project Panel 模組

## 範圍限制
只能修改 src/panels/project/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/scene-tree/、src/panels/properties/、src/panels/viewport/、src/panels/environment/、src/panels/context/、src/panels/settings/。

## 慣例
- 檔案 I/O 一律走 `editor.projectManager`（readFile / importAsset / close 等），不直接操作檔案系統
- Asset 拖放 dataTransfer key 約定：`application/erythos-prefab`、`application/erythos-glb`、`application/erythos-glb-list`
- 透過 bridge signal（`projectFiles` / `projectName` / `confirmBeforeLoad` / `currentScenePath`）取得狀態，不直接操作 core
- panel UI 狀態（viewMode / searchQuery / selectedFolder / activeFilters）用 `useAreaState` 持久化；transient 選擇狀態用 `createSignal`
- 樣式用 CSS Modules（colocated `*.module.css`）+ `var(--bg-*)` token；CSS 變數動態注入（如 `--type-color`）屬 `docs/styles-convention.md` 的 inline-allowed 例外
