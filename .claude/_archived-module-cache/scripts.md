# Scripts Module Cache

_Last updated: 2026-04-18 by PM (PR #389)_
_Module path: scripts/_
_Commit 前綴: [scripts]_

## 檔案速覽

| 檔案 | 職責（1 行） |
|------|-------------|
| `scripts/bump.js` | 版本號 bump（major/minor/patch），同步更新 package.json + package-lock.json |
| `scripts/audit/scene-tree.mjs` | Scene Tree panel 截圖：加 5 個物件 → overview / hover / selected |
| `scripts/audit/environment.mjs` | Environment panel 截圖：overview + hover-intensity（2 張） |
| `scripts/audit/properties.mjs` | Properties panel 截圖：overview / selected（Cube）/ input-focus（3 張） |
| `scripts/audit/viewport.mjs` | Viewport panel 截圖：overview / Wire / Shading / Render / selected-gizmo / Solid（6 張） |
| `scripts/audit/leaf.mjs` | Leaf panel 截圖：empty-state / overview / hover / selected（4 張）；用 IndexedDB fixture 注入 |
| `scripts/audit/project.mjs` | Project panel 截圖：hub-empty / hub-new-overlay / editor-overview / filter-scene-only / filter-model-only / asset-selected / asset-hover（7 張）；用 OPFS stub 繞過 file picker |
| `scripts/audit/settings.mjs` | Settings panel 截圖：overview / checkbox-hover（2 張）；用 panel `filter({ hasText: 'Confirm before loading scene' })` 定位 |
| `scripts/audit/context.mjs` | Context Menu 截圖：menu-no-selection / menu-with-selection / menu-item-hover / menu-submenu / menu-disabled（5 張）；右鍵 Scene Tree 空白區與物件 row |

## 常用 Pattern

- **ensureDevServer()**：每個 audit script 開頭 fetch `http://localhost:3000`，失敗即 `process.exit(1)`，提示跑 `npm run dev`
- **Dockview tab selector**：`.dv-default-tab-content`（無 ARIA role）+ `{ hasText: '...' }.first()` — 避免 strict-mode 錯誤，所有 audit script 均採用
- **全頁截圖 fallback**：viewport / properties / project 的主截圖用 `page.screenshot()`（panel 無唯一文字 selector）；scene-tree / environment / leaf 用 `panel.screenshot()`（有唯一文字）
- **port 3000**：所有 audit script 硬編 `DEV_URL = 'http://localhost:3000'`，不可假設其他 port
- **輸出目錄**：`.claude/audits/<panel>/`，`mkdirSync(..., { recursive: true })` 自動建立
- **bump.js 標記檔**：minor / major bump 會建立 `.version-bumped` 空檔，供 pre-commit hook 偵測跳過 patch 自動遞增
- **IndexedDB fixture 注入（leaf.mjs）**：`page.evaluate()` 在瀏覽器端開 IndexedDB → 寫入假資料 → `page.reload({ waitUntil: 'networkidle' })` → 額外 `waitForTimeout(500)` 讓 editor.init() async 完成（IndexedDB read + signal propagation），解決 fresh context 空資料問題
- **OPFS stub（project.mjs）**：`page.addInitScript()` 注入 `window.showDirectoryPicker` stub → 回傳含子目錄 + 假資產的 OPFS handle，並 patch `FileSystemDirectoryHandle.prototype.requestPermission / queryPermission` 回傳 `'granted'`，讓 headless 模式繞過 native file picker

## 跨檔依賴

- 所有 audit script → `playwright`（devDependency）
- `bump.js` → `package.json` + `package-lock.json`（repo root）

## 已知地雷

- **strict-mode 多元素 selector**：Dockview 的 tab 與 panel header 都含相同文字（如 "Scene"），`getByText` 或 `locator` 若不加 `.first()` 會因多元素命中而丟 strict-mode violation（#379 教訓）
- **viewport.mjs getByText('Scene').first()**：viewport.mjs 已在 L54 / L88 加 `.first()`，其他 script 用 `{ exact: true }` + `.first()` 雙重保險
- **Viewport tab 可能不存在**：viewport.mjs 用 `viewportTab.count()` 判斷，若 Viewport 是無標籤中央區則跳過點擊（#379 實作）
- **reload 後 panel locator 超時**：fresh browserContext 無 localStorage，`applyDefaultLayout()` 重跑後須等 `networkidle` + 額外 waitForTimeout，否則 panel locator 可能超時；leaf.mjs 加 try/catch fallback 全頁截圖（#380 教訓）
- **editor.init() async + signal propagation**：`networkidle` 不保證 editor.init()（IndexedDB read + leafStoreChanged emit）已完成；leaf.mjs 在 reload 後加 `waitForTimeout(500)` 讓 signal propagation 完成再定位 panel（#386/#389 修正）；overview panel locator timeout 從 3000 升至 5000（#389）
- **project.mjs OPFS 原型 patch**：`queryPermission / requestPermission` 必須 patch 在 prototype 上（instance patch 在 structured clone 後失效），否則 `openRecent()` 找不到 handle
- **Dockview 無 ARIA / data-view-id**：不按 W3C 標準假設，所有 tab 用 `.dv-default-tab-content`，panel content 容器用 `.dv-content-container`（`filter({ hasText: '<panel 內唯一文字>' })` 定位）
- **`getByText('Scene', { exact: true })` 碰巧 work**：Scene panel 內文連 row 文字，`exact` 剛好只命中 tab 字；其他 panel 內文簡單 header 純文字會跟 tab 撞名，**此 pattern 不可套用**（#362 三輪教訓）

## 最近 PR

- #379 新增 viewport audit script（strict-mode + tab 存在性判斷）
- #380 leaf panel audit（reload 後 locator 超時 fallback 教訓）
- #381 project panel audit（OPFS stub 繞過 file picker，7 張截圖）
- #382 settings panel audit（overview + checkbox-hover 2 張，package.json 新增 `audit:settings` script）
- #383 context menu audit（5 張：no-selection / with-selection / item-hover / submenu / disabled，package.json 新增 `audit:context` script）
- #389 leaf audit fixture 修正：reload 後加 waitForTimeout(500) 解決 async init + signal propagation；overview panel locator timeout 3000→5000
