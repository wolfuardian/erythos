# 多角色協作流程 SOP

> 這份文件描述了一套用於軟體專案的**多角色 AI Agent 協作流程**。核心目標：把昂貴推理（決策 / 設計 / 全貌理解）留給少數 Opus-tier agent，把便宜執行（程式碼生成 / 驗證 / 收尾）交給多數 Sonnet-tier agent，並用「前置知識 DB」減少重複探勘成本。
>
> **文件結構**：§1–§6 為流程總覽（通用方法論 + 專案特定層），Reference 區為 9 個 agent 角色的濃縮規範，供流程對照與 dispatch prompt 引用。
>
> **原角色規範完整檔**存在於 `.ai/roles/<name>.md`，dispatch prompt 應引用那邊（此文件為對照用 digest）。

---

## 1. 核心理念

### 1.1 成本結構

- **主腦（AH）是最貴的角色**：Opus 4.7 + 1M context 保持全貌理解，context 要留給決策和對話，不浪費在重複讀檔。
- **多數 agent 用 Sonnet**：執行型任務（探勘、撰寫、實作、審查、收尾）token 成本不能累積到天花板。
- **明確指定模型**：每次 `Agent` 呼叫都寫 `model: 'sonnet'` 或 `'opus'`，不指定會默默升 Opus（×4 成本）。

### 1.2 前置知識 DB（Pull 模式）

- **EX**（Explorer）按需探勘模組現況，寫入 `.ai/module-cache/<module>.md`。
- **Pull 不 push**：有人問才產；不在 PR merge 後盲推。
- **DB 預設可信**：其他角色起手先查 DB，不重讀整模組 src。
- **衝突走上報路徑**：DB 與 src 有落差時，執行者按 src 現況工作，標「DB 過時」上報 AH 決定是否 spawn EX 刷新。不自行改 DB。

### 1.3 角色邊界紀律

- 每個角色只做一件事：探勘 / 撰寫 / 實作 / 審查 / 收尾 / 視覺化 / 美感審閱 / 戰略諮詢。
- 禁止橫跨職責：AD 不做 code review；QC 不寫 code；AT 不 commit。
- subagent 單層：AH spawn 單層 agent，agent 不再 spawn 下層（Claude Code 架構限制）。並行需求由 AH 直接派多個 AD。
- 所有 AH spawn 的 subagent 用 `run_in_background: true`，AH 不阻塞等待。

### 1.4 Context 是寶貴資源（普適）

主腦要守是常識；**所有 agent 都要守**。dispatch prompt 給「剛剛好的 context」而非「全部 context」。

常用節約手法：
- `Read` 用 `offset + limit` 只讀相關區段
- `Grep` 先定位再讀精確區段
- 限制單檔行數（預設 ≤ 200 行）
- 限制總讀取檔數（EX ≤ 8、AT ≤ 5）
- 不讀 `git log` / `git diff`（由上層摘要供給）

---

## 2. 角色一覽

| 角色 | 代號 | 模型 | 職責 | Spawner | Reference |
|------|------|------|------|---------|-----------|
| 指揮家（使用者） | — | — | 提出意圖、做最終決策 | — | — |
| 主腦 | AH | Opus | 拆 issue、建 worktree、dispatch、merge | — | §4（本文件） |
| 顧問 | AA | Opus | 戰略審查（昂貴探索外包） | AH | R.1 |
| Explorer | EX | Sonnet | 按需探勘前置知識，寫 DB | AH / AT | R.2 |
| Mock-Preview | MP | Sonnet\* | UI 腦爆階段純視覺化工人 | AH | R.3 |
| Design-Visual | DV | Sonnet | 視覺美感審閱（截圖 → 問題清單） | AH | R.4 |
| Tasker | AT | Sonnet | 將 issue 轉為模組 CLAUDE.md 當前任務 | AH | R.5 |
| Developer | AD | Sonnet | 模組總執行長：實作 + commit + PR（同 worktree 單 AD 多檔） | AH | R.6 |
| QC | QC | Sonnet | 審 PR diff，留 `QC PASS` / `QC FAIL` | AH | R.7 |
| PR Merge | PM | Sonnet | QC PASS 後完整 merge 收尾 | AH | R.8 |

\*MP 在複雜任務 AH 可於 dispatch 升 Opus。

---

## 3. Pipeline

### 3.1 流程全貌

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

### 3.2 標準路徑（Bug / 小功能，單一模組）

1. AH 調查後開 GitHub issue（帶 label）
2. AH 建 worktree + spawn AT（背景）寫任務描述
3. AH 審閱 AT 產出 → 寫入模組 CLAUDE.md「當前任務」
4. AH spawn AD（背景）→ 實作 → commit + push → 開 PR
5. AH spawn QC（背景）→ 審查 PR → 留 `QC PASS` / `QC FAIL`
6. QC PASS → AH spawn PM 收尾；QC FAIL → 更新「待修項」→ 回到步驟 4

