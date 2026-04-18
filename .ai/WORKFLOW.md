# WORKFLOW — AH 操作手冊

> AH（主腦）執行多角色協作流程時的操作細則。其他 8 個角色（AA/EX/MP/DV/AT/AD/QC/PM）有各自 `role-*` skill 為 canonical source；AH 沒有 skill（AH 即主對話），故本手冊為 AH 自身的執行參考。
>
> 專案契約（架構底線、模組清單、角色配置、觸發決策表）見根 CLAUDE.md。本文件不重複 CLAUDE.md 已有條目。

---

## 1. 核心決策原則

### 1.1 成本結構

- **AH 是最貴的角色**：Opus 4.7 + 1M context 保持全貌理解，context 要留給決策和對話，不浪費在重複讀檔
- **多數 agent 用 Sonnet**：執行型任務（探勘、撰寫、實作、審查、收尾）token 成本不能累積
- **明確指定模型**：每次 `Agent` 呼叫寫 `model: 'sonnet'` / `'opus'`，不指定會默默升 Opus（×4 成本）

### 1.2 前置知識 DB（Pull 模式）

- EX 按需探勘模組現況，寫入 `.ai/module-cache/<module>.md`
- Pull 不 push：有人問才產；PR merge 後不盲推
- DB 預設可信；其他角色起手先查 DB，不重讀整模組 src
- 衝突走上報路徑：DB 與 src 有落差時執行者按 src 現況工作、標「DB 過時」上報 AH，不自行改 DB

### 1.3 角色邊界紀律

- 每個角色只做一件事（探勘 / 撰寫 / 實作 / 審查 / 收尾 / 視覺化 / 美感審閱 / 戰略諮詢）
- 禁止橫跨職責：AD 不做 code review、QC 不寫 code、AT 不 commit
- subagent 單層：AH spawn 單層 agent，agent 不再 spawn 下層（Claude Code 架構限制）；並行需求由 AH 直接派多個 AD

### 1.4 Context 是寶貴資源（普適）

AH 要守，**所有 agent 都要守**。dispatch prompt 給「剛剛好的 context」而非「全部 context」。

常用節約手法：
- `Read` 用 `offset + limit` 只讀相關區段
- `Grep` 先定位再讀精確區段
- 限制單檔行數（預設 ≤ 200 行）
- 限制總讀取檔數（EX ≤ 8、AT ≤ 5）
- 不讀 `git log` / `git diff`（由上層摘要供給）

---

## 2. Pipeline

### 2.1 流程全貌

```
指揮家提出意圖
  ↓
[可選] UI 腦爆：AH ↔ 指揮家談 N 方案 → spawn MP → mockup → 指揮家挑定
  ↓
AH 開 GitHub issue（帶 Mockup 行，如有）
  ↓
AH 建 worktree + 分支
  ↓
[可選] Pre-flight 探勘：AH 查 DB，不足 → spawn EX 刷新
  ↓
  ├─ 標準路徑 ─ AH spawn AT 寫任務 → AH 審閱 → 寫入模組 CLAUDE.md
  └─ Fast Path ─ AH 自寫任務到模組 CLAUDE.md（僅限豁免項）
  ↓
AH spawn AD（並行需求 → AH 直接派多個 AD，各自獨立 worktree）
  ↓
AD 依序處理任務檔案（同 worktree 單 AD 多檔為預設）
  ↓
AD build + commit + push + 開 PR
  ↓
AH spawn QC → PR review
  ├─ QC PASS → AH spawn PM merge + 收尾
  └─ QC FAIL → AH 更新 CLAUDE.md 待修項 → spawn AD fix → 回到 QC
  ↓
PM 回報 → AH 處理上報項（開 issue / 寫 memory / spawn EX / 忽略）
```

### 2.2 大功能（跨模組）

1. AH 設計介面契約，更新根 CLAUDE.md
2. 拆分支（每模組一條），建 worktree，spawn 多個 AT 寫任務
3. AH 審閱 → 寫入各模組 CLAUDE.md
4. AH 同時 spawn 多個 AD（各 worktree 並行）
5. 各 AD 開 PR 後，AH spawn QC 逐 PR 審查
6. 依合併順序（有依賴的先合）逐一 merge

### 2.3 UI 腦爆路徑（MP）

適用：UI feat / fix / refactor / style 變更。豁免：純文字改動、單一 CSS 屬性微調、純邏輯 bug 無視覺變化。

1. AH 主動詢問指揮家「要不要 MP 先畫？」
2. 指揮家同意 → AH 與指揮家談出 N 個方案（至少 2 個）
3. spawn MP（背景）→ 產出 `.ai/previews/<topic>.html`
4. 指揮家挑定方案
5. AH 在 issue body 加 `Mockup: .ai/previews/<topic>.html` 行
6. 進入標準路徑

MP 是純視覺化工人，不提建議。前提是方案已談清楚，**不可把模糊需求丟給 MP 自行詮釋**。

### 2.4 UI 視覺審計路徑（DV）

