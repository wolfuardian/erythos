# Scripts Module Cache

_Last updated: 2026-04-18 by RDM_
_Module path: scripts/_
_Commit 前綴: [scripts]_

## 檔案速覽

| 檔案 | 職責（1 行） |
|------|-------------|
| `scripts/bump.js` | 版本號 bump（major/minor/patch），同步更新 package.json + package-lock.json |
| `scripts/audit/README.md` | audit script 使用說明與新增 panel seed 的 SOP |
| `scripts/audit/scene-tree.mjs` | Scene Tree panel 截圖：加 5 個物件 → overview / hover / selected |
| `scripts/audit/environment.mjs` | Environment panel 截圖：overview + hover-intensity（2 張） |
| `scripts/audit/properties.mjs` | Properties panel 截圖：overview / selected（Cube）/ input-focus（3 張） |
| `scripts/audit/viewport.mjs` | Viewport panel 截圖：overview / Wire / Shading / Render / selected-gizmo / Solid（6 張） |

## 常用 Pattern

- **ensureDevServer()**：每個 audit script 開頭 fetch `http://localhost:3000`，失敗即 `process.exit(1)`，提示跑 `npm run dev`
- **Dockview tab selector**：`.dv-default-tab-content`（無 ARIA role）+ `{ hasText: '...' }.first()` — 避免 strict-mode 錯誤，environment / properties / viewport 均採用
- **全頁截圖 fallback**：viewport / properties 的主截圖用 `page.screenshot()`（panel 無唯一文字 selector），scene-tree / environment 用 `panel.screenshot()`（有唯一文字）
- **port 3000**：所有 audit script 硬編 `DEV_URL = 'http://localhost:3000'`，不可假設其他 port
- **輸出目錄**：`.ai/audits/<panel>/`，`mkdirSync(..., { recursive: true })` 自動建立
- **bump.js 標記檔**：minor / major bump 會建立 `.version-bumped` 空檔，供 pre-commit hook 偵測跳過 patch 自動遞增

## 跨檔依賴

- 所有 audit script → `playwright`（devDependency）
- `scripts/audit/README.md` → 描述 `npm run audit:<panel>` 的 package.json scripts 入口
- `bump.js` → `package.json` + `package-lock.json`（repo root）

## 已知地雷

- **strict-mode 多元素 selector**：Dockview 的 tab 與 panel header 都含相同文字（如 "Scene"），`getByText` 或 `locator` 若不加 `.first()` 會因多元素命中而丟 strict-mode violation（#379 教訓）
- **viewport.mjs getByText('Scene').first()**：viewport.mjs 已在 L54 / L88 加 `.first()`，其他 script 用 `{ exact: true }` + `.first()` 雙重保險
- **Viewport tab 可能不存在**：viewport.mjs 用 `viewportTab.count()` 判斷，若 Viewport 是無標籤中央區則跳過點擊（#379 實作）
- **reload 後 panel locator 超時**：fresh browserContext 無 localStorage，`applyDefaultLayout()` 重跑後須等 `networkidle` + 額外 waitForTimeout，否則 panel locator 可能超時（#380 教訓）

## 最近 PR

- #379 新增 viewport audit script（strict-mode + tab 存在性判斷）
- #380 leaf panel audit（reload 後 locator 超時 fallback 教訓）
