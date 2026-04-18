# Session 狀態（2026-04-18 — 超級大調整：subAD 廢除 + Opus 4.7 適配 + Skill 全遷移）

## 本 session 完成

### 1. Pipeline 驗收（新角色首次實戰）
- **#390 hover phase 1** 全流程閉環（EX / subAD 試水 / QC / PM）— 25 分鐘完成
- subAD 機制實測**失敗**（Claude Code 架構 1 層 spawn 限制，agent 不含 Agent tool）→ 概念廢除
- **#391 subAD 廢除** PR #393（AH 親自完成，非派 AD）

### 2. 流程規範大改
- `.ai/roles/advisor.md` → `consultant.md` 重命名（避免與 Claude 內建 `advisor()` 衝突）
- **CLAUDE.md 大改**為 Opus 4.7 適配版本：意圖驅動 / 契約式 / 非目標清單 / skill 化
- **10 個 skill 全部建立** 於 `.claude/skills/<name>/SKILL.md`

### 3. Skill 清單（10 個）

Role（8）：`role-advisor` / `role-explorer` / `role-mock-preview` / `role-design-visual` / `role-tasker` / `role-developer` / `role-pr-qc` / `role-pr-merge`

Flow（2）：`flow-session-startup` / `flow-db-lookup`

扁平命名 + 前綴分類（`role-` / `flow-` / `ref-`）— Claude Code discovery 只掃第一層，不支援巢狀。

## Pipeline 終點

- **Master @ `4f0c74f`**（已 push）
- 0 active worktree / 0 open PR
- Open issues：#330 #355（舊技術債）

## 下個 Session 優先序

### ★ 最優先：skill 生效驗證（**假設尚未實測**）
- 下次實際 dispatch `role-tasker` / `role-developer` 時觀察：description 觸發是否精準？frontmatter `model` / `effort` 是否被正確套用？
- 若 skill 載入失敗 → fallback 到 `.ai/roles/*.md`（未刪）

### 次優先：清理殘留
- `.ai/roles/*.md` 已被 skill 完全取代 — 可刪或封存至 `.ai/roles/.legacy/`
- `.ai/WORKFLOW.md` 922 行**未全面 4.7 適配**（仍有步驟清單 + R.x 章節）— 用 `.ai/prompts/claude-md-refactor.md` 為工具重構
- **判斷時機**：先確認 skill 真能運作（★ 最優先那項）再動，避免無 fallback

### 第三優先：實戰
- Hover phase 1 視覺驗收（`--bg-hover` #383838 夠不夠？不夠則 AH fast-path 1 行改）
- Hover phase 2（viewport-tab / settings / project-hub）— **首次用「AH 直接派多 AD 並行」模式**
- 舊技術債 #330 / #355

## 指揮家偏好觀察（本 session 新增，已全部存 memory）

- **回應要精簡**：多選項表 / 多 insight block 會讓閱讀效率遞減（`feedback_concise_response.md`）
- **流程相關 AH 親自做**：`.ai/roles/` / WORKFLOW.md / 根 CLAUDE.md 不派 AD（`feedback_ah_owns_process.md`）
- **Skill 扁平 + 前綴命名**：role- / flow- / ref-，description 不寫「這是角色」（`feedback_skill_naming_convention.md`）
- **Opus 4.7 適配是戰略優先**：「指導怎麼做 → 定義意圖與驗收」哲學反轉是本次所有改動的底層動機

## 重要文件位置

| 檔案 | 狀態 |
|------|------|
| `CLAUDE.md` | 新版（Opus 4.7 適配，204 行，9/9 驗收勾選） |
| `.ai/prompts/claude-md-refactor.md` | 重構工具（4.7 遷移指南），下次重構其他文件可貼用 |
| `.claude/skills/*/SKILL.md` | 10 個 skill |
| `.ai/roles/*.md` | 舊版，尚未刪除（保底 fallback） |
| `.ai/WORKFLOW.md` | 922 行，尚未 4.7 適配（仍含 R.x 章節與步驟清單） |

## 對下次 AH 的提醒

1. **第一步執行** `flow-session-startup` skill（不再手動跑 git worktree list 等）
2. **Skill 觸發精度未驗證** — 首次 dispatch 時注意觀察 description 是否精準 match
3. **Skill 載入失敗的 fallback**：讀對應 `.ai/roles/<name>.md`
4. `.ai/WORKFLOW.md` 若用到發現不合時宜，session 末可補調（但別一次重寫整份，用 `.ai/prompts/claude-md-refactor.md` 的 4 步流程）
5. **嚴格遵守 memory `feedback_concise_response.md`** — 指揮家今日明示對話精簡偏好

## 本 session commit 序

- `241b1a2` rename advisor.md → consultant.md + EX hover DB
- PR #392 → `9a18425` hover phase 1（properties/leaf/environment hover）
- PR #393 → `d2908a1` subAD 廢除
- `7f76224` CLAUDE.md 大改（Opus 4.7 適配）
- `28ff6b1` role-pr-merge skill + CLAUDE.md skill 清單前綴化
- `39915d7` mv CLAUDE-refactor-prompt → .ai/prompts/
- `31266c5` role-pr-qc
- `fb66655` role-tasker
- `1fd769c` 5 個 role-* skill batch（AD/EX/AA/MP/DV）
- `4f0c74f` 2 個 flow-* skill（session-startup / db-lookup）

## Memory 新增（本 session）

- `feedback_subagent_one_layer_limit.md`（文件遷移已完成，可考慮精簡）
- `feedback_ah_owns_process.md`
- `feedback_concise_response.md`
- `feedback_skill_naming_convention.md`
- `feedback_role_naming_clarity.md`（更新）
