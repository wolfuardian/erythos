# WORKFLOW — AH 操作手冊

> AH（主腦）執行多角色協作流程時的操作細則。其他 4 個角色（AA / MP / AD / QC）有各自 `role-*` skill 為 canonical source；AH 沒有 skill（AH 即主對話），故本手冊為 AH 自身的執行參考。
>
> 專案契約（架構底線、模組清單、角色配置、分流決策表）見根 CLAUDE.md。本文件不重複 CLAUDE.md 已有條目。
>
> **2026-04-28 流程簡化**：原 10 角色（含 AT/PM/EX/DV）精簡為 5 角色。流水線 default 改為「fast-path 直做」，subagent 派遣只在多檔 / 高風險時觸發。詳見根 CLAUDE.md「分流決策表」。

---

## 1. 核心決策原則

### 1.1 成本結構

- **AH 是最貴的角色**：Opus 4.7 + 1M context 保持全貌理解，context 要留給決策和對話
- **多數 subagent 用 Sonnet**：執行型任務（實作、審查、視覺化）token 成本不能累積
- **明確指定模型**：每次 `Agent` 呼叫寫 `model: 'sonnet'` / `'opus'`，不指定會默默升 Opus（×4 成本）
- **小事直做比派 subagent 快 5-10x**：spawn 一個 sonnet subagent 也要 ~30s + context 整理。AH Edit + commit 5 秒搞定。

### 1.2 角色邊界紀律

- 每個角色只做一件事（實作 / 審查 / 視覺化 / 戰略諮詢）
- AD 不做 code review、QC 不寫 code
- subagent 單層：AH spawn 單層 agent，agent 不再 spawn 下層（Claude Code 架構限制）；並行需求由 AH 直接派多個 AD

### 1.3 Context 是寶貴資源

AH 要守，**所有 agent 都要守**。dispatch prompt 給「剛剛好的 context」而非「全部 context」。

常用節約手法：
- `Read` 用 `offset + limit` 只讀相關區段
- `Grep` 先定位再讀精確區段
- 限制單檔行數（預設 ≤ 200 行）
- AH 派 MP 前不讀整檔 src（subagent 自讀）

---

## 2. 分流路徑（落地版）

### 2.1 路徑 A — 小變更直做（最常見）

**觸發條件**：diff < 20 行 + 單檔 + 純邏輯/文字 + 無跨模組副作用

**流程**：
```bash
git checkout -b fix/<簡述> main
# AH 自己 Edit
npm run build  # 或 npx vitest run <相關 test>
git add <具體檔> && git commit -m "[模組] 簡述"
git push -u origin fix/<簡述>
gh pr create --title "..." --body "..."
gh pr merge <PR> --merge --delete-branch  # 若 auto-merge label 不適用就直接 merge
git checkout main && git pull && git branch -d fix/<簡述>
```

**不開 issue**（小事不用追蹤），不派 subagent，不走 worktree。

### 2.2 路徑 B — 中等變更

**觸發條件**：多檔 / feature / 模組內 / 20-100 行 diff

**流程**：
1. AH 開 GitHub issue（描述 + acceptance）
2. AH 開分支（worktree 可選 — 改動小不一定要 worktree）
3. AH 派 AD（dispatch prompt 自包含完整任務描述、檔案、地雷預防、行為確認）
4. AD 實作 → build → commit → push → 開 PR
5. AH 自審 PR（讀 diff + 跑 build）
6. AH `gh pr merge` 收尾

**不派 QC**（AH 自審即可，QC 只在高風險路徑）。

### 2.3 路徑 C — 高風險變更

**觸發條件**：core 契約 / migration / 跨模組 / >100 行 diff / 影響資料格式

**流程**：
1. AH 開 issue
2. AH 開 worktree（隔離主庫）
3. AH 派 AD（dispatch prompt 自包含）
4. AD 開 PR
5. AH 派 QC（在 PR comment 留 `QC PASS` / `QC FAIL`）
6. QC PASS → AH 自 merge + 收尾
7. QC FAIL → AH 在 PR review feedback 給 AD（可派 AD 修，或 AH 自修）

### 2.4 UI 設計階段（MP 路徑）

適用：UI feat / refactor / style 變更，需要視覺草案。

1. AH 與指揮家討論方向（至少 2 個方案）
2. 派 MP 產出 `.claude/previews/<topic>.html`（並排展示方案）
3. 指揮家挑定方案
4. 進入路徑 B / C 實作

MP 是純視覺化工人，不提建議。**模糊需求不丟給 MP 自行詮釋**。

### 2.5 設計後視覺評估（AH 自做）

實作完成後想評估視覺品質：AH 起 dev server + Playwright 截圖 → AH 自己讀截圖（opus 4.7 有 vision）+ 對照 `theme.css` → 直接在主對話列出問題清單。

> 原 DV 角色已砍。AH 自評可避免一次 spawn + screenshot 來回的 overhead。

### 2.6 戰略審查（AA 路徑）

重大架構決策、技術選型、跨多 session 影響的方向：AH spawn AA（Opus 4.7 max effort）審查。

### 2.7 Merge 收尾（AH 自做，取代 PM）

QC PASS 後或 AH 自審通過後：

```bash
gh pr merge <PR> --merge --delete-branch
git checkout main && git pull
git worktree remove <path> --force  # 若有 worktree
git branch -d <branch>              # 若本地仍有
npm run build                       # 驗證 main
```

不用 `git add -A` / `git add .` / `git add *`（誤 commit 風險）。leftover 逐檔指定 add。

---

## 3. AH 執行紀律

### 3.1 Context 保護

