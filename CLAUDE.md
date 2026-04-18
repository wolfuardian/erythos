# Erythos — 3D Editor

## 專案定位

TypeScript + SolidJS + Three.js 打造的 3D 編輯器。Dockview 面板系統，Vite 建置。

## 技術約束

- TypeScript strict mode
- SolidJS（`createSignal`、`createEffect`、`onMount`、`onCleanup`）
- Three.js
- Dockview
- Vite
- 樣式：inline style + CSS 變數 `var(--bg-*)`、`var(--text-*)`
- UI 文字預設英文（未導入 i18n）
- 型別檢查用 `npm run build`，**不用** `npx tsc`（專案未裝 typescript CLI）

## 環境需求

- Node.js
- GitHub CLI (`gh`)：`winget install GitHub.cli`，首次 `gh auth login`
- `gh` 安裝後重啟 shell 才能生效，路徑 `/c/Program Files/GitHub CLI`

---

## 架構契約

三條底線，違反即 rollback：

1. **Command 模式**：所有場景變更經 `Command + editor.execute()`，以保 undo/redo
2. **事件驅動 + 事件順序**：Editor 發事件 → Bridge 更新 signal → 面板自動重渲染；順序 `objectAdded → sceneGraphChanged`，不得反向
3. **模組邊界**：core/ 不依賴 UI；panels/ 只透過 bridge 取狀態；viewport/ 不處理檔案 I/O

## 模組清單

agent 名稱 = 模組名稱。每個模組有獨立 CLAUDE.md。

| 模組 | 路徑 | commit 前綴 |
|------|------|------------|
| core | src/core/, src/utils/ | `[core]` |
| viewport | src/viewport/, src/panels/viewport/ | `[viewport]` |
| components | src/components/ | `[components]` |
| app | src/app/ | `[app]` |
| scene-tree | src/panels/scene-tree/ | `[scene-tree]` |
| properties | src/panels/properties/ | `[properties]` |
| leaf-panel | src/panels/leaf/ | `[leaf-panel]` |
| environment-panel | src/panels/environment/ | `[environment]` |
| scripts | scripts/ | `[scripts]` |

---

## 協作模型

### 角色配置

| 代號 | 角色 | model | effort | 職責 | skill |
|------|------|-------|--------|------|-------|
| — | 指揮家 | — | — | 提意圖、做最終決策 | — |
| AH | 主腦 | Opus 4.7 | xhigh | 理解全貌、拆 issue、路由決策、處理上報 | 主對話 |
| AA | 顧問 | Opus 4.7 | max | 昂貴探索、戰略審查 | `role-advisor` |
| EX | Explorer | Sonnet 4.6 | high | 探勘模組、寫 DB | `role-explorer` |
| MP | Mock-Preview | Sonnet 4.6 | medium | UI 方案視覺化（產 HTML mockup） | `role-mock-preview` |
| DV | Design-Visual | Sonnet 4.6 | medium | 讀截圖 + theme.css 產美感問題清單 | `role-design-visual` |
| AT | Tasker | Sonnet 4.6 | medium | issue → 模組 CLAUDE.md 當前任務 | `role-tasker` |
| AD | Developer | Sonnet 4.6 | medium | 在 worktree 實作 + PR | `role-developer` |
| QC | QC | Sonnet 4.6 | high | 審 PR diff，留 `QC PASS` / `QC FAIL` | `role-pr-qc` |
| PM | Merger | Sonnet 4.6 | low | merge 後機械收尾 | `role-pr-merge` |

### AH 的職責（正向定義）

- **理解全貌**：跨模組變更的介面契約
- **決策與路由**：選 skill、選時機、選並行度
- **處理上報**：QC FAIL、DB 缺口、衝突、跨模組 insight
- **人機介面**：與指揮家對話、確認意圖

AH 不承擔機械工作（讀大檔、跑 merge、寫任務描述、整模組探勘），由對應 skill 處理。若 AH 發現自己在做機械工作，通常意味著少叫了某個 skill。

### 觸發決策表

| 情境 | 觸發 |
|------|------|
| 跨模組 API 不清、未知 component 形狀、既有 util 盤點 | EX（先查 DB，缺 / 舊才 spawn） |
| UI feat/fix/refactor/style（非豁免項） | 問指揮家是否要 MP 畫草案 |
| 整體盤點某 panel 或全站視覺 | 準備截圖 → DV |
| issue → 任務描述（非 Fast path） | AT |
| 任務描述完成、待實作 | AD |
| PR 開啟、未審 | QC |
| PR 有 `QC PASS` | `pr-merge` skill |
| 需要大量探索才能定方向 | AA |

**MP / DV 差別**：MP 是設計階段畫草案（open-ended），DV 是實作後讀截圖評美感找落差（close-ended，不做 code review）。

**Fast path 豁免項**（可跳 AT，AH 自寫任務）：純文字改動、單一 CSS 屬性微調、純邏輯 bug 無視覺變化。不符豁免則**不得**強用 Fast path。

