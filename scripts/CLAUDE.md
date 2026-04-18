# Scripts 模組

## 範圍限制
只能修改 `scripts/` 底下的檔案。
可修改根 `package.json`（新增 npm scripts 與 devDependencies）。
可修改根 `CLAUDE.md`（新增 scripts 模組到「開發模組清單」表格）。
不得修改 `src/`、既有的 `.ai/roles/`、其他模組 `CLAUDE.md`。
輸出目標僅限 `.ai/audits/<panel>/` 目錄下的圖片檔（由 script 執行時產生）。

## 當前任務
<!-- 待填入 -->

## Summary
- Add `scripts/audit/project.mjs` to seed Project panel screenshots for DV review
- Add `audit:project` npm script to `package.json`
- Covers Hub empty state, Hub New overlay, Editor overview, filter states, asset selected, asset hover

## Technical approach
`window.showDirectoryPicker` is gesture-gated and cannot be driven headless. The script uses `page.addInitScript` to stub the picker, returning a pre-populated OPFS handle so `ProjectManager.addFromDisk()` transitions the UI to Editor/Browser mode without any native dialog.

## Test plan
- [ ] `npm run dev` in separate terminal
- [ ] `npm run audit:project`
- [ ] Verify 7 PNGs in `.ai/audits/project/`
- [ ] Verify hub-empty shows "No recent projects." text
- [ ] Verify editor-overview shows Assets section with all 7 mock files
- [ ] Verify filter-scene-only shows only `demo-scene.json`
- [ ] Verify asset-selected shows `rock.glb` row highlighted

refs #370
EOF
)"
```

## 通用 SOP
遵守 [開發成員 SOP](../.ai/roles/developer.md)。

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
