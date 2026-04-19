# Scripts 模組

## 範圍限制
只能修改 `scripts/` 底下的檔案。
可修改根 `package.json`（新增 npm scripts 與 devDependencies）。
可修改根 `CLAUDE.md`（新增 scripts 模組到「開發模組清單」表格）。
不得修改 `src/`、其他模組 `CLAUDE.md`。
輸出目標僅限 `.ai/audits/<panel>/` 目錄下的圖片檔（由 script 執行時產生）。

## 當前任務
<!-- 待填入 -->

## 慣例
- Node script 使用 ES module (`.mjs`)
- 優先使用既有 devDependencies，避免新增
- Scripts 應能從 repo root 直接執行（`node scripts/.../foo.mjs`）
- 不得假設使用者先 `cd` 到子目錄
- 截圖輸出目錄統一放 `.ai/audits/<panel>/`（已在 .gitignore 外，會被 commit 是預期）

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
