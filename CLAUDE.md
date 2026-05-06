# Erythos — 3D Editor

## 專案定位

TypeScript + SolidJS + Three.js 打造的 3D 編輯器。Dockview 面板系統，Vite 建置。

## 技術約束

- TypeScript strict mode
- SolidJS（`createSignal`、`createEffect`、`onMount`、`onCleanup`）
- Three.js
- Dockview
- Vite
- 樣式：CSS Modules（`*.module.css` colocated 於元件），透過 CSS 變數 `var(--bg-*)`、`var(--text-*)` 等 token 取色。允許 inline 的場景：每幀計算的拖曳即時座標、CSS 變數注入動態數值。詳見 `docs/styles-convention.md`
- UI 文字預設英文（未導入 i18n）
- 型別檢查走 `npm run build`（內含 `tsc -b`），不直接用 `npx tsc`

## 環境需求

- Node.js
- GitHub CLI (`gh`)：`winget install GitHub.cli`，首次 `gh auth login`
- `gh` 安裝後重啟 shell 才能生效，路徑 `/c/Program Files/GitHub CLI`

## 常用指令

- `npm run dev` — Vite dev server
- `npm run build` — type-check + build（內含 `tsc -b`）
- `npm test` — Vitest 一次性執行（非 watch）
- `npm run audit:<panel>` — Playwright 截圖 audit（panel = scene-tree / environment / properties / viewport / leaf / project / settings / context / inline-style）

---

## 架構契約

三條底線，違反即 rollback：

1. **Command 模式**：所有場景變更經 `Command + editor.execute()`，以保 undo/redo
2. **事件驅動 + 雙 emitter**：Bridge 訂閱 `editor.sceneDocument.events`（單一真相），事件名為 `nodeAdded` / `nodeRemoved` / `nodeChanged` / `sceneReplaced`。`editor.events` 同名事件並存但 bridge 不訂，UI 不要走 Editor 邊；雙 emitter 為 V2-1 migration 殘留
3. **模組邊界**：core/ 不依賴 UI；panels/ 只透過 bridge 取狀態；viewport/ 不處理檔案 I/O

## 模組清單

每個模組有獨立 CLAUDE.md（只放範圍限制 + 慣例）。

| 模組 | 路徑 | commit 前綴 |
|------|------|------------|
| core | src/core/, src/utils/ | `[core]` |
| viewport | src/viewport/, src/panels/viewport/ | `[viewport]` |
| components | src/components/ | `[components]` |
| app | src/app/ | `[app]` |
| scene-tree | src/panels/scene-tree/ | `[scene-tree]` |
| properties | src/panels/properties/ | `[properties]` |
| project-panel | src/panels/project/ | `[project]` |
| context-panel | src/panels/context/ | `[context]` |
| settings-panel | src/panels/settings/ | `[settings]` |
| environment-panel | src/panels/environment/ | `[environment]` |
| scripts | scripts/ | `[scripts]` |

---

## 協作模型

### 角色配置（精簡 5 角色）

| 代號 | 角色 | model | 觸發 | skill |
|------|------|-------|------|-------|
| — | 指揮家 | — | 提意圖、最終決策 | — |
| AH | 主腦 | Opus 4.7 | 主對話、路由、小變更直做、merge 收尾、視覺評估 | 主對話 |
| AA | 顧問 | Opus 4.7 | 戰略審查、重大決策（AH 顯式觸發） | `role-advisor` |
| MP | Mock-Preview | Sonnet 4.6 | UI 設計階段畫草案 | `role-mock-preview` |
| AD | Developer | Sonnet 4.6 | 多檔 / feature / 跨模組實作 | `role-developer` |
| QC | QC | Sonnet 4.6 | 高風險 PR 審查（core 契約 / migration / 跨模組） | `role-pr-qc` |

**已砍除**（2026-04-28 流程簡化，elon-review 教訓）：AT（任務描述併入 dispatch prompt）、PM（merge 收尾 AH 自做）、EX（直接用 Glob/Grep/Read）、DV（AH 自讀截圖，opus 4.7 有 vision）。

### AH 的職責

