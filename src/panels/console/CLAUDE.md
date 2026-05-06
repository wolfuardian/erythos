# Console Panel 模組

## 範圍限制
只能修改 src/panels/console/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/scene-tree/、src/panels/properties/、src/panels/viewport/、src/panels/environment/、src/panels/project/、src/panels/settings/、src/panels/context/。

## 慣例
- log 狀態來自 `src/utils/consoleCapture.ts`（全域 SolidJS signal），panel 直接 import，不走 bridge
- 樣式用 CSS Modules（colocated `*.module.css`）+ `var(--bg-*)` token