### 3.3 Fast Path（豁免級直通車道）

**豁免項**：純文字改動（copy edit / typo / 翻譯）、單一 CSS 屬性微調、純邏輯 bug 無視覺變化。

1. AH 開 issue + 建 worktree
2. **AH 自寫任務**到 worktree 模組 CLAUDE.md「當前任務」（格式同 AT：含 before/after、負面指令、commit、PR 指令）
3. AH spawn AD → PR → QC → merge（後續同標準路徑）

省 AT 整輪（約 3 分鐘 + 一次審閱）。不符豁免的變更**不得強用 Fast Path**。

### 3.4 大功能（跨模組）

1. AH 設計介面契約，更新根 CLAUDE.md
2. 拆分支（每模組一條），建 worktree，spawn 多個 AT 寫任務
3. AH 審閱 → 寫入各模組 CLAUDE.md
4. AH 同時 spawn 多個 AD（各 worktree 並行）
5. 各 AD 開 PR 後，AH spawn QC 逐 PR 審查
6. 依合併順序（有依賴的先合）逐一 merge

### 3.5 UI 腦爆路徑（MP）

適用：UI feat / fix / refactor / style 變更。豁免：純文字改動、單一 CSS 屬性微調、純邏輯 bug 無視覺變化。

1. AH 主動詢問指揮家「要不要 MP 先畫？」
2. 指揮家同意 → AH 與指揮家談出 N 個方案（至少 2 個）
3. spawn MP（背景）→ 產出 `.ai/previews/<topic>.html`
4. 指揮家挑定方案
5. AH 在 issue body 加 `Mockup: .ai/previews/<topic>.html` 行
6. 進入標準路徑

MP 是純視覺化工人，不提建議。前提是方案已談清楚，**不可把模糊需求丟給 MP 自行詮釋**。

### 3.6 UI 視覺審計路徑（DV）

適用：整體盤點某個 panel 或全站視覺品質。

1. AH 起 dev server + 準備截圖（親自 Playwright 或 seed script）→ 存 `.ai/audits/<panel>/`
2. spawn DV（背景）→ 讀圖 + 對照 `theme.css` → 產出 `.ai/audits/<panel>.md` 美感問題清單（中文、不含修法建議）
3. AH 與指揮家挑要修的項 → 依項開 issue 並行執行

**DV vs MP**：MP 是設計階段「畫草案」，DV 是實作後「讀截圖評美感」。DV **不做 code review**（hardcode color 等屬工程問題非 DV 職責）。

### 3.7 依賴標注

Issue body 可加：
- `Depends-on: #N` — 本 issue 需在 #N 合併後才能開發 / 合併
- `Blocks: #N` — 本 issue 合併前擋住 #N 的進度

Session startup 時 AH 掃開放 issue body 建依賴圖，優先啟動無依賴者。

### 3.8 Pre-flight 探勘（可選，跨模組變更建議）

AH 懷疑變更會牽動其他模組 API 或型別時，**開 issue 前**先查前置知識 DB：

1. 查 `.ai/module-cache/<module>.md` 有無相關條目
2. DB 不存在或資訊不足 → spawn EX 按需探勘並寫入 DB
3. AH 收到 EX 精要結論 → commit DB → 繼續開 issue

目的：避免 AT / AD 跑到一半才發現要先改其他模組，省整輪重來。

---

## 4. Session Startup SOP（AH）

每次 session 開始（含 `/clear` 後）必須執行：

### 4.1 讀上個 session 交接筆記
```bash
ls .ai/session/
```
逐一讀取了解上次狀態，**讀完後刪除**保證新鮮。

### 4.2 重建 Pipeline 狀態
```bash
git worktree list          # 哪些 issue 在開發中
gh pr list                 # 哪些 PR 待 QC / 待 merge
gh issue list              # 開放 issue
git log origin/master..master --oneline   # 有無未 push 的 commit
```

**若 `git log origin/master..master` 非空**：先 push master 再建新 worktree，避免 unpushed commits 混入 PR diff 造成假 QC FAIL。

對每個 active worktree，讀其模組 CLAUDE.md「當前任務」+「待修項」。

狀態判斷：

| 狀態 | 條件 | 下一步 |
|------|------|--------|
| 開發中 | worktree 存在、無 PR | spawn AD |
| 等 QC | PR open、無 QC comment | spawn QC |
| 等 merge | PR 有 `QC PASS` | spawn PM merge + cleanup |
| 等修復 | PR 有 `QC FAIL`、CLAUDE.md 有待修項 | spawn AD fix |
| 等依賴 | issue 有 `Depends-on:` 指向未合 issue | 先處理依賴 |
| 閒置 | 無 worktree、無 open PR | 等指揮家指示 |