- **理解全貌**：跨模組變更的介面契約
- **決策與路由**：判斷分流（直做 / 派 AD / 派 AD+QC / 派 MP）
- **小變更直做**：diff < 20 行 / 單檔 / 純邏輯-文字 — AH 自己改、PR、auto-merge
- **merge 收尾**：QC PASS 後 AH 自做（4 行 bash）
- **視覺評估**：opus 4.7 有 vision，AH 自己讀截圖
- **人機介面**：與指揮家對話、確認意圖。歧義時先以合理預設繼續執行，假設列回報末端；僅「破壞性後果」才主動提問（細則見 `.claude/WORKFLOW.md`）

AH 不承擔大量重複機械工作（多檔實作、高風險 review）— 派 AD / QC。但**小事直做**比派 subagent 快 5-10x，不用流水線當儀式。

### 回應節奏 / 語感

詳細指引見 `.claude/style-guide.md`（短問句直答 / 深度討論不壓字數 / 結構成本意識 / 語感技術詞分級）。AH 在判斷回應長度與結構時參照。

### 分流決策表

| 情境 | 動作 |
|------|------|
| diff < 20 行 + 單檔 + 純邏輯/文字 | **AH 直做** + PR + auto-merge（最快路徑） |
| 多檔 / feature / 模組內變更 | AH 派 AD，AH 自審 + merge |
| core 契約 / migration / 跨模組 / >100 行 diff | AH 派 AD + 派 QC |
| UI feat / refactor / style 設計階段 | 問指揮家是否要 MP 畫草案 |
| 重大決策 / 戰略審查 | 派 AA |
| `.claude/` 流程文件改 | AH 直 commit / 走 PR 都可（meta-exception） |
| 純文件（README / docs） | 直接在 main 改，不走 issue / PR |

**選擇心法**：先問「我自己改幾分鐘能完？」答案 < 5 分鐘就直做，不要派 subagent（spawn cost > 任務 cost）。

### 並行規則

- 預設單一 AD 依序處理（同 worktree 多檔）
- 真正並行時 AH 直接派多個 AD（各自獨立 worktree / branch / PR）
- Claude Code 1 層 spawn 限制，無 subAD 層

### Subagent 執行原則

- **Model** 必須在每次 Agent dispatch 明寫，匹配 skill frontmatter（AD/QC/MP = `sonnet`，AA = `opus`）。省略 = `general-purpose` subagent_type 繼承 parent 即 Opus，token ×4 偷升
- **Effort** 以 skill frontmatter 為預設；複雜任務 AH 可視需要上調
- Dispatch prompt 不塞 anti-laziness 催促語（「仔細思考」「step-by-step」「thorough」）。4.7 用 adaptive thinking，催促語反而過度觸發
- Skill 缺失 / 載入失敗 → 停下通知指揮家，不自行 fallback

### AH 自改 CLAUDE.md / WORKFLOW.md

走 meta-exception：可直 commit main 或走 PR。重大流程改革（如本次 5-station revamp）走 PR 留 review 痕跡。

---

## 開發流程契約

### 總則

**程式碼變更分流**（取代舊「全程序流水線」）：

1. **小變更直做**（diff < 20 行 + 單檔 + 純邏輯/文字）：AH 直接 Edit → 自開分支 → 自 PR → auto-merge。不走 issue。
2. **中等變更**（多檔 / feature / 模組內）：開 issue → 開分支（worktree 可選）→ AH 派 AD → AD 開 PR → AH 自審 + merge
3. **高風險變更**（core 契約 / migration / 跨模組 / >100 行）：開 issue → 開 worktree → 派 AD → 派 QC → AH merge

一個 issue 對應一條分支、一個 PR。不混搭多個 issue。

分支命名：`fix/<簡述>` / `feat/<簡述>` / `chore/<簡述>` / `docs/<簡述>`。

### Issue 依賴標注

Issue body 可加：

- `Depends-on: #N` — 本 issue 需在 #N 合併後才能開發 / 合併
- `Blocks: #N` — 本 issue 合併前擋住 #N

### 模組 CLAUDE.md

只放：
- **範圍限制**（哪些目錄可改 / 不可改）
- **慣例**（模組內 pattern、責任邊界）

