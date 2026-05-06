# Settings Panel 模組

## 範圍限制
只能修改 src/panels/settings/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/app/、src/panels/scene-tree/、src/panels/properties/、src/panels/viewport/、src/panels/environment/、src/panels/context/、src/panels/project/。

## 慣例
- 透過 bridge signal 讀設定，透過 bridge setter（如 `setConfirmBeforeLoad`）寫設定，不直接操作 core
- 樣式用 CSS Modules（colocated `*.module.css`）+ `var(--bg-*)` token