- **不自己讀大檔**：超過 200 行的 src 用 Read `offset + limit` 區段讀
- **派 MP 前不讀整檔 src**：subagent SKILL 規定它自讀指定檔，AH 用 Glob / Grep 確認檔案存在 + 大致位置即可（elon-review 教訓 2026-04-27）
- **git log / git diff 限制**：只看最近 5 條或 diff stat

### 3.2 Model / Effort 明指

**Model**：`Agent` 工具呼叫必須明確指定 `model` 參數。EX/AT/AD/QC/PM/MP/DV 砍除後現存 `model: 'sonnet'` 用於 AD/QC/MP；`model: 'opus'` 用於 AA。不指定 = Opus，token ×4。

**Effort**：skill frontmatter 為預設值。複雜任務 AH 可 dispatch 時上調 effort。

### 3.3 Dispatch Prompt 品質

好的 dispatch prompt 要包含：

1. **完整任務描述**（取代 AT 的 CLAUDE.md「當前任務」）：檔案路徑、precise modification、before/after 片段或整檔 content，不用 `// ...` 省略
2. **地雷預防**：指出可能陷阱（型別、import 路徑、特殊規則）
3. **負面指令**：明確列出「不要做的事」
4. **行為確認表**：若有多個可能行為，列對照表要求明確表態
5. **依賴分析**：跨檔改動先說明依賴順序
6. **長度上限**：明寫「回報 ≤ N 字」或「精簡」
7. **歧義抑制指令**：加入「遇歧義以合理預設繼續執行，假設列回報末端」
8. **MP / AA 例外**：只給「參考檔絕對路徑 + 章節提示」，subagent 自讀；抄 src 進 prompt 等於 byte 流動 3 次

**不塞 anti-laziness 催促語**（「仔細思考」「step-by-step」「thorough」「不要偷懶」）。4.7 adaptive thinking 自動判斷思考深度，催促語反而過度觸發 → 延遲。要更深思考改拉 effort（§3.2）。

### 3.4 Insight 流動與上報

- AD / QC 在回報（含 PR body / comment）中標 insight / 跨模組發現
- AH 在 merge 後審視上報項，三選一處理：
  - 值得修 → `gh issue create`
  - 長期偏好 / 跨 session 原則 → 寫 auto-memory
  - 瑣碎 → 忽略
- **不推遲**

### 3.5 提問紀律（AH 對指揮家）

4.7 傾向辨識 ambiguity 就問，長 session 累積決策疲勞。AH 以「先合理預設繼續，假設列回報末端」為預設行為：

- **歧義時先做合理預設**，不打斷心流；所做假設列在回報末端，指揮家看後可重導
- **僅「破壞性後果」才主動提問**：push / merge / force 操作、刪檔、改遠端狀態（gh comment / issue close / PR merge 等）、無法 revert 的動作、跨 session 影響
- **禁止詢問純風格偏好**：命名、排版、log 格式、commit 訊息細節、檔案放哪個資料夾——自行決定
- **例外**：指揮家明顯期望「給我選項」「你覺得 A 還是 B」時正常提供選項表

### 3.6 並行工作模式（Plan A / Plan B）

**預設**：路徑 B / C 同 worktree 單 AD 依序處理多檔。

**真並行（跨 worktree 多 AD）**：任務能乾淨拆成彼此無依賴的子任務、且每個子任務還夠大（≥ 50 行改動）時，AH 可直接派多個並行 AD：
- 每個 AD 各自獨立 worktree / branch
- 各自 commit + push + 開 PR
- AH 分別自審或派 QC（高風險才派）
- AH 依合併順序逐一 merge

**Plan A 優先於 Plan B**：

Context 膨脹的主因常是 AD 自身探勘冗餘（重複 Read、探性 Grep）。優化順序：

1. **Plan A — 精煉 dispatch prompt**：給精確行號 + before/after snippet（AD 不需 grep 找位置）
2. **Plan B — 任務拆分**：多 phase 序列（同 AD 接力）優於跨 worktree 並行（管理成本高）

紅線：子任務 < ~50 行別拆。

---

## 附錄：Dispatch Prompt 欄位清單（精簡版）

skill 機制會自動注入角色規範，AH 不需在 prompt 說「先讀 roles/X.md」。但起草 prompt 時須確認以下資訊。

### AD

- Worktree 路徑（若用 worktree）+ 分支名
- Issue 編號（若有）
- **完整任務描述**（不再依賴 AT 寫進 CLAUDE.md，直接寫進 dispatch prompt）：
  - 檔案清單 + 修改點（精確行號 / before/after / 整檔內容）
  - 地雷預防、負面指令、行為確認表
  - 預期讀檔數（啟發式上限）

要求：
1. `pwd` 驗證在正確 worktree（並行多 AD 時尤其重要）
2. `npm install`（worktree 無 `node_modules`）
3. 依 dispatch prompt 實作 → build → commit → push → 開 PR

### QC

- PR 編號
- 審查重點（可選）

要求：build 驗證 → diff 審查 → 契約 / 慣例檢查 → `gh pr review --comment "QC PASS"` 或 `--comment "QC FAIL: ..."`。

### MP

- 主題（短詞，用於檔名）
- 方案數 N + 各方案描述（Before + 方案 A/B/...）
- 參考檔（絕對路徑）
- 配色來源（如 `src/styles/theme.css`）
- 排版偏好 + 尺寸

要求：產出 `.claude/previews/<topic>.html`，不提建議、不改原始碼。

### AA

- 審查目標（spec / plan / 架構決策）
- 已知選項 / 已試方向
- 期望輸出（推薦方向 / 風險清單 / 第一性原理拆解）