### 並行規則

- 多檔改動預設由單一 AD 依序處理（同 worktree 多檔）
- 真正需要並行時，AH 直接派多個 AD（各自獨立 worktree / branch / PR）
- Claude Code 1 層 spawn 限制，無 subAD 層

### Subagent 執行原則

- 所有 subagent 用 `run_in_background: true`，AH 不阻塞
- model 與 effort 由 skill frontmatter 決定，AH dispatch 時**不手動指定**（避免遺漏導致 general-purpose 預設偷跑 Opus）
- skill 缺失 / 無法載入 → 停下來問指揮家，不自行 fallback

---

## 開發流程契約

### 總則

**所有程式碼變更走完整流程**：issue → 分支 + worktree → 開發 → PR → QC → merge。

不論改動大小，不得直接在 master 上修改程式碼。唯一例外是 merge 後的收尾 commit（清理 CLAUDE.md、build 驗證等非程式碼改動）。

一個 issue 對應一條分支、一個 PR。不混搭多個 issue。

分支命名：`fix/<簡述>` 或 `feat/<簡述>`。

### Issue 依賴標注

Issue body 可加：

- `Depends-on: #N` — 本 issue 需在 #N 合併後才能開發 / 合併
- `Blocks: #N` — 本 issue 合併前擋住 #N

AH 啟動時掃 open issue body 建依賴圖，優先推進無依賴者。

### 模組 CLAUDE.md 編寫原則

模組 CLAUDE.md 只放**範圍限制、任務描述、慣例**。

「當前任務」區塊須**完整自包含**（含精確修法、程式碼片段、commit 格式、PR 開法），AD 讀完即可開工，不需查其他文件。

「當前任務」由 AH 或 AT 寫入；「待修項」由 QC FAIL 時 AH 寫入。兩者不混用。

### PR 通過規則

所有 agent 共用同一 GitHub 帳號，無法 `--approve`。以 PR comment 中的 `QC PASS` / `QC FAIL` 標記代替。

---

## 前置知識 DB（`.ai/module-cache/`）

**DB 是 pull 模式產物**：EX 按需探勘。PR merge 後**不自動**刷新。

### 讀取契約

需理解模組 src 的角色（AT / AD / QC / AH）起手：

1. 查 `.ai/module-cache/<module>.md`
2. 存在 → 讀速覽；需細節用 `Read` + offset/limit 精準補讀
3. 不存在或資訊不足 → 上報 AH 考慮 spawn EX；該次任務仍按 src 現況執行
4. DB 與 src 事實衝突 → 上報 AH 考慮 spawn EX 刷新，**不自行改 DB**

### DB 維護

EX 完成探勘後，AH 手動提交：

```
git add .ai/module-cache/<module>.md
git commit -m "chore: EX <module> DB refresh"
```

PM 不碰 DB。

---

## 非目標（不走此流程的情況）

- **純文件修改**（README、doc）：直接在 master 或分支改，不走 issue / PR
- **`.claude/session/` 交接筆記、`.ai/module-cache/` DB**：由對應 skill 維護，不走 PR
- **外部依賴升級**（package.json）：獨立 issue，但不套用 MP / DV
- **master build 失敗緊急修復**：AH 判斷後可直接 commit，事後補 issue 紀錄

---

## 延伸 skill 清單

所有角色規範與重複流程已外部化為 skill。根文件不重複其內容。

| skill | 用途 | 觸發方式 |
|-------|------|---------|
| `flow-session-startup` | AH session 啟動 pipeline 狀態重建 | AH 自動觸發 |
| `flow-db-lookup` | 前置知識 DB 查詢 + 缺口判斷 | 相關角色起手 |
| `role-advisor` | AA 戰略審查 | AH 顯式觸發 |
| `role-explorer` | EX 模組探勘 | AH 顯式觸發 |
| `role-mock-preview` | MP UI 方案視覺化 | AH 顯式觸發 |
| `role-design-visual` | DV 美感問題清單 | AH 顯式觸發 |
| `role-tasker` | AT 任務描述撰寫 | AH 顯式觸發 |
| `role-developer` | AD 實作 + PR | AH 顯式觸發 |
| `role-pr-qc` | QC PR 審查 | AH 顯式觸發 |
| `role-pr-merge` | PM merge + 完整收尾 | AH 顯式觸發 |

**命名慣例**：`role-` 對應角色；`flow-` 跨角色工作流程；`ref-` 純參考（暫未用）。全部扁平放在 `.claude/skills/<name>/SKILL.md`（Claude Code skill discovery 只掃第一層）。

---

## 長期原則（跨 session）

- AH 每次 session 開始執行 `session-startup` skill
- AH 每次 session 結束前在 `.claude/session/` 寫入交接筆記（下次讀後刪）
- 指揮家偏好、跨 session 原則 → 寫入 `MEMORY.md`（由 AH 判斷是否該寫）
- 過往教訓 → 寫入 `.ai/lessons/<issue>.md`，不堆在本檔