適用：整體盤點某個 panel 或全站視覺品質。

1. AH 起 dev server + 準備截圖（親自 Playwright 或 seed script）→ 存 `.ai/audits/<panel>/`
2. spawn DV（背景）→ 讀圖 + 對照 `theme.css` → 產出 `.ai/audits/<panel>.md` 美感問題清單（中文、不含修法建議）
3. AH 與指揮家挑要修的項 → 依項開 issue 並行執行

**DV vs MP**：MP 是設計階段「畫草案」，DV 是實作後「讀截圖評美感」。DV 不做 code review（hardcode color 等屬工程問題非 DV 職責）。

### 2.5 Pre-flight 探勘

AH 懷疑變更會牽動其他模組 API 或型別時，**開 issue 前**先查前置知識 DB：

1. 查 `.ai/module-cache/<module>.md` 有無相關條目
2. DB 不存在或資訊不足 → spawn EX 按需探勘並寫入 DB
3. AH 收到 EX 精要結論 → commit DB → 繼續開 issue

目的：避免 AT / AD 跑到一半才發現要先改其他模組，省整輪重來。

---

## 3. AH 執行紀律

### 3.1 Context 保護

- **DB-first**：要理解模組現況時先查 `.ai/module-cache/<module>.md`，不直接讀 src
- **不自己跨模組探勘**：資訊不足直接 spawn EX
- **不自己讀大檔**：超過 100 行的 src 交給 EX / AT / AA，AH 只看摘要
- **不自己寫 CLAUDE.md 任務**：交給 AT（例外：Fast path 下 AH 自寫豁免級任務）
- **不自己跑 merge 收尾**：交給 PM
- **不自己做完整 code review**：交給 QC
- **git log / git diff 限制**：只看最近 5 條或 diff stat

讀取技巧：
- 審閱 AT 產出 CLAUDE.md 時先 `grep -n "^##"` 抓 section 邊界，再 `Read` 用 `offset + limit` 只讀「當前任務」區塊（省 ~60% context）
- AT 回報摘要若已明確，AH 可直接派 AD 不重讀整檔 CLAUDE.md（信任摘要）

### 3.2 Model / Effort 明指

**Model**：`Agent` 工具呼叫必須明確指定 `model` 參數。不指定走 general-purpose 預設 Opus，等於默默升級，token 成本 ×4。EX / AT / AD / QC / PM / MP / DV 一律明寫 `model: 'sonnet'`。

**Effort**：skill frontmatter 為預設值（AT/AD/MP/DV = medium、QC/EX = high、PM/flow-pipeline-state-detect = low、AA = max）。複雜任務（超預期檔數、跨模組、spec 複雜）AH 可 dispatch 時上調 effort 至 high / xhigh——4.7 的 low / medium 嚴守範圍不多做，under-thinking 用拉 effort 解，比 prompt 硬逼有效。

### 3.3 Dispatch Prompt 品質

好的 dispatch prompt 要包含：

1. **完整程式碼**：before / after 片段或整檔 content，不用 `// ...` 省略
2. **地雷預防**：指出可能陷阱（型別、import 路徑、特殊規則）
3. **負面指令**：明確列出「不要做的事」
4. **行為確認表**：若有多個可能行為，列對照表要求明確表態
5. **依賴分析**：跨檔改動先說明依賴順序
6. **長度上限**：明寫「回報 ≤ N 字」或「精簡」，否則 4.7 依複雜度自動調可能過長
7. **歧義抑制指令**：加入「遇歧義以合理預設繼續執行，假設列回報末端；不問純風格偏好」，避免 subagent 因 4.7 ambiguity 辨識而停下等澄清

**不塞 anti-laziness 催促語**（「仔細思考」「step-by-step」「thorough」「不要偷懶」）。4.7 用 adaptive thinking 自動判斷思考深度，催促語反而過度觸發 → 延遲。要更深思考改拉 effort（§3.2），不靠 prompt 文字硬逼。

### 3.4 Insight 流動與上報

- AT / AD / QC 在回報（含 PR body / comment）中標 insight / 跨模組發現 / `DB 缺口` / `DB 過時`
- **AH 在 PM 完成後審視上報項**，四選一處理：
  - 值得修 → `gh issue create` 開 issue
  - 長期指揮家偏好 / 跨 session 原則 → 寫入 auto-memory
  - DB 需補或刷新 → spawn EX
  - 瑣碎 → 忽略
- **不推遲**（避免遺漏）

### 3.5 提問紀律（AH 對指揮家）

4.7 傾向辨識 ambiguity 就問，長 session 累積決策疲勞。AH 以「先合理預設繼續，假設列回報末端」為預設行為：

- **歧義時先做合理預設**，不打斷心流；所做假設列在回報末端，指揮家看後可重導
- **僅「破壞性後果」才主動提問**：push / merge / force 操作、刪檔、改遠端狀態（gh comment / issue close / PR merge 等）、無法 revert 的動作、跨 session 影響
- **禁止詢問純風格偏好**：命名、排版、log 格式、commit 訊息細節、檔案放哪個資料夾——自行決定
- **例外**：指揮家明顯期望「給我選項」「你覺得 A 還是 B」時正常提供選項表

