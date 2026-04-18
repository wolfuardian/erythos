# Erythos — 3D Editor

## 環境需求

- Node.js
- GitHub CLI (`gh`) — 用於開 issue、建 PR。安裝：`winget install GitHub.cli`，首次需 `gh auth login`
- `gh` 安裝後需重啟 shell 才能找到，路徑：`/c/Program Files/GitHub CLI`

## 專案慣例

- 語言：TypeScript（strict mode）
- UI 框架：SolidJS（用 createSignal, createEffect, onMount, onCleanup）
- 3D 引擎：Three.js
- 面板佈局：Dockview
- 建置工具：Vite
- 樣式：inline style + CSS 變數 var(--bg-*), var(--text-*)
- UI 文字預設使用英文（目前未導入本地化機制，所有使用者可見文字以英文撰寫）
- 型別檢查用 `npm run build`，不要用 `npx tsc`（專案未直接安裝 typescript CLI）

## 架構原則

- **Command 模式**：所有場景變更必須透過 Command + editor.execute()，確保 undo/redo
- **事件驅動**：Editor 發事件 → Bridge 更新 signal → 面板自動重渲染
- **事件順序**：objectAdded → sceneGraphChanged（不能反過來）
- **模組邊界**：core/ 不依賴 UI，panels/ 透過 bridge 取得狀態，viewport/ 不處理檔案 I/O

## 協作角色與流程

### 角色分工

| 角色 | 代號 | 模型 | 職責 | 規範 |
|------|------|------|------|------|
| 指揮家（使用者） | — | — | 提出意圖與方向，做最終決策 | — |
| 主腦（主控 session） | AH | Opus | 理解全貌、拆 issue、建 worktree、dispatch agent、執行 merge | — |
| 顧問 | AA | Opus | 承擔昂貴探索、減少 AH context 消耗、戰略審查（非每次必用） | — |
| Mock-Preview | MP | Sonnet（可升 Opus） | UI 腦爆階段純視覺化工人，產出 HTML mockup 供指揮家挑方案 | [.ai/roles/mock-preview.md](.ai/roles/mock-preview.md) |
| Design-Visual | DV | Sonnet | 讀截圖 + theme.css 產出中文視覺美感問題清單（不碰 Playwright、不讀 src、不給修法建議） | [.ai/roles/design-visual.md](.ai/roles/design-visual.md) |
| Tasker | AT | Sonnet | 將 issue 轉化為模組 CLAUDE.md 當前任務區塊 | [.ai/roles/tasker.md](.ai/roles/tasker.md) |
| 開發 agent | AD | Sonnet | 在指定 worktree 實作功能，commit + push + 開 PR | [.ai/roles/developer.md](.ai/roles/developer.md) |
| QC agent | QC | Sonnet | 審查 PR diff，在 PR 留 QC PASS / QC FAIL comment | [.ai/roles/pr-qc.md](.ai/roles/pr-qc.md) |
| Merge 操作 | PM | Sonnet | QC PASS 後執行完整 merge 收尾流程 | [.ai/roles/pr-merge.md](.ai/roles/pr-merge.md) |
| Reader-Manager | RDM | Sonnet | 維護 `.ai/module-cache/<module>.md` 品質（對照 src 驗證、刪冗、補新增）；大模組時可並行 spawn RD 讀 src。其他角色預設信任 cache | [.ai/roles/reader-manager.md](.ai/roles/reader-manager.md) |
| Reader | RD | Sonnet | RDM 的大模組 scale-out 工具，被 RDM 批量並行 spawn | [.ai/roles/reader.md](.ai/roles/reader.md) |

> AA 用途：需要大量探索才能確定方向時由 AH 主動 spawn，目的是把昂貴分析外包給 AA，不消耗 AH context。AD 遇到問題可自行呼叫內建 `advisor()` 升級，與 AA 用途不同。
>
> RDM 用途：PR merge 後即時更新 `.ai/module-cache/<module>.md`，讓後續 AT / AD / QC / AH 先查 cache 不重讀整個模組。其他角色**預設信任 cache**（品質責任在 RDM 的對照 src 驗證 + 抽樣驗證準則）；若遇到 src 事實與 cache 明顯衝突，上報 AH 由 AH trigger RDM 刷新，不自行忽略 cache 硬讀整模組。
>
> RD 用途：**僅 RDM 在大模組 scale-out 時 spawn**。其他角色不直接 spawn RD — 透過 `.ai/module-cache/` 複用 RDM 成果。

### 開發模組清單

每個模組有獨立的 CLAUDE.md，agent 名稱 = 模組名稱。

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