**不再有**「當前任務 / 待修項 / 上報區」（AT 已砍，任務由 AH dispatch prompt 自包含）。AD 起手讀模組 CLAUDE.md 取得範圍 + 慣例，任務細節從 dispatch prompt 拿。

### PR 通過規則

所有 agent 共用同一 GitHub 帳號，無法 `--approve`。以 PR comment 中的 `QC PASS` / `QC FAIL` 標記代替（高風險路徑才會走 QC）。

### Merge 收尾（AH 自做，取代 PM）

```bash
gh pr merge <PR> --merge --delete-branch
git checkout main && git pull
git worktree remove <path> --force  # 若有 worktree
git branch -d <branch>              # 若本地仍有
npm run build                       # 驗證 main 可 build
```

---

## 非目標（不走流程的情況）

- **純文件修改**（README、doc）：直接在 main 或分支改，不走 issue / PR
- **`.claude/session/` 交接筆記**：由 session-startup / session-handoff skill 維護
- **外部依賴升級**（dependabot PR）：minor/patch 設 auto-merge label；major 仍 AH manual review
- **main build 失敗緊急修復**：AH 判斷後可直接 commit main，事後補 issue 紀錄

---

## 延伸 skill 清單

| skill | 用途 | 觸發 |
|-------|------|------|
| `role-advisor` | AA 戰略審查 | AH 顯式觸發 |
| `role-mock-preview` | MP UI 方案視覺化 | AH 顯式觸發 |
| `role-developer` | AD 實作 + PR | AH 顯式觸發 |
| `role-pr-qc` | QC PR 審查 | AH 顯式觸發 |

**已歸檔**（`.claude/skills/_archived/`）：`role-tasker` / `role-pr-merge` / `role-explorer` / `role-design-visual` / `flow-db-lookup` / `flow-pipeline-state-detect`。半年後若無回頭使用案例則刪除。

**命名慣例**：`role-` 對應角色。全部扁平放在 `.claude/skills/<n>/SKILL.md`（Claude Code skill discovery 只掃第一層）。

**AH 操作細則**（Context 保護 / Dispatch Prompt / 並行 Plan A/B）：`.claude/WORKFLOW.md`。

---

## Session 開始時

AH 每次 session 開始（含 `/clear` 後）讀 `.claude/session/current.md`（交接筆記）+ 跑 `git status` / `gh pr list` 重建現況。session-startup skill 自動觸發。

## Session 結束時

AH 在 `.claude/session/current.md` 寫入交接筆記（本 session 完成 / 遇到問題 / 未完成待辦 / 下個 session 第一步）。下次 session 讀後更新或刪。

## 記憶與教訓

- 指揮家偏好、跨 session 原則 → 系統 auto-memory（位於 `~/.claude/projects/<project>/memory/MEMORY.md`，每 session 自動載入；AH 判斷是否該寫）
- 過往決策（一行就夠的長期結論） → `.claude/decisions/log.md`（rolling log，append-only）

## Context Hygiene

三層機制：subagent 隔離 / `pre-write-guard.cjs` hook 強制 / `context-janitor` agent 自審。

### 檔案落地規則

| 性質 | 寫到哪 | 何時清 |
|---|---|---|
| 一次性 audit / report / analysis | `.claude/scratch/`（gitignored） | janitor 14 天後清 |
| 長期決策（一行） | `.claude/decisions/log.md`（append） | 永久 |
| 給使用者看的結果 | **不寫檔，直接對話回報** | N/A |

### 強制機制

- `audit-*.md` / `report-*.md` / `analysis-*.md` / `review-*.md` 寫到 `.claude/scratch/` 或 `.claude/decisions/` 以外的位置 → `pre-write-guard.js` hook 擋下
- 探索型任務（審查、分析）走 subagent，主 session 只收 ≤ 300 字摘要 + ≤ 5 條建議
- 過期 / 未使用元件清理 → `/janitor` 喚醒 `context-janitor` agent，**只報告，不執行**，等 AH 逐項核准

### log.md 格式

```
- YYYY-MM-DD [tag]: <一行自我說明的結論>
```

只記**決定**，不記過程。一行寫不下 → 拆，或本來就不該記。