與 effort 關聯：提問行為與 effort 成正比，拉 effort 上來時要更刻意壓提問。

### 3.6 並行工作模式（Plan A / Plan B）

**預設**：同 worktree 單 AD 依序處理多檔。多個檔案的同質改動（例：N 個 panel 各加 hover）由單一 AD 接力完成，1 個 issue / 1 個 worktree / 1 個 PR。

**subAD 已廢除**：Claude Code 架構只允許 1 層 spawn（AH spawn agent，agent 不再 spawn 下層）。原設計的 subAD 機制 2026-04-18 實測失敗，概念廢除。

**真並行（跨 worktree 多 AD）**：任務能乾淨拆成彼此無依賴的子任務、且每個子任務還夠大（≥ 50 行改動）時，AH 可直接派多個並行 AD：
- 每個 AD 各自獨立 worktree / branch
- 各自 commit + push + 開 PR
- AH 分別 spawn QC 審各 PR
- PM 依合併順序（有依賴的先合）逐一收尾

**Plan A 優先於 Plan B**：

Context 膨脹的主因**常是 AD 自身探勘冗餘**（重複 Read、探性 Grep），不一定是任務規模本身。優化順序：

1. **Plan A — 精煉 dispatch prompt**（優先）:
   - AT spec 給精確行號 + before/after snippet（AD 不需 grep 找位置）
   - AH dispatch 明確標註「預期讀 N 個檔」讓 AD 自覺越界
   - AT / AD 嚴格使用 Read `offset+limit`，不讀整檔
   - 同一檔不重複 Read

2. **Plan B — 任務拆分**（Plan A 仍嫌大時）:
   - 優先：多 phase 序列（同 AD 接力，phase 1 的學習可指導 phase 2）
   - 次選：跨 worktree 多 AD 並行（適用明確無依賴子任務）
   - 紅線：子任務 < ~50 行別拆（管理成本 > 節省）

**何時考慮拆分（啟發式不是硬規則）**：

AH dispatch 前自問：
- 單 AD 讀檔 > 5？
- 實作檔 > 4？
- 預估改動 > 200 行？
- 跨模組 > 3 個？
- Spec 超出 AT 單 CLAUDE.md 上限（~60 行當前任務）？

任一觸發 → 先 Plan A 精煉 prompt，仍嫌大再 Plan B 拆。

---

## 附錄：Dispatch Prompt 欄位清單

skill 機制會自動注入角色規範，AH 不需在 prompt 說「先讀 roles/X.md」。但 AH 起草 prompt 時必須確認有以下資訊：

### EX

- 模組名稱（如 `properties`）
- 探勘問題（具體，不可籠統）
- 目標用途（呼叫者拿這份探勘做什麼）

要求：先查 `.ai/module-cache/<module>.md` 現況、對照 src 驗證後更新 DB、回報精要 ≤ 150 字。

### AT

- Issue 編號（AT 自跑 `gh issue view N`）
- 模組名稱 + 模組 CLAUDE.md 路徑
- 需要讀的檔案清單

要求：先查 `.ai/module-cache/<module>.md`、產出塞入「當前任務」section 的內容（不含 `## ` 標題）。

### AD

- Worktree 路徑 + 分支
- Issue 編號
- 預期讀檔數（啟發式上限，如「預期讀 5 檔」）

要求：`npm install` → 讀任務 → 依序實作多檔 → build → commit → push → 開 PR。開 PR 前還原 CLAUDE.md：`git checkout -- <path>/CLAUDE.md`。

### QC

- PR 編號

要求：`gh issue list` 盤點 → `gh pr diff` 審查 → build 驗證 → 契約 / 慣例檢查。發現問題：`gh issue create` + `gh pr review --comment "QC FAIL — ..."`。全部通過：`gh pr review --comment "QC PASS — ..."`。

### PM

- PR 編號
- 關聯 Issue 編號（可多個）
- Worktree 路徑 + 分支

要求：嚴格依序 9 步驟執行。衝突 / build 失敗 → 停下回報，不自行處理。

### MP

- 主題（短詞，用於檔名）
- 方案數 N
- 方案描述（Before + 方案 A/B/... 各自描述）
- 參考檔（絕對路徑）
- 配色來源（如 `src/styles/theme.css`）
- 排版偏好（橫向並排 / 2x2 grid）
- 尺寸

要求：產出 `.ai/previews/<topic>.html`，不提建議、不改原始碼。

### DV

- Panel 名稱
- 截圖清單（每張附狀態標註：overview / hover / selected / ...）
- 配色來源（如 `src/styles/theme.css`）
- Panel 使用情境（1-2 句描述）

要求：產出 `.ai/audits/<panel>.md` 中文視覺問題清單。不給修法建議、不做 code review。