### 分支規則

**所有程式碼變更一律走完整流程：issue → 分支 + worktree → 開發 → PR → QC → merge。**
不論改動大小，不得直接在 master 上修改程式碼。唯一例外是 merge 後的收尾 commit（清理 CLAUDE.md、build 驗證等非程式碼改動）。

一個 issue 對應一條分支、一個 PR。不混搭多個 issue 到同一分支。

分支命名：`fix/<簡述>` 或 `feat/<簡述>`。

### 模組 CLAUDE.md 編寫原則

模組 CLAUDE.md 只放**範圍限制、任務描述、慣例**。「當前任務」區塊須**完整自包含**（含精確修法、程式碼片段、commit 格式、PR 開法），AD 讀完即可開工，不需查其他文件。

主腦準備 worktree 時在「當前任務」寫入任務描述；QC 退回時在「待修項」寫入修正項。兩者不混用。

### Issue 依賴標注

Issue body 可加以下行表達依賴關係：
- `Depends-on: #N` — 本 issue 需在 #N 合併後才能開發 / 合併
- `Blocks: #N` — 本 issue 合併前擋住 #N 的進度

Session startup 時 AH 掃開放 issue 的 body 建依賴圖，優先啟動無依賴者；若選到被封鎖者，先處理其依賴。

### Pre-flight 查 cache（可選，跨模組變更建議）

當 AH 懷疑變更會牽動其他模組的 API 或型別（例如調用 components / core 函式，但不確定介面），**開 issue 前**先查 `.ai/module-cache/<module>.md`：

- 使用時機：跨模組 API 依賴、未知 component 的 props 形狀、既有 util / pattern 不明
- 起手順序：
  1. 查 `.ai/module-cache/<module>.md` 有無相關條目（types / pattern / 地雷）
  2. cache 不存在或資訊不足 → spawn RDM 建 / 補 cache（RDM 若判定大模組會自己 spawn RD 大軍）
  3. **不要**直接 spawn RD 讀 src — 過時的「pre-flight RD」做法已改為 cache-first
- 目的：避免 AT / AD 跑到一半才發現要先改其他模組，省整輪重來（參考 #310 教訓：AT-B 跑完才發現 ConfirmDialog 不支援英文 → 重開 #311 前置作業）

### 流水線流程

**UI 類變更腦爆階段（選擇性，在開 issue 前）：**

若變更涉及 UI feat/fix/refactor/style，AH 預設主動詢問指揮家「要不要 MP 先畫？」。豁免項（不需 MP）：純文字改動、單一 CSS 屬性微調、純邏輯 bug 無視覺變化。

指揮家同意 → AH 與指揮家談出 N 個方案（至少 2 個）→ spawn MP（背景）→ 產出 `.ai/previews/<topic>.html` → 指揮家挑定方案 → AH 在 issue body 加 `Mockup: .ai/previews/<topic>.html` 行 → 進入正常流程。

MP 是純視覺化工人，不提建議、不做決策。前提是方案已經談清楚，不可把模糊需求丟給 MP 自行詮釋。

**UI 視覺審計階段（選擇性，針對活網頁盤點）：**

當指揮家想整體盤點某個 panel 或全站的視覺品質時：
1. AH 起 dev server 並準備截圖（親自 Playwright MCP 或用 seed script）→ 存 `.ai/audits/<panel>/`
2. spawn DV（背景）→ 讀圖 + 對照 `theme.css` → 產出 `.ai/audits/<panel>.md` 美感問題清單（中文、不含修法建議）
3. AH 與指揮家挑要修的項 → 依項開 issue 並行執行

DV 與 MP 的差別：MP 是設計階段**畫草案**，DV 是實作後**讀截圖評美感**找落差。DV **不做 code review**（token 缺失 / 硬編碼屬於 DE 職責，DV 只看視覺）。

**Bug / 小功能（單一模組）：**
1. AH 調查後開 GitHub issue（帶 label）
2. AH 建 worktree + spawn AT（背景）撰寫任務描述
3. AH 審閱 AT 產出 → 寫入模組 CLAUDE.md 當前任務
4. AH spawn AD（背景）→ 實作 → commit + push → 開 PR
5. AH spawn QC（背景）→ 審查 PR → 留 QC PASS / QC FAIL comment
6. QC PASS → AH 直接 merge + cleanup
7. QC FAIL → AH 更新 CLAUDE.md 待修項 → 回到步驟 4

**Fast path（豁免級變更直通車道）：**

