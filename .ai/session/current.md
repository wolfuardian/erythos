# Session 狀態（2026-04-17 下半場）

## 核心進展：DV 視覺審計流程建立 + scene-tree PoC 驗證成功

本 session 從「UI 視覺美感盤點」的三題 Q 開始，落地出：

1. **新角色 DV（Design-Visual）**：`.ai/roles/design-visual.md`
   - 只讀截圖 + theme.css 寫中文美感問題清單
   - 不碰 Playwright、不讀 src、不做 code review、不給修法建議
   - 與 MP 差別：MP 畫草案，DV 審活網頁
   - 設計要點：明確「你不是 code reviewer」邊界，避免 Sonnet 降級成工程審查

2. **PoC 驗證（scene-tree panel）**：
   - 首次跑 DA（Design-Auditor 舊命名）時，Playwright 權限被拒自動降級成靜態 code review（22 個工程問題，存 `.ai/audits/scene-tree-engineering.md` 當 DE 樣本）
   - 診斷後拆分為 DV（視覺）/DE（工程）兩職能，先做 DV
   - AH 親操 Playwright MCP 截 overview/hover/selected 三張圖
   - spawn DV（Sonnet）讀圖 → 10 個視覺問題，整體印象「功能到位但視覺未收尾」直白判斷
   - 報告：`.ai/audits/scene-tree.md`

3. **Issue #359 基建**（走完整流程中）：
   - Title: `[scripts] audit 基建：playwright seed script pattern`
   - Worktree: `C:\z\erythos-359-audit-seed` @ `feat/audit-seed`
   - 新模組 `scripts/`（含 CLAUDE.md 範圍限制 + 當前任務）
   - AD (aa80fd7c5c99b2d34) 背景跑中 — session 結束時尚未開 PR

## 下一個 session 要做（優先序）

### 1. 接力 #359 基建
- **先做**：`gh pr list` 看 #359 有沒有開 PR
  - 若 PR 開了 → spawn QC 審查
  - 若 AD 卡住或未完成 → 檢查 worktree 狀態，可能需要 reset 或 spawn 新 AD
- **QC PASS 後** → merge + cleanup（含清 scripts/CLAUDE.md 當前任務）

### 2. 基建 merged 後：全站 audit
- 複製 `scripts/audit/scene-tree.mjs` 成其他 panel 的 seed：
  - `environment.mjs`（Environment panel，有 slider / select）
  - `properties.mjs`（Properties panel，form 類）
  - `assets.mjs`（Assets browser，filter bar + grid）
  - `viewport-controls.mjs`（Viewport toolbar + shading mode buttons）
  - `hub.mjs`（Hub 首頁，Hub 模式跟 Editor 模式切換要處理）
  - `leaves.mjs`（Leaves panel）
- 每 panel 跑 seed → spawn DV → 產出 `.ai/audits/<panel>.md`
- 可平行：5-6 個 panel 一次跑完

### 3. 全站 audit 完成後：批次修繕計畫
- 讀所有 `.ai/audits/*.md`，整理跨 panel 共通問題（例如多個 panel 都說 hover 太弱 = 系統性問題）
- 決定修繕順序：
  - A 類單點可修（每 panel 一個 issue 或多 panel 併一個）
  - B 類需 MP 設計方案（badge 色系重做、狀態視覺系統）
  - C 類通盤設計（留 knowledge.md 記錄，不急著動）
- 可能需要 `.ai/roles/design-engineer.md`（DE）角色來處理「工程健康檢查」

### 4. 原本 4 個 open issue（還沒處理）
- #330 [core] 巢狀 Mesh 重複渲染（等藝術家資產觸發）
- #343 [styles] theme.css polish（可併入 UI 修繕大計畫）
- #349 [styles] 補 `--badge-geometry` token（可直接修或併入視覺系統 issue）
- #355 [viewport] refactor: computeDropPosition（技術債，獨立處理）

## 本次產生的新原則（已寫入 memory）

- **`feedback_role_naming_clarity.md`**：角色一多縮寫會碰撞，8+ 角色需全盤重命名

## 重要思考：機械化原則（指揮家提出）

> 「這種複雜的端到端測試最好還是能讓頻繁處理的行為變為機械式的，盡可能使其可靠可復現」

這句話驅動了 #359 的設計：不靠 LLM 即時判斷（AH 手操 Playwright），改寫 node script 版控化。下 session merge 後這成為 DV 流程的核心基建，應該寫進 knowledge.md「audit 方法論」章節。

## 指揮家本 session 決策摘要

- DA → DV/DE 拆分：同意 A+C 混搭（AH 截圖餵 DV + 拆角色）
- PoC 選 scene-tree（row 典型、非近期大改）
- 中文報告、整 panel 截圖加座標標註
- 資料用 C:\z\erythos\samples\question_block.glb（實際 PoC 用 + Cube toolbar 代替更快）
- 批准「基建先 → 全站 audit → 批次修繕」順序

## Session context 觀察

- 本 session 主軸從 UI 美感討論 → 流程設計 → PoC → 基建 issue
- 兩次自我修正：DA 降級成 code review → 拆角色；AH 手操 → 機械化 script
- 指揮家適時提醒「角色命名」「機械化」兩個通用原則，顯示他在思考**方法論層**而非具體問題
- Pipeline 終點：1 active worktree（#359），1 AD 跑中，5 open issue，master clean（57850a6 pushed）

## 懸念備註

- `.ai/audits/scene-tree-engineering.md`（22 個工程問題）已 commit 留存，未來 DE role 建立時參考，**不要當 scene-tree.md 用**（已覆蓋）
- 下 session 若發現 AD 產出的 seed script 跑出來的截圖與本 session AH 手操版本差異大，代表 locator 不穩定，需補強（例如改用更穩的 CSS selector 取代 sparse text match）
- Playwright MCP 工具如果還要主腦直接用，每個 session 都要 ToolSearch load（它們是 deferred）
