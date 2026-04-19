# Panel 視覺審計 Seed Scripts

這些 script 餵截圖給 DV (Design-Visual) 做視覺美感審計。

## 執行

1. 另開 terminal 跑 `npm run dev`（dev server 必須在 3000）
2. 跑對應 audit script，例：`npm run audit:scene-tree`
3. 截圖產出到 `.claude/audits/<panel>/`

## 新增 panel seed

1. 複製 `scripts/audit/scene-tree.mjs` 成 `scripts/audit/<panel>.mjs`
2. 改 URL 路徑（若非首頁）與 selector 以進入目標 panel
3. 建立該 panel 需要的測試狀態（例如點 toolbar 加物件、切 tab、填 form）
4. 截 overview + 重要互動狀態（hover / selected / dragging / empty）
5. 在 `package.json` 加 `"audit:<panel>": "node scripts/audit/<panel>.mjs"`

## 原則
- **機械化**：寫死序列，不依賴 LLM 判斷
- **可復現**：每次跑同一 panel 產生視覺上近似的截圖（像素完全一致不強制）
- **獨立**：不修改 repo 任何狀態（除了 .claude/audits/ 下截圖）
