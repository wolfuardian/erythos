# Environment Panel 模組

## 範圍限制
只能修改 src/panels/environment/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/scene-tree/、src/panels/properties/、src/panels/viewport/、src/panels/context/、src/panels/project/、src/panels/settings/。

## 慣例
- 透過 bridge.environmentSettings() 讀取環境設定
- 透過 editor.setEnvironmentSettings() 修改設定
- 樣式用 CSS Modules（colocated `*.module.css`）+ `var(--bg-*)` token，遵守 `docs/styles-convention.md`