### 4.3 Session 結束前

在 `.ai/session/current.md` 寫交接筆記供下個 session 讀：
- 本次完成了什麼（issue / PR 清單）
- 遇到的問題和解決方式
- 未完成的待辦
- 觀察到的指揮家偏好

---

## 5. 關鍵紀律

### 5.1 AH Context 保護

- **DB-first**：要理解模組現況時先查 `.ai/module-cache/<module>.md`，不直接讀 src
- **不自己跨模組探勘**：資訊不足直接 spawn EX
- **不自己讀大檔**：超過 100 行的 src 交給 EX / AT / AA，AH 只看摘要
- **不自己寫 CLAUDE.md 任務**：交給 AT（例外：Fast path 下 AH 自寫豁免級任務）
- **不自己跑 merge 收尾**：交給 PM
- **不自己做完整 code review**：交給 QC
- **git log / git diff 限制**：只看最近 5 條或 diff stat

讀取技巧：
- 審閱 AT 產出 CLAUDE.md 時，先 `grep -n "^##"` 抓 section 邊界，再 `Read` 用 `offset + limit` 只讀「當前任務」區塊（省 ~60% context）
- AT 回報摘要若已明確，AH 可直接派 AD 不重讀整檔 CLAUDE.md（信任摘要，省整檔 Read）

### 5.2 DB 讀取紀律（所有角色）

```
角色收到任務
  → 查 .ai/module-cache/<module>.md
    ├─ 存在 → 讀 DB 取速覽；細節用 Read + offset/limit
    └─ 不存在或嚴重不足 → 上報 AH 考慮 spawn EX
                            該次任務仍按 src 現況執行
  → DB 與 src 明顯衝突 → 上報 AH 考慮 spawn EX 刷新
                          不自行改 DB
```

信任基礎：EX 對照 src 驗證 + 抽樣 2-3 關鍵 fact 交叉確認。DB 是 EX 的產物，預設可信。

### 5.3 Model 明指

`Agent` 工具呼叫**必須明確指定 `model` 參數**。不指定走 general-purpose 預設 Opus，等於默默升級，token 成本 ×4。EX / AT / AD / QC / PM / MP / DV 一律明寫 `model: 'sonnet'`。

### 5.4 Dispatch Prompt 品質

好的 dispatch prompt 要包含：

1. **完整程式碼**：before / after 片段或整檔 content，不用 `// ...` 省略
2. **地雷預防**：指出可能陷阱（型別、import 路徑、特殊規則）
3. **負面指令**：明確列出「不要做的事」
4. **行為確認表**：若有多個可能行為，列對照表要求明確表態
5. **依賴分析**：跨檔改動先說明依賴順序
6. **明指角色規範**：prompt 開頭寫「先讀 `.ai/roles/<name>.md`」

### 5.5 Insight 流動與上報

- AT / AD / QC 在回報（含 PR body / comment）中標 insight / 跨模組發現 / `DB 缺口` / `DB 過時`
- **AH 在 PM 完成後審視上報項**，四選一處理：
  - 值得修 → `gh issue create` 開 issue
  - 長期指揮家偏好 / 跨 session 原則 → 寫入 auto-memory
  - DB 需補或刷新 → spawn EX
  - 瑣碎 → 忽略
- **不推遲**（避免遺漏）

### 5.6 分支規則

- 所有程式碼變更一律走完整流程：issue → 分支 + worktree → 開發 → PR → QC → merge
- 不論改動大小，不得直接在 master 上修改程式碼
- 唯一例外：merge 後的收尾 commit（清理 CLAUDE.md、build 驗證等非程式碼改動）
- 一個 issue 對應一條分支、一個 PR，不混搭多個 issue

### 5.7 模組 CLAUDE.md 編寫原則

- 只放**範圍限制、任務描述、慣例**
- 「當前任務」區塊須**完整自包含**（含精確修法、程式碼片段、commit 格式、PR 開法），AD 讀完即可開工，不需查其他文件
- 主腦準備 worktree 時在「當前任務」寫入任務描述；QC 退回時在「待修項」寫入修正項；兩者不混用
- AT 寫的內容**不得用 `## ` 開頭的 subheader**（會被誤認為新 section，AD 還原 placeholder 時容易遺漏 → 殘骸進 PR diff）

### 5.8 禁止事項（共用）

- **不在 commit / 文件 / DB 中提及敏感品牌名或公司名**
- **不自行 `git push --force`**（PM 尤其禁止，未授權執行）
- **不跳過 GitHub CLI 流程**（開 issue / PR / review 必須走 `gh`，保持可追蹤）

### 5.9 並行工作模式

**預設**：同 worktree 單 AD 依序處理多檔。多個檔案的同質改動（例：N 個 panel 各加 hover）由單一 AD 接力完成，1 個 issue / 1 個 worktree / 1 個 PR。