當變更屬於以下任一豁免項時，AH 可跳過 AT，**自己**寫任務描述到模組 CLAUDE.md 並 spawn AD：
- 純文字改動（copy edit、typo、翻譯）
- 單一 CSS 屬性微調（單一顏色 / 間距 / 尺寸）
- 純邏輯 bug 無視覺變化

Fast path 流程：
1. AH 開 issue + 建 worktree
2. **AH 自寫任務**到 worktree 的模組 CLAUDE.md「當前任務」（格式同 AT：含 before/after、負面指令、commit、PR 指令）
3. AH spawn AD → PR → QC → merge（4 步起同標準流程）

Fast path 省 AT 整輪（~3 分鐘 + 一次審閱）。若變更不符豁免，**不得強用 Fast path**，走完整流程。

**大功能（跨模組）：**
1. AH 設計介面契約，更新根 CLAUDE.md
2. 拆分支（每模組一條），建 worktree，spawn AT 撰寫各模組任務
3. AH 審閱 → 寫入各模組 CLAUDE.md
4. AH 同時 spawn 多個 AD（各 worktree 並行，背景）
5. 各 AD 開 PR 後，AH spawn QC（背景）逐 PR 審查
6. 依合併順序（有依賴的先合）逐一 merge

### Subagent 執行原則

- **AH spawn 的 subagent 用 `run_in_background: true`**，AH 不阻塞等待
- AH 在等待期間可與指揮家對話、處理其他事務
- Agent 完成後 AH 會收到通知，再接續下一步
- **Dispatch prompt 必須指向角色規範**：
  - MP → 讀取 `.ai/roles/mock-preview.md`
  - AT → 讀取 `.ai/roles/tasker.md`
  - AD → 讀取 `.ai/roles/developer.md` + 模組 CLAUDE.md
  - QC → 讀取 `.ai/roles/pr-qc.md`
  - PM → 讀取 `.ai/roles/pr-merge.md`
- AT / AD / QC / PM / MP 均預設 Sonnet 模型，節省 token。MP 在複雜任務 AH 可於 dispatch 升 Opus。
- **Agent 工具呼叫必須明確指定 `model` 參數**（`'sonnet'` 或 `'opus'`）。不指定會走 general-purpose 預設 Opus，等於默默升級，token 成本 ×4。AT / AD / QC / PM / MP 一律明寫 `model: 'sonnet'`。

### Cache-first 讀取紀律

所有需要理解模組 src 的角色（AT / AD / QC / AH），**起手一律先查 cache**：

```
角色收到任務
  → 查 .ai/module-cache/<module>.md
    ├─ 存在 → 讀 cache 取速覽（types / patterns / 地雷 / 最近 PR）
    │         需細節再用 Read + offset/limit 精準補讀
    └─ 不存在 → 正常讀 src（每檔 ≤ 200 行用 offset+limit）
  → 遇到 src 事實與 cache 明顯衝突 → 上報 AH 由 AH trigger RDM 刷新
  → 不因輕微不確定就放棄 cache 重讀整模組（浪費 RDM 工作成果）
```

**信任基礎**：RDM 驗證準則（對照 src 驗證每條 fact + 抽樣 2-3 關鍵 fact）見 [.ai/roles/reader-manager.md](.ai/roles/reader-manager.md)。Cache 是 RDM 整理過的成品，預設可信。

**RD 大軍模式僅限 RDM 使用**：RDM 處理大模組（> 8 檔 或 ≥ 800 行）時可並行 spawn 多個 RD 分工讀 src（每 RD 1-2 檔回 ≤ 30 行摘要）。其他角色不直接 spawn RD。藍圖：[.ai/roles/reader.md](.ai/roles/reader.md)。

### Merge 流程

1. AD 完成實作 → commit + push → 開 PR（`gh pr create`）
2. QC 在 PR 上留 comment：
   - 通過：包含 **`QC PASS`** 標記
   - 不通過：包含 **`QC FAIL`** 標記 + 問題說明 + 開 issue
3. AH 直接處理結果，無需指揮家轉達：
   - **QC PASS** → AH 執行 merge + cleanup
   - **QC FAIL** → AH 更新模組 CLAUDE.md 待修項 → spawn AD 修復 → QC 再次 review

> 所有 agent 共用同一 GitHub 帳號，無法使用 `--approve`，以 PR comment 中的 `QC PASS` / `QC FAIL` 標記代替。

### Merge 後收尾

QC PASS 後，AH spawn PM（背景）執行機械操作，然後 AH 自行處理需要判斷的部分。

