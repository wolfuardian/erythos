# Session 狀態（2026-04-20 — Twilight persona 全面落地）

## 本 session 完成

### Twilight persona 視覺系統（7 PRs 合成）
- `f471d58` (#411) Twilight 主體：色 tokens（bg/text/accent/border）+ `--shadow-well-outer/inner/input-inset` + panel outer deep + section inner deep + input inset + dialog/menu 套用，16 檔
- `4115688` (#413) 追補：fieldStyles 棄底線改 inset 方框、XYZCell 單一 inset 容器、FoldableSection subsection variant（原 `deep` rename）、新增 `--bg-subsection/subheader/shadow-well-subtle` tokens
- `c34a032` (#415) Dockview tab：CSS-only（無 renderer），Subtle 3px border-top-radius，active tab height=32 填滿、inactive 28 align-self flex-end，無 close X（`.dv-default-tab-action` hide），右鍵 ContextMenu → `DockviewApi.removePanel`
- `a5bc565` (#417) Panel header bg：5 檔 6 處加 `background: var(--bg-header)` 讓 active tab 與 panel header 色塊連續
- `d5c09a9` (#419) 抽 `<PanelHeader title actions>` 共用組件 + 8 panel 遷移；ViewportPanel 拆內外兩層（container 外層 flex column，canvasRef 內層掛 Three.js + drag overlays）；Settings/Context 補 header；Project 兩模式用 actions slot
- `71a0f7d` (#421) Panel root 左右 3px margin + `width: calc(100% - 6px)` + `box-sizing: border-box`（8 檔）
- `beb4c4b` (#423) `--dv-separator-border: transparent`（單行，dockview split 分隔線）

### 流程 / 清理
- `0d14706` 刪 `.claude/skills/role-advisor/SKILL.md`（前 session 切換到內建 advisor() 工具的殘留 uncommitted deletion）
- 清除 5 個 orphan worktree 目錄（C:/z/erythos-410-twilight-tint / -412-twilight-followup / -panel-header-bg / -panel-header-shared / -tab-redesign）— git worktree list 乾淨，檔案系統殘留由 rm -rf 手動處理
- Memory `reference_variant_a_tint_v2.md` 更新：標註 input 底線 + blue focus 被 Twilight inset 方框 + gold focus 推翻；補充「新 source of truth = `.claude/previews/twilight-*.html` 系列」
- Mockup 13 檔入 `.claude/previews/`（twilight-deep-deep / section-xyz / subsection / tab-v3-radius 等）

## 遇到的問題

1. **Variant A tint v2 input 底線設計被推翻** — 指揮家選 Twilight mockup 的 inset 方框後，Variant A 的 `border-bottom` + blue focus 正式退場。memory 已標註狀態更新，但 `reference_variant_a_tint_v2.md` 仍保留作 design history
2. **AD 視覺判斷 2 次偏離 mockup** — tab 樣式第一版 inactive tab 沒設 `background: transparent` 導致整 tab bar 被 bg-header 覆蓋（AD 只依賴 `--dv-activegroup-hiddenpanel-tab-background-color` var 但 dockview 忽略）；必須強制 CSS `!important`。二次是 panel header bg 未對齊 tab（根因 panel root `--bg-panel` 而非 `--bg-header`，#417 補正）
3. **Panel header 被 panel root radius 裁切** — panel root `border-radius: var(--radius-lg)` + `overflow: hidden` 讓 PanelHeader 頂部呈圓角。解法走 #421（左右 3px margin 讓整個 panel 變卡片浮在 group 中，圓角視覺自然）
4. **dockview var 非全域生效** — `--dv-tabs-and-actions-container-background-color` 等對 tab bar container / hidden tab 的 bg 在實際 render 不套用，需 `.dv-tab.dv-inactive-tab { background: transparent !important }` 強制。記住 dockview theme var 不可全信
5. **ViewportPanel canvas 拆層** — Three.js 原掛在 `containerRef`，加 PanelHeader 後需拆成外 containerRef（flex column + drag events + contains 判斷）+ 內 canvasRef（flex:1 + Three.js mount + computeDropPosition × 3 處）。既有絕對定位 overlay（toolbar / drag overlay / settings panel）留在 canvasRef 內不破
6. **`--bg-tab-bar` token 未新增** — mockup 設計 #14161e，AD 復用 `--bg-app` #11131c 省新增。QC 標灰色地帶，指揮家視覺 audit 未追補

## 未完成待辦

1. **ViewportPanel 右上角 Toolbar overlay 未整合進 PanelHeader actions** — #418 scope 外，follow-up
2. **`--bg-tab-bar` 新 token 是否追補** — 視覺差 3 hex 階（#11131c vs #14161e），指揮家未堅持
3. **3 個模組 DB 缺口 / 過時** — `app.md`（缺，AT 兩次提到）、`components.md`（缺）、`properties.md`（variant deep → subsection 過時）。建議下個 session 派 EX 補
4. **ProjectPanel Browser mode 字型風格改變** — 原 text-secondary + bold，遷移到 PanelHeader 後變 text-muted + uppercase。QC 標灰色地帶，指揮家視覺 audit OK 未回頭

## 下個 session 第一步

執行 `session-startup` + `flow-pipeline-state-detect`。預期狀態：
- Pipeline 乾淨（0 open issue / 0 open PR / 0 worktree / master ahead origin 0）
- 可繼續：3 DB 補（派 EX × 3）/ Viewport toolbar 整合 PanelHeader actions / bg-tab-bar 追補 / 指揮家新方向

若無新題，建議先派 EX 補 app + components DB（properties 已存在，刷新即可），避免下次 AT 工作又標缺口。

## 觀察到的偏好（非顯而易見）

- **直接貼 DOM / HTML / 截圖定位問題**，比文字描述快。指揮家習慣用「附圖 + 貼 HTML」一次說清
- **「另開 issue」傾向** — 一旦 PR QC PASS 就寧可 merge，追補新需求另開。不疊入已 PASS 的 PR 讓它 stale
- **Mockup 迭代節奏**：第一輪寬方向（3-4 選項）→ 指揮家粗選 → 第二輪細化（2-3 微調）→ 拍板。每輪都要派 MP
- **「保留現狀扁平佈局」本能** — MP 加 Inner Deep 框時被指揮家糾正說「XYZ 保持 flat」「子面板接近現況 flat」。mockup 不要過度 enhance
- **視覺 audit 由指揮家親自執行**（DV 不主動跑），QC 只做 code-level。所以 QC PASS 後還要等指揮家視覺確認才能 merge
- **收工前指示清理物理資源** — git worktree remove 不會刪檔案系統殘留，需 rm -rf

## 重要 commit / 檔案

- Session 最後 commit：`beb4c4b`（#423 merge + `4fd0beb` 收尾 package.json bumpver）；實際最後 SHA 以當前 master 為準
- Memory 更新：`reference_variant_a_tint_v2.md`（Twilight 推翻 input 底線）
- 新增 mockup：`.claude/previews/` 13 個 HTML（twilight-* 系列 + 子面板 / tab 變體 / section-xyz 等）
- 新增共用組件：`src/components/PanelHeader.tsx`（唯一新增 .tsx 檔）
- 新 tokens in theme.css：`--shadow-well-outer/inner/input-inset/well-subtle` / `--bg-subsection/subheader` / `--accent-gold` / `--border-focus` 改 gold