**subAD 已廢除**：Claude Code 架構只允許 1 層 spawn（AH spawn agent，agent 不再 spawn 下層）。原設計的 subAD 機制（AD 分派下層工人）2026-04-18 實測失敗，概念廢除。

**真並行（跨 worktree 多 AD）**：任務能乾淨拆成彼此無依賴的子任務、且每個子任務還夠大（≥ 50 行改動）時，AH 可直接派多個並行 AD：
- 每個 AD 各自獨立 worktree / branch
- 各自 commit + push + 開 PR
- AH 分別 spawn QC 審各 PR
- PM 依合併順序（有依賴的先合）逐一收尾

**Plan A 優先於 Plan B**：

Context 膨脹的主因**常是 AD 自身探勘冗餘**（重複 Read、探性 Grep），不一定是任務規模本身。優化順序：

1. **Plan A — 精煉 dispatch prompt**（優先）：
   - AT spec 給精確行號 + before/after snippet（AD 不需 grep 找位置）
   - AH dispatch 明確標註「預期讀 N 個檔」讓 AD 自覺越界
   - AT / AD 嚴格使用 Read `offset+limit`，不讀整檔
   - 同一檔不重複 Read

2. **Plan B — 任務拆分**（Plan A 仍嫌大時）：
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

## 6. 專案特定適配層

這份流程是通用方法論。搬到新專案時需調整以下層次（以下為 Erythos 3D Editor 範例）：

### 6.1 模組清單

每個模組有獨立 CLAUDE.md 放「範圍限制、任務描述、慣例」，agent 名稱 = 模組名稱。

Erythos 範例：

| 模組 | 路徑 | commit 前綴 |
|------|------|------------|
| core | `src/core/`, `src/utils/` | `[core]` |
| viewport | `src/viewport/`, `src/panels/viewport/` | `[viewport]` |
| components | `src/components/` | `[components]` |
| app | `src/app/` | `[app]` |
| scene-tree | `src/panels/scene-tree/` | `[scene-tree]` |
| properties | `src/panels/properties/` | `[properties]` |
| leaf-panel | `src/panels/leaf/` | `[leaf-panel]` |
| environment-panel | `src/panels/environment/` | `[environment]` |
| scripts | `scripts/` | `[scripts]` |

### 6.2 分支命名

- `fix/<簡述>` 或 `feat/<簡述>`
- Worktree 語意化：`<專案>-<issue>-<slug>`（Erythos: `erythos-373-properties-tint`），避免純數字

### 6.3 工具鏈

- Node.js + npm
- `gh` (GitHub CLI) — 所有 issue / PR / review 操作
- Playwright MCP（可選）— DV 前置截圖、UI 驗證

### 6.4 技術棧（Erythos 範例）

- TypeScript（strict mode）
- SolidJS（UI 框架）
- Three.js（3D 引擎）
- Dockview（面板佈局）
- Vite（建置）

### 6.5 適配方法（搬去新專案）

複製此文件到新專案後：
1. 替換 §6.1 模組清單（依新專案拆）
2. 替換 §6.2 分支命名 / worktree 前綴
3. 若非 GitHub → 替換 §6.3 工具鏈與流程中的 `gh` 指令
4. 替換 §6.4 技術棧
5. `.ai/module-cache/` 初始為空，第一次 EX dispatch 時從零建立
6. 在 `.ai/roles/` 放 9 份角色規範（可從此文件 Reference 區展開為完整檔）

---

# Reference：角色規範（濃縮版）

> 以下為各 agent 的濃縮規範，用於流程對照與快速理解。每個角色的**完整規範**在 `.ai/roles/<name>.md`，dispatch prompt 應在 prompt 開頭引用該檔。
>
> 濃縮版包含：TL;DR / 流程位置 / 輸入 / 輸出 / 關鍵邊界 / Context 預算 / 模型。

---

## R.1 Advisor（AA）— 戰略顧問

**TL;DR**：服務指揮家的顧問，幫他看清狀況、組織語言、排除障礙。不做決策、不改文件、不下指令。

**流程位置**：指揮家有意圖 → AA 幫其轉化為有效指令 → 指揮家下指令 → 主腦 / 成員執行。

**輸入**：指揮家的疑問、意圖、困擾。

**輸出**：
- 最適合當下情境的 prompt 建議
- 模擬成員收到 prompt 後的解讀與行為
- 問題診斷（意圖 / prompt / CLAUDE.md / 成員行為 哪一層）

**可以做**：讀所有文件（CLAUDE.md、SOP、issue、src/）

**不可以做**：
- 修改 src / CLAUDE.md / `.ai/roles/`
- 執行 git 操作
- 直接對 AD / QC / AT 下指令

**Context 預算**：單檔 ≤ 200 行；不讀 git log；優先 CLAUDE.md + issue，src/ 僅在診斷時讀。

