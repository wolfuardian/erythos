# Components 模組

## 範圍限制
只能修改 src/components/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/panels/、src/app/。

## 慣例
- 遵循 Toolbar.tsx 現有的元件風格和按鈕寫法
- 用 createSignal 管理元件內部狀態
- ErrorDialog 是通用元件：不要在裡面寫死任何 GLTF 字樣
- 匯出 ErrorDialog 讓其他模組也能用
- 元件一律用 named export（`export { Foo }`），不用 default export，確保跨模組 import 一致
- 全域事件 listener（keydown、resize 等）必須用 `createEffect` 搭配 `onCleanup`，依響應式狀態動態綁定/解綁，不可在 `onMount` 中無條件註冊
- `data-testid` 導入：當一個組件檔案包含多棵獨立 DOM 樹（如 trigger + Portal popup、主體 + overlay），每棵樹的根都各自掛 `data-testid`，命名 pattern `<parent>-<purpose>`（例：`editor-switcher` + `editor-switcher-dropdown`）。這是業界標準 attribute（Playwright / Cypress / Testing Library 通用），在本專案的角色是「穩定識別碼」— 給指揮家 / agent 精準定位元素用，未來加 E2E 測試直接複用
- `data-testid` 結構一致性：同一 horizontal group（如 Toolbar 的直屬子元素）內，每個直屬子元素都應有 wrapper + 自身 `data-testid`，**避免「無 testid 匿名 wrapper 包住有 testid 元素」這種混合結構**。命名 pattern 同上 `<parent>-<purpose>`（例：`toolbar-brand` / `toolbar-autosave-dot` / `toolbar-project` 為 toolbar 直屬兄弟）
- `data-testid` 邊界：`data-testid` 標到 horizontal group 的 wrapper 層即可，元件內部排版/視覺零件（純 layout / styling 用的 inner element）不需繼續往下標 testid。例外：內部存在 prefab / sub-component（可重用、可獨立識別的子元素）時才繼續標（例：`toolbar-workspace-tabs` wrapper → 內部 `toolbar-workspace-tab` 是 sub-component 故有 testid）
