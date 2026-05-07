# Initiatives — token 通膨對抗

來源:2026-05-06 session(指揮家提議)。

逐條追進度與優先度,**沒有「可省略」項** — 全部都要做,差別只在排序。

狀態符號:`[ ]` todo / `[~]` in-progress / `[x]` done
優先度:**P0** 必先動手 / **P1** 重要 / **P2** 可後排

---

## A. 臨時程式 → python 工具

`project-info` 系列為正確方向示範。條件:重複 ≥ 3 次的 workflow 才工具化(避免一次性 audit 寫成工具的反例)。

- [x] **P1** 盤點過去 N 次 session 的高頻 workflow,挑出工具化候選清單(候選見 `.claude/scratch/audit-frequent-workflows.md`)
- [x] **P2** 挑前 3 條撰寫 `.mjs` 腳本(命令式介面、輸出乾淨,類比 `project-info` 但走 Node 對齊 TS 全棧)
  - [x] 1. `new-command.mjs <ClassName> <module> <ComponentType>` — 生成 Set*PropertyCommand 同構 boilerplate(PR #806)
  - [x] 2. `new-panel.mjs <PanelName>` — 生成 panel 4 檔 + Dockview 註冊 + EditorSwitcher 3 處接線(PR #808)
  - [x] 3. `worktree.mjs create|cleanup <branch>` — AD worktree 生命週期管理(PR #807)

## B. 機械化 contract(codebase 不變性 / 認知熵控制)

機械化的好處不只省 review,是確立「任何新人寫都會從同樣地方長出來」的不變性。

- [x] **P0** 模組邊界 — ESLint `no-restricted-imports`(PR #809;Rule 1 core 不 import UI 全 clean;Rule 2 panels 不 runtime import core 開 `allowTypeImports`,16 violations 留 Step 2 砍 panel + Step 3 bridge 化清完後升嚴)
- [x] **P0** Command 模式遵守 — `scripts/check-command-pattern.mjs`(PR #810;4 mutator addNode/removeNode/updateNode/deserialize,main 全 PASS)
- [ ] **P1** CSS Modules + inline 例外清單 — grep `style={{` 排除允許 case(每幀座標、CSS 變數注入)
- [ ] **P1** data-testid 結構 — horizontal group 內命名 pattern 一致
- [ ] **P2** `three/examples/jsm/` 後綴 — grep 一行(build 已部分抓,做完防漏)

## C. Panel 階層架構統一

panel 統一 anatomy = `Panel > PanelHeader + PanelContent`,Viewport 為合理例外(純 canvas)。

- [x] **P0** components/ 開五件套 `<Panel>` / `<PanelHeader>` / `<PanelToolbar>` / `<PanelContent>` / `<PanelFooter>` + `<PanelEditorSwitcher>` 拆出讓 PanelHeader 變純 layout(PR #828)
- [x] **P0** 既有 panel migration 套骨架(scene-tree / properties / project / viewport;prefab/environment/console/context/settings 已 cut)(PR #828)
- [x] **P1** ESLint / grep rule:panel 模組根元件必須是 `<Panel>`,不是 → fail(PR #829;`scripts/check-panel-root.mjs` 透過 `index.ts` `component:` 反查 dockview panel,自動排 floating overlay;併入 `npm run check`;`new-panel.mjs` 同步五件套樣板)

## D. Spec 機械可驗化(分工破口)

spec 寫成機械可驗 contract = sonnet/haiku 跑 + CI 綠燈 = pass,Opus 不審 contract 違反,只審 judgement(架構 / UX)。是 hierarchical task decomposition 的真正破口,沒有它分工只是把 Opus bottleneck 從「實作」搬到「審 PR」。

- [ ] **P1** 設計「contract-style spec」template — 寫 invariant / acceptance criteria,不寫 step-by-step 實作
- [ ] **P2** 既有 issue 模板更新,加機械驗收欄位
- [ ] **P2** 嘗試 1-2 個 sonnet AD 任務走純 contract spec,實測 Opus review 時間省下多少

---

## 進度回報慣例

- AH 完成一條 → 直接劃 `[x]`
- AH 進入 in-progress → 改 `[~]`(同時 session 只該有 ~1 條 in-progress)
- 新增 idea → 寫進對應主題章節(A/B/C/D 之外要新增主題就加 E、F...)維持 P0/P1/P2 標注
- 完成的條目可保留(歷史) 或在年度盤點時搬到 `.claude/decisions/log.md` 一行總結