**PM 執行（背景）：**
1. `gh pr merge` → `gh issue close` → `git worktree remove` → `git pull` → 刪分支
2. 清理模組 CLAUDE.md（清空當前任務/待修項/上報區）
3. `npm run build` 驗證
4. Trigger RDM 刷新涉及模組的 `.ai/module-cache/<module>.md`（依 PR file 列表 map 模組 → 並行 spawn RDM；失敗不重試不 block）
5. commit 收尾改動並 push（含 RDM 寫的 cache）

**AH 在 PM 完成後執行：**
5. 拜讀 `.ai/memos/` 目錄：有價值 → 歸檔至 `.ai/knowledge.md`；瑣碎 → 刪除
6. 審查 `.ai/knowledge.md`：移除已過期（`⏳`）條目

### 文件維護流程

- AH 更新文件後 → 自行校閱一致性 → 將 master merge 進所有 active feat 分支
- 指揮家與成員溝通不順時 → AA 診斷問題根因

### 開發成員 SOP
所有開發 agent 遵守 [.ai/roles/developer.md](.ai/roles/developer.md)。

## AH Session Startup SOP

**每次 session 開始（含 /clear 後）必須執行：**

### 0. 讀取上一個 session 的交接筆記
```bash
ls .ai/session/
```
如果有檔案，逐一讀取，了解上次做了什麼、遇到什麼問題、待辦是什麼。讀完後刪除（保證上下文新鮮）。

### 1. 重建 pipeline 狀態
```bash
git worktree list          # 哪些 worktree 活著（= 哪些 issue 在開發中）
gh pr list                 # 哪些 PR 待 QC 或待 merge
gh issue list              # 哪些 issue 開著
git log origin/master..master --oneline   # 本地 master 有無未 push 的 commit
```

對每個 active worktree，讀其模組 CLAUDE.md（當前任務 + 待修項）。

**解析依賴圖**：掃所有 open issue 的 body，找 `Depends-on:` / `Blocks:` 行，建圖。優先推進**無依賴**的 issue；被封鎖的 issue 先處理其依賴。

**若 `git log origin/master..master` 非空**：**先 push master** 再建任何新 worktree，避免 unpushed commits 混入 PR diff（參考 #304 教訓）。

重建 pipeline 狀態：

| 狀態 | 判斷條件 | 下一步 |
|------|---------|--------|
| 開發中 | worktree 存在，無 PR | spawn AD |
| 等 QC | PR open，無 QC comment | spawn QC |
| 等 merge | PR 有 QC PASS | merge + cleanup |
| 等修復 | PR 有 QC FAIL，CLAUDE.md 有待修項 | spawn AD fix |
| 等依賴 | issue 有 `Depends-on:` 指向未合 issue | 先處理依賴 |
| 閒置 | 無 worktree，無 open PR | 等指揮家指示 |

重建完畢後向指揮家報告現況，或直接繼續推進。

### 2. AH Context 保護

AH 是最昂貴的角色（Opus），context 必須留給決策和對話：

- **Cache-first**：要理解模組現況時，**先查 `.ai/module-cache/<module>.md`**，不要直接讀 src。cache 是 RDM 驗證過的速覽，預設可信（見上方 Cache-first 讀取紀律）
- **不自己讀大檔案**：超過 100 行的 src 檔案交給 AT 或 AA 讀，AH 只看摘要
- **不自己寫 CLAUDE.md 任務**：交給 AT，AH 只審閱和修正（**例外**：Fast path 下 AH 自寫豁免級任務）
- **不自己跑 merge 收尾**：交給 PM，AH 只處理 memos/knowledge
- **不自己做完整 code review**：交給 QC，AH 只看結論
- **git log / git diff 限制**：只看最近 5 條 commit 或 diff stat，不讀完整歷史

**讀取技巧**：
- 審閱 AT 產出的模組 CLAUDE.md 時，先 `grep -n "^##"` 抓 section 邊界，再用 `Read` 的 `offset + limit` 只讀「當前任務」區塊（~30–50 行），跳過範圍限制 / SOP / 慣例樣板。省 ~60% context
- AT 回報摘要若已明確（含行號、技術決策、無意外標記），AH 可**直接派 AD 不重讀 CLAUDE.md**。信任摘要，省整檔 Read
- 只有 AT 摘要含「意外」、「上報」或不確定時，才讀完整 CLAUDE.md

### 3. Session 結束前
在 `.ai/session/` 寫入交接筆記，供下一個 session 讀取：
- 本次完成了什麼（issue / PR 清單）
- 遇到的問題和解決方式
- 未完成的待辦
- 觀察到的指揮家偏好
