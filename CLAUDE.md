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
| 任務撰寫 | TW | Sonnet | 將 issue 轉化為模組 CLAUDE.md 當前任務區塊 | [.ai/roles/task-writer.md](.ai/roles/task-writer.md) |
| 開發 agent | AD | Sonnet | 在指定 worktree 實作功能，commit + push + 開 PR | [.ai/roles/developer.md](.ai/roles/developer.md) |
| QC agent | QC | Sonnet | 審查 PR diff，在 PR 留 QC PASS / QC FAIL comment | [.ai/roles/pr-qc.md](.ai/roles/pr-qc.md) |
| Merge 操作 | MO | Sonnet | QC PASS 後執行完整 merge 收尾流程 | [.ai/roles/pr-merge.md](.ai/roles/pr-merge.md) |

> AA 用途：需要大量探索才能確定方向時由 AH 主動 spawn，目的是把昂貴分析外包給 AA，不消耗 AH context。AD 遇到問題可自行呼叫內建 `advisor()` 升級，與 AA 用途不同。

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

### 分支規則

**所有程式碼變更一律走完整流程：issue → 分支 + worktree → 開發 → PR → QC → merge。**
不論改動大小，不得直接在 master 上修改程式碼。唯一例外是 merge 後的收尾 commit（清理 CLAUDE.md、build 驗證等非程式碼改動）。

一個 issue 對應一條分支、一個 PR。不混搭多個 issue 到同一分支。

分支命名：`fix/<簡述>` 或 `feat/<簡述>`。

### 模組 CLAUDE.md 編寫原則

模組 CLAUDE.md 只放**範圍限制、任務描述、慣例**。「當前任務」區塊須**完整自包含**（含精確修法、程式碼片段、commit 格式、PR 開法），AD 讀完即可開工，不需查其他文件。

主腦準備 worktree 時在「當前任務」寫入任務描述；QC 退回時在「待修項」寫入修正項。兩者不混用。

### 流水線流程

**Bug / 小功能（單一模組）：**
1. AH 調查後開 GitHub issue（帶 label）
2. AH 建 worktree + spawn TW（背景）撰寫任務描述
3. AH 審閱 TW 產出 → 寫入模組 CLAUDE.md 當前任務
4. AH spawn AD（背景）→ 實作 → commit + push → 開 PR
5. AH spawn QC（背景）→ 審查 PR → 留 QC PASS / QC FAIL comment
6. QC PASS → AH 直接 merge + cleanup
7. QC FAIL → AH 更新 CLAUDE.md 待修項 → 回到步驟 4

**大功能（跨模組）：**
1. AH 設計介面契約，更新根 CLAUDE.md
2. 拆分支（每模組一條），建 worktree，spawn TW 撰寫各模組任務
3. AH 審閱 → 寫入各模組 CLAUDE.md
4. AH 同時 spawn 多個 AD（各 worktree 並行，背景）
5. 各 AD 開 PR 後，AH spawn QC（背景）逐 PR 審查
6. 依合併順序（有依賴的先合）逐一 merge

### Subagent 執行原則

- **所有 subagent 用 `run_in_background: true`**，AH 不阻塞等待
- AH 在等待期間可與指揮家對話、處理其他事務
- Agent 完成後 AH 會收到通知，再接續下一步
- **Dispatch prompt 必須指向角色規範**：
  - TW → 讀取 `.ai/roles/task-writer.md`
  - AD → 讀取 `.ai/roles/developer.md` + 模組 CLAUDE.md
  - QC → 讀取 `.ai/roles/pr-qc.md`
  - MO → 讀取 `.ai/roles/pr-merge.md`
- TW / AD / QC / MO 均使用 Sonnet 模型，節省 token

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

QC PASS 後，AH spawn MO（背景）執行機械操作，然後 AH 自行處理需要判斷的部分。

**MO 執行（背景）：**
1. `gh pr merge` → `gh issue close` → `git worktree remove` → `git pull` → 刪分支
2. 清理模組 CLAUDE.md（清空當前任務/待修項/上報區）
3. `npm run build` 驗證
4. commit 收尾改動並 push

**AH 在 MO 完成後執行：**
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
```

對每個 active worktree，讀其模組 CLAUDE.md（當前任務 + 待修項）。

重建 pipeline 狀態：

| 狀態 | 判斷條件 | 下一步 |
|------|---------|--------|
| 開發中 | worktree 存在，無 PR | spawn AD |
| 等 QC | PR open，無 QC comment | spawn QC |
| 等 merge | PR 有 QC PASS | merge + cleanup |
| 等修復 | PR 有 QC FAIL，CLAUDE.md 有待修項 | spawn AD fix |
| 閒置 | 無 worktree，無 open PR | 等指揮家指示 |

重建完畢後向指揮家報告現況，或直接繼續推進。

### 2. Session 結束前
在 `.ai/session/` 寫入交接筆記，供下一個 session 讀取：
- 本次完成了什麼（issue / PR 清單）
- 遇到的問題和解決方式
- 未完成的待辦
- 觀察到的指揮家偏好

重建完畢後向指揮家報告現況，或直接繼續推進。