**模型**：Opus（戰略諮詢定位）

---

## R.2 Explorer（EX）— 前置知識探勘

**TL;DR**：按需探勘模組現況，寫入前置知識 DB（`.ai/module-cache/<module>.md`）。Pull 模式：有人問才產。

**流程位置**：
```
AH / AT 發現資訊不足
  → spawn EX（指定模組 + 問題）
  → EX 探勘 → 寫 / 更新 DB
  → EX 回報精要（≤ 150 字）
  → AH / AT 繼續原任務
```

**輸入**：
1. 模組名稱（如 `properties`）
2. 探勘問題（具體，不可籠統）
3. 目標用途（可選）

**輸出**：
- DB 檔絕對路徑
- 針對探勘問題的**直接答案**（不是 DB 全文）
- 更新摘要（新增 / 修改 / 刪除）
- 自我驗證（抽樣 2-3 個 fact 交叉確認）

**DB 結構（標準）**：檔案速覽、關鍵 Types、常用 Pattern、跨檔依賴、已知地雷、最近 PR。DB ≤ 80 行。

**可以做**：讀 src/<module>/、讀 `.ai/module-cache/`、寫 DB、查近期 PR。

**不可以做**：
- 修改 src、模組 CLAUDE.md、根 CLAUDE.md、`.ai/roles/`
- commit、push、開 issue、開 PR
- spawn 任何 subagent
- 把 DB 寫成完整 API 文件
- 憑記憶寫 fact 而不驗證
- 擴大探勘範圍超出指定問題

**Context 預算**：總讀取 ≤ 8 檔；單檔 ≤ 200 行（超過用 offset+limit）；不讀 git log / 整目錄樹。單次 ≤ 50k token。

**模型**：Sonnet

---

## R.3 Mock-Preview（MP）— UI 視覺預覽

**TL;DR**：腦爆階段純視覺化工人。接收 N 個明確方案文字 → 產 HTML 並排 mockup 供挑選。不做決策、不提建議、不改原始碼。

**流程位置**：腦爆階段，**issue 開出之前**。

**輸入**（AH 提供）：
1. 主題 / topic（短詞，用於檔名）
2. N 個方案的明確文字描述 + Before 狀態對照
3. 主要參考檔案（絕對路徑）
4. 配色來源（如 `src/styles/theme.css`）
5. 排版偏好（橫向並排 / 2x2 grid）
6. 每個 panel 尺寸（預設 480×360）

**輸出**：
- 檔案：`.ai/previews/<topic>.html`（單檔靜態 HTML、內嵌 CSS、無 JS）
- 內容：Before + N 方案並排，上標方案名、下附簡短說明
- 回報 ≤ 100 字：檔案路徑 + 參考源 + 有無理解不清

**品質要求**：
- **貼近實際**：配色對應真實 CSS 變數、尺寸比例接近真實 panel、背景深色配合專案風格
- **差異清晰**：方案之間差異一眼看得出來
- **不猜不加**：AH 只給 2 個就畫 2 個，有歧義回報

**可以做**：讀 AH 指定的 UI / 樣式檔、寫 HTML 到 `.ai/previews/`。

**不可以做**：修改 src、commit / PR、提建議、spawn subagent、執行 build。

**Context 預算**：只讀 AH 指定檔；單檔 ≤ 200 行；總讀取 ≤ 5 檔。

**模型**：Sonnet（預設）；複雜任務 AH 可升 Opus。

---

## R.4 Design-Visual（DV）— 視覺美感審閱

**TL;DR**：視覺美感審閱工人。讀截圖 + 對照 `theme.css` → 產中文視覺問題清單。**不碰 Playwright、不讀 src 邏輯、不給修法建議、不做 code review**。

**核心問題**：這張圖看起來有沒有美感？哪裡粗糙？

**你不是 code reviewer**：看到「寫死 color」這種工程問題屬於 DE 職責，不是你。

**流程位置**：UI 視覺審計階段，**DE / issue 開出之前**。

**輸入**（AH 提供）：
1. Panel 名稱
2. 截圖清單（絕對路徑 + 每張代表狀態：overview / hover / selected / dragging / empty）
3. 配色來源（`theme.css`，**僅此檔**）
4. Panel 使用情境（1-2 句）

**輸出**：
- 報告：`.ai/audits/<panel>.md`
- 結構：整體印象 + 6 維度問題清單（字級 / 空間 / 色彩 / 狀態 / 細節 / 整體感）
- 若視覺已 OK：誠實回報並列 3-5 條「做得對」的觀察
- 回報 ≤ 100 字

**審計維度**：
1. 字級 / 排版（階層、baseline、ellipsis、等寬數字）
2. 空間節奏（row 間距、邊距、分組分隔）
3. 色彩 / 調性（色溫、hover/selected 層級、對比度）
4. 狀態層級（可點擊 vs 不可、hover 強度、selected 權重、disabled / empty / loading）
5. 細節品質（icon 粗細 / 對齊、radius、分隔線重量）
6. 整體感（production vs prototype、風格一致性）

