# Session 狀態（2026-04-18 — subAD 廢除 + Opus 4.7 適配 + Skill 遷移）

## 本 session 完成

- **#390 hover phase 1** merged（PR #392 / `9a18425`）
- **#391 subAD 廢除** merged（PR #393 / `d2908a1`，AH 親自）
- **CLAUDE.md 大改**為 Opus 4.7 適配（`7f76224`）— 204 行，9/9 驗收勾選
- **10 個 skill 遷移**：
  - Erythos `.claude/skills/`：8 role + 1 flow（`flow-db-lookup`）
  - User-level `~/.claude/skills/`：`session-startup` + `session-handoff`（通用，路徑寫死）
- **Session 路徑** `.ai/session/` → `.claude/session/`

## Pipeline 終點

Master 含本次 handoff commit。0 active worktree / 0 open PR。Open issues：#330、#355（舊技術債）。

## 下個 Session 第一步

**執行 `/session-startup` skill**（它讀本檔後刪）。然後驗證 skill 觸發精度。

## 未完成待辦（按優先序）

1. **驗證 skill 觸發**：下次 dispatch `role-tasker` / `role-developer` 觀察 description 精度、`model` / `effort` frontmatter 是否被套用
2. **清理殘留**：`.ai/roles/*.md` 已被 skill 取代 → 可刪 / 封存；`.ai/WORKFLOW.md` 922 行**未 4.7 適配**（步驟清單 + R.x 章節）→ 用 `.ai/prompts/claude-md-refactor.md` 工具重構。**先確認 skill 運作再動**
3. **Hover phase 1 視覺驗收**：`--bg-hover` #383838 對比度是否夠
4. **Hover phase 2**：viewport-tab / settings / project-hub（首次用「AH 直接派多 AD 並行」模式）
5. **舊技術債** #330 / #355

## Fallback（若 skill 載入失敗）

讀對應 `.ai/roles/<name>.md`。若遇此況，優先任務變為「修 skill discovery」而非「做原任務」。

## 非顯而易見偏好（本 session 新增，已存 memory）

- `feedback_concise_response.md` — 回應精簡（少選項表 / 少 insight block）
- `feedback_ah_owns_process.md` — 流程相關改動 AH 親自（不派 AD）
- `feedback_skill_naming_convention.md` — skill 扁平 + 前綴 `role-` / `flow-` / `ref-`；description 不寫「這是角色」；路徑寫死不搞彈性
- `feedback_subagent_one_layer_limit.md`（已 update 為完成態）— Claude Code 1 層 spawn 限制

**戰略層**：Opus 4.7 適配 = 「指導怎麼做 → 定義意圖與驗收」哲學反轉，本次所有改動底層動機。

## 重要工具 / 檔案

- `.ai/prompts/claude-md-refactor.md` — 通用重構工具，下次重構 WORKFLOW.md / roles/ 時貼用
- `.claude/skills/*/SKILL.md` — 9 個 Erythos skill
- `~/.claude/skills/session-*` — user-level session 機制（跨專案）