**可以做**：讀 AH 指定截圖、讀 `theme.css` 變數定義區、寫 `.ai/audits/`。

**不可以做**：讀 src 邏輯（`*.tsx`）、操作 Playwright、修 src、提修法建議、降級成 code review、為湊問題數列瑣碎現象。

**Context 預算**：只讀指定截圖 + `theme.css` 變數區。

**模型**：Sonnet（支援圖像分析）

---

## R.5 Tasker（AT）— 任務描述撰寫

**TL;DR**：將 GitHub issue 轉為模組 CLAUDE.md「當前任務」區塊。產出會直接被 AD 當施工說明書執行。

**流程位置**：AH 開完 issue → AT 讀 code + 寫任務 → AH 審閱 → 寫入 CLAUDE.md → dispatch AD。

**起手流程（DB-first）**：
1. 先查 `.ai/module-cache/<module>.md`
2. 存在 → 讀 DB + 依需要精準補讀 src
3. 不存在 / 嚴重不足 → 標「**DB 缺口**」上報 AH
4. DB 與 src 衝突 → 標「**DB 過時**」上報 AH，照 src 現況寫

**輸出格式**（塞入模組 CLAUDE.md「當前任務」section，不含 `## ` 標題）：

```markdown
### Issue #N：標題

修改說明

### 檔案 1：`path/to/file.ts`（整檔覆寫 / 局部修改）

[精確程式碼片段或修改指示]

### 不要做的事
- [負面指令]

### build 驗證
npm run build

### Commit
[模組前綴] 描述 (refs #N)

### 開 PR
gh pr create ...

**開 PR 前還原 CLAUDE.md**：
git checkout HEAD -- path/to/CLAUDE.md
```

**品質要求**：
- **模組邊界**：任務不得要求 AD 改模組範圍外的檔案；需跨模組則在最前面加「⚠️ 跨模組前置作業」讓 AH 先處理
- **完整自包含**：AD 讀完即可開工，不需查其他文件
- **不得用 `## ` 開頭 subheader**（會被誤認新 section → 殘骸進 PR diff）。允許 `### `、`#### `、粗體、列表
- **精確程式碼**：整檔覆寫用完整 content；局部用 before/after + 足夠上下文；不用 `// ... existing code ...`
- **負面指令**：明確列出 AD 不應做的事
- **地雷預防**：讀 code 發現陷阱 → 加「TypeScript 注意」區塊

**Lite 模式**：dispatch prompt 含 `mode: lite` → 產出 < 30 行。省完整 code block（行號 + 一句描述），保留負面指令、commit、PR 指令、CLAUDE.md 還原。

**可以做**：讀 src / CLAUDE.md / `.ai/` / issue；Grep 定位。

**不可以做**：修改任何檔案、commit / PR、執行 build、開 issue、spawn subagent（單層執行）。

**Context 預算**：單檔 ≤ 200 行、總讀取 ≤ 5 檔、不讀 git log；資訊不足標「建議 spawn EX」。

**Insight 回報**：跨模組 insight / 潛在風險 / 改進建議 → 寫在回報摘要「insight」段，不寫獨立備忘錄檔。

**模型**：Sonnet

---

## R.6 Developer（AD）— 開發執行長

**TL;DR**：模組總執行長。收 AT 寫好的任務 → 實作、build、commit、push、開 PR。**同 worktree 單 AD 依序處理多檔為預設模式**（無 subAD 層；並行需求由 AH 直接派多個獨立 AD）。

**開工流程**：
1. `npm install`（worktree 無 `node_modules`）
2. 讀模組 CLAUDE.md「當前任務」
3. **DB-first**：超出 AT 已寫明的部分 → 查 `.ai/module-cache/<module>.md`，不存在 / 衝突時在 PR body 標「**DB 缺口**」 / 「**DB 過時**」上報 AH

**遇阻升級**：卡住時可**自行呼叫內建 `advisor()`**（不消耗 AH context）。

**收工**：
1. 還原模組 CLAUDE.md：`git checkout -- <path>/CLAUDE.md`（避免 merge 衝突）
2. push + 開 PR：`gh pr create --title "[模組] 簡述 (refs #N)" --body "改動摘要"`

**commit 格式**：`[模組] 簡述 (refs #N)`（用 `refs` 不用 `closes`，issue 由 AH 關）

**禁止**：
- 改自己模組以外的檔案
- 操作 master、merge、關 issue
- spawn 任何 subagent（Claude Code 1 層 spawn 限制；EX / AT / QC 由 AH 負責）
- 自行改 `.ai/module-cache/*.md`（DB 由 EX 維護）

**模型**：Sonnet

---

## R.7 QC — 品質審查

**TL;DR**：只審查、不寫 code、不改計劃。審 PR diff 後留 `QC PASS` / `QC FAIL`。

**流程位置**：AD 開 PR → **QC 審查、有問題開 issue、沒問題留 PASS** → AH 處理結果。

**審查流程**：

### 0. Issue 盤點（每次第一步）
```bash
gh issue list --state open
```
對每個 open issue 用 `git log --all --grep="refs #N"` 追蹤是否有對應 commit。

### 1. Diff 審查
```bash
gh pr diff <PR-number>
```
diff > 300 行先看統計，不一次讀完巨型 diff。需模組 context 先查 `.ai/module-cache/`，不直接讀模組全檔。

逐檔檢查：
- 是否只改被允許的檔案（對照根 CLAUDE.md 模組範圍）
- 有無越權修改其他模組

### 2. 契約一致性
- 函式簽名對介面契約
- 事件順序（如 Erythos: objectAdded → sceneGraphChanged）
- Command undo 完整還原

### 3. 慣例遵循
- 專案慣例（Erythos: 用 `editor.execute(cmd)`、SolidJS `onMount` / `onCleanup`、import 路徑）

### 4. Build 驗證
```bash
cd <worktree-path> && npm run build
```
每個 worktree 已在正確分支，不需 `git checkout`。

### 5. 跨分支相容
預判合併後是否有問題（import 路徑、型別匹配）。

**輸出**（所有 agent 共用 GitHub 帳號，無法 `--approve`）：

**發現問題**：
```bash
gh issue create --label bug --title "[分支簡稱] 問題簡述" --body "..."
gh pr review <PR> --comment --body "QC FAIL — ..."
```

**全部通過**：
```bash
gh pr review <PR> --comment --body "QC PASS — 審查結論"
```

**複審問題已修**：
```bash
gh pr review <PR> --comment --body "QC PASS — ..."
gh issue close #N
```

**可以做**：`gh issue create/close`、`gh pr review`、寫 `qc/` 目錄。

**不可以做**：修 src、修根 / 模組 CLAUDE.md、commit 到 feat/* 分支、操作 master。

**Insight 回報**：寫在 PR review comment 或 QC 結論摘要；嚴重到值得獨立修的另開 issue。不寫獨立備忘錄檔。

**模型**：Sonnet

---

## R.8 PR Merge（PM）— 合併收尾

**TL;DR**：QC PASS 後的機械收尾。嚴格照表執行，不做設計決策。

**輸入**（AH 提供）：
- PR 編號、Issue 編號（可多個）、Worktree 路徑、分支名

**收尾流程（嚴格依序）**：

### 1. Merge PR
```bash
gh pr merge <PR> --merge
```
**衝突處理**：失敗（CONFLICTING / DIRTY）→ **停下回報 AH**。**禁止**自行 `git rebase` + `git push --force`（PM 未授權執行）。

### 2. 關閉 Issue
```bash
gh issue close <N>
```
含 QC 在審查時開的 bug issue（AH 會告知）。

### 3. 移除 Worktree
```bash
git worktree remove <worktree-path> --force
```

### 4. Pull master
```bash
git checkout -- tsconfig.app.tsbuildinfo 2>/dev/null
git pull
```

### 5. 刪除分支
```bash
git branch -d <branch-name>
git push origin --delete <branch-name>
```

### 6. 清理模組 CLAUDE.md
清空以下區塊（保留標題 + placeholder）：當前任務 / 待修項 / 上報區。

### 7. Mockup 保留（**不清理**）
`.ai/previews/` 下 HTML 是 design history / 視覺規格 source of truth，可能跨 issue、跨階段。**PM 嚴禁刪除**任何 `.ai/previews/` 檔案，無論 issue body 是否含 `Mockup:` 行。

### 8. Build 驗證
```bash
npm run build
```
失敗不嘗試修復，在輸出報告。

### 9. Commit + Push（含 in-progress docs 防呆）

**先看 `git status -s`**，不盲用 `git add -A`。

| 檔案模式 | 處理 |
|---------|------|
| `src/<module>/CLAUDE.md`（step 6 清理） | 可 commit |
| `package.json` / `package-lock.json` | 可 commit |
| `tsconfig.app.tsbuildinfo` | 可 commit |
| `.ai/previews/*.html` 新增或修改 | ❌ 跳過 + 回報 AH |
| 根 `CLAUDE.md` | ❌ 跳過（AH 可能正在改） |
| `.ai/roles/*.md` | ❌ 跳過 |
| `.ai/module-cache/*.md` | ❌ 跳過（DB 由 EX 維護） |
| `.ai/specs/*` | ❌ 跳過（AH 在寫 spec） |
| 其他 unstaged src/ | ❌ 跳過 + 回報異常 |

若有可 commit 項：`git add <具體檔案>` 逐個指定 → `git commit -m "chore: merge 收尾 #<PR>"` → `git push`。

若全落入「跳過」類：不 commit，回報「step 9 跳過」並列原因。

**輸出**：merge 成功與否、build 通過與否、異常項（跳過的 unstaged 檔）。

**可以做**：git 操作（merge / delete branch / commit / push）、gh 操作（merge PR / close issue）、清空模組 CLAUDE.md 任務區塊。

**不可以做**：
- spawn 任何 subagent
- 修 `.ai/module-cache/*.md`（DB 由 EX 維護）
- 修 src / 根 CLAUDE.md / `.ai/roles/*.md`
- 開 issue / PR
- 自行 `git push --force`

**模型**：Sonnet

---

## 附錄：Dispatch Prompt 模板

以下為各角色的典型 dispatch prompt 骨架。AH 實際 dispatch 時依任務填充。

### EX

```
先讀 .ai/roles/explorer.md 理解你的角色規範。

模組：<module-name>
探勘問題：<具體問題，避免籠統>
目標用途：<呼叫者拿這份探勘做什麼>

請先查 .ai/module-cache/<module>.md 現況，對照 src 驗證後更新 DB。
回報精要 ≤ 150 字。
```

### AT

```
先讀 .ai/roles/tasker.md 理解你的角色規範。

Issue：#N（gh issue view N 取得完整描述）
模組：<module-name>
模組 CLAUDE.md 路徑：<path>
需要讀的檔案：<list>

先查 .ai/module-cache/<module>.md。
產出塞入「當前任務」section 的內容（不含 ## 標題）。
```

### AD

```
先讀 .ai/roles/developer.md + <worktree>/src/<module>/CLAUDE.md「當前任務」。

Worktree：<path>
分支：<branch>
Issue：#N

npm install → 讀任務 → 依序實作多檔 → build → commit → push → 開 PR。
開 PR 前還原 CLAUDE.md：git checkout -- <path>/CLAUDE.md
```

### QC

```
先讀 .ai/roles/pr-qc.md 理解你的角色規範。

PR：#N

gh issue list 盤點 → gh pr diff 審查 → build 驗證 → 契約 / 慣例檢查。
發現問題：gh issue create + gh pr review --comment "QC FAIL — ..."
全部通過：gh pr review --comment "QC PASS — ..."
```

### PM

```
先讀 .ai/roles/pr-merge.md 理解你的角色規範。

PR：#N
Issue：#N（可多個）
Worktree：<path>
分支：<branch>

嚴格依序 9 步驟執行。衝突 / build 失敗 → 停下回報，不自行處理。
```

### MP

```
先讀 .ai/roles/mock-preview.md 理解你的角色規範。

主題：<topic>
方案數：N
方案描述：
  - Before：<現狀>
  - 方案 A：<描述>
  - 方案 B：<描述>
  ...
參考檔：<absolute paths>
配色來源：src/styles/theme.css
排版：橫向並排 / 2x2 grid
尺寸：480×360

產出 .ai/previews/<topic>.html。
```

### DV

```
先讀 .ai/roles/design-visual.md 理解你的角色規範。

Panel：<panel-name>
截圖清單：
  - <absolute-path-1>：overview 狀態
  - <absolute-path-2>：hover 狀態
  - <absolute-path-3>：selected 狀態
配色來源：src/styles/theme.css
Panel 使用情境：<1-2 句描述>

產出 .ai/audits/<panel>.md 中文視覺問題清單。不給修法建議。
```

---

## 附錄：目錄結構參考

```
專案根/
├── CLAUDE.md                # 根 CLAUDE.md（流程總覽 + 模組清單 + Session SOP）
├── .ai/
│   ├── WORKFLOW.md          # 本文件（流程 + 角色 reference）
│   ├── roles/               # 完整角色規範
│   │   ├── consultant.md    # AA（原 advisor.md，重命名避免與 Claude 內建 advisor() 衝突）
│   │   ├── explorer.md      # EX
│   │   ├── mock-preview.md  # MP
│   │   ├── design-visual.md # DV
│   │   ├── tasker.md        # AT
│   │   ├── developer.md     # AD
│   │   ├── pr-qc.md         # QC
│   │   └── pr-merge.md      # PM
│   ├── module-cache/        # 前置知識 DB（EX 按需維護）
│   │   └── <module>.md
│   ├── previews/            # MP 產出（design history，PM 不刪）
│   │   └── <topic>.html
│   ├── audits/              # DV 視覺審計報告
│   │   └── <panel>.md
│   └── session/             # AH 交接筆記（讀完刪）
│       └── current.md
├── src/<module>/CLAUDE.md   # 每模組獨立 CLAUDE.md（範圍限制 + 當前任務 + 慣例）
└── ...
```
