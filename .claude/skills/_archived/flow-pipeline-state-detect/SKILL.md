---
name: flow-pipeline-state-detect
description: When AH needs to orient on pipeline state, cross-reference git worktrees, open PRs with QC comments, open issues with dependencies, main divergence, module CLAUDE.md sections, and session handoff, then emit a three-layered snapshot (overview / issue table / environment anomalies). Read-only: produces snapshot only, does not mutate state, does not spawn subagents. Use at session startup or when AH needs orientation before routing.
model: claude-sonnet-4-6
effort: low
allowed-tools: Bash, Read, Grep, Glob
---

# Pipeline State Detect — 流程狀態偵測

## 目標

跨多源偵測 pipeline 當前狀態，輸出三層快照（L1 總覽 / L2 issue 表 / L3 環境異常）。**唯讀**：提供判斷依據，不做決策、不推進流程。

類比 `git status` 之於 git——告訴你現況，不替你拍板下一步。

## 定位

- **觸發時機**：AH session 起手、跨 session 回歸、派遣前需定位
- **唯讀**：不 commit / push / merge
- **不決策**：L2「Next step」欄僅為建議，AH 自行拍板

## 狀態字典

### A 組：Pipeline lifecycle（互斥，每 open issue/PR 歸屬其一）

| 狀態 | 判定 |
|------|------|
| `open-issue` | issue open、無 worktree、無 PR、無未解 Depends-on、模組 CLAUDE.md 當前任務空 |
| `blocked-by-dependency` | issue body 含 `Depends-on: #N`，且 #N 仍 open |
| `task-staged` | 模組 CLAUDE.md「當前任務」有內容、但無對應 worktree（可能為 AT→AD 交棒瞬時態，回報但不驚擾） |
| `implementing` | worktree 存在、branch ahead of main、無 open PR |
| `ready-for-qc` | open PR 存在、無 `QC PASS` 也無 `QC FAIL` 痕跡 |
| `awaiting-qc-fix` | open PR 有 `QC FAIL`、FAIL 之後無新 commit |
| `fixing` | open PR 有 `QC FAIL`、FAIL 之後有新 commit |
| `ready-to-merge` | open PR 最新 QC 結論為 `QC PASS`、且 PASS 之後無新 commit |
| `qc-stale` | open PR 有 `QC PASS`、但 PASS 之後有新 commit（PASS 已失效） |
| `merge-conflict` | open PR `mergeable = CONFLICTING` |

### B 組：環境訊號（可並存、可疊加修飾 A 組）

| 狀態 | 判定 |
|------|------|
| `flag-draft` | open PR `isDraft = true`（per-PR 修飾，以 `[draft]` 附加在 L2 Flags 欄） |
| `flag-blocking-others` | 此 open issue 被其他 open issue 以 `Depends-on` 指向（per-issue 修飾） |
| `main-ahead` | local main 超前 origin/main |
| `main-behind` | local main 落後 origin/main |
| `main-diverged` | main 雙向 diverge |
| `handoff-pending` | `.claude/session/current.md` 存在 |
| `handoff-stale` | handoff mtime > 24h |
| `orphaned-worktree` | worktree 存在、但無對應 branch 或無對應 open PR 且未 merge |
| `orphaned-branch` | local branch 存在、但無 worktree 也無 PR |
| `task-leftover` | 模組 CLAUDE.md「當前任務/待修項」有內容、但對應 issue 已 close / PR 已 merge |
| `ah-inbox` | 任一模組 CLAUDE.md「上報區」有內容 |

### 總覽級狀態（L1 專用）

- `idle`：A 組全無 **AND** B 組全無 → 乾淨態
- `environment-only`：A 組全無 + B 組有任一 → 僅環境訊號

## 偵測來源與指令

### git 層

```bash
git worktree list --porcelain
git branch --list
git log origin/main..main --oneline          # main 未 push
git log main..origin/main --oneline          # main 未 pull
```

### gh 層（限 JSON 欄位節流）

```bash
gh pr list --json number,title,headRefName,isDraft,mergeable,mergeStateStatus
gh pr view <N> --json comments,reviews           # QC PASS / QC FAIL 雙源掃
gh pr view <N> --json commits                    # 末次 commit 時戳，判 fixing / awaiting-qc-fix / qc-stale
gh issue list --json number,title,body,labels    # body 在本地正則掃 Depends-on / Blocks
```

**QC 雙源掃規則**：`comments[].body` 與 `reviews[].body` 皆以 `test("QC PASS|QC FAIL")` 過濾，取**最新一筆**為當前結論（`#feedback_qc_review_format`）。

### 模組 CLAUDE.md 層（Grep，不整檔讀）

```bash
grep -A 3 -H "## 當前任務\|## 待修項\|## 上報區" src/*/CLAUDE.md src/panels/*/CLAUDE.md
```

**判空規則**：區塊底下 3 行若全為 `<!--` HTML 註解、或全空 → 視為空。

### Session 層

```bash
ls -la --time-style=full-iso .claude/session/current.md 2>/dev/null
```

## 輸出格式

### L1 — 一句話總覽

```
Pipeline: N active (<A 組聚合>) | Env: <B 組聚合>
```

特例：
- `Pipeline: idle` — A+B 全無
- `Pipeline: idle | Env: <B 組>` — `environment-only`
- `Pipeline: ... | Env: none` 亦可簡寫為 `Pipeline: ...`

### L2 — Issue 表格（每 open issue/PR 一行）

```
| Issue | State           | Flags   | PR    | Worktree                | Next step                                  |
|-------|-----------------|---------|-------|-------------------------|--------------------------------------------|
| #401  | implementing    |         | —     | erythos-401-foo-fix     | await AD commits / dispatch role-developer |
| #402  | ready-to-merge  |         | #405  | erythos-402-bar-feat    | spawn role-pr-merge                        |
| #403  | qc-stale        | [draft] | #406  | erythos-403-baz-fix     | re-QC (PASS 2h older than last commit)     |
```

Flags 欄累積 per-issue B 組修飾（`[draft]` / `[blocking]` 等）。Next step 為**建議**，不是指令。

### L3 — 環境異常（B 組非 per-issue 部分）

```
- main-ahead      : 1 commit unpushed (d564b20)
- ah-inbox          : core/CLAUDE.md 上報區有內容
- handoff-pending   : .claude/session/current.md exists (mtime: 2h ago)
```

每條附可行 diagnostic（SHA / 模組名 / mtime），讓 AH 讀即可動手、不必再查。

## Context 預算

- **First pass**：逐 PR 跑 `gh pr view`。Open PR ≤ 4 時輕量可接受
- **升級選項**：Open PR ≥ 5 時改單次 `gh pr list --json number,title,headRefName,isDraft,mergeable,mergeStateStatus,comments,reviews,commits` 一次撈完所有欄位
- 模組 CLAUDE.md 用 Grep `-A 3` 抓區塊，**不整檔讀**
- git log 只看 `origin/main..main` 與反向（不跑 `log --all` / `log --graph`）
- Issue body 用 `gh issue list --json body` 一次取回，正則在本地掃（不逐 issue `gh issue view`）
- 總 token 目標 ≤ 8k；若超過，L3 警告 `context-pressure` 並截斷最不關鍵項

## 約束

- 不 commit / push / merge（Bash 在手，需明確排除）
- 不下指令（L2「Next step」欄為建議，非執行指示）
- 不擴大偵測（模組 CLAUDE.md 只掃固定三區塊，不讀其他內容）
- 不推斷未直接偵測到的事實（例：不從 commit message 猜 issue 意圖）
- 不讀 `.claude/module-cache/` DB（那是 EX 領域，此 skill 不涉模組內部語義）

## 異常處理

| 條件 | 動作 |
|------|------|
| `gh` 未安裝 / 未登入 | 跳過 gh 層，L1 標註「gh unavailable」，僅輸出 git + 模組 CLAUDE.md + session 層 |
| `git worktree list` 僅剩主 worktree | 正常（無 active 開發） |
| `.claude/session/current.md` 不存在 | 正常，不報 `handoff-pending` |
| 模組 CLAUDE.md 結構異常（缺三區塊標題） | L3 附一條 `module-md-malformed: <path>` |
| `gh pr view <N>` 失敗 | 該 PR 在 L2 State 欄標「?」，L3 附錯誤訊息，其他 PR 照常 |
| Open PR ≥ 10 | 強制升級一次撈；若仍超 8k token 則 L3 警告 `context-pressure` |
| issue body 無法解析 Depends-on（格式怪） | 視為無依賴；L3 附一條 `dep-unparsed: #<N>` |

## 設計取捨

- **A/B 組分離**：A 組互斥避免複合狀態爆炸；B 組可疊加處理 per-issue 修飾與環境獨立訊號
- **`qc-stale` 獨立**：PR 有 PASS 但後續 commit 已讓 PASS 失效。AH 不該直接 merge，需重審
- **`fixing` vs `awaiting-qc-fix`**：多一次 `gh pr view --json commits` 的成本，換 AH「催或不催 AD」的判斷力
- **雙源掃 QC**：`comments` 與 `reviews` 皆可能承載 `QC PASS` / `QC FAIL`（#feedback_qc_review_format）
- **`blocking-others` 為 flag 非 lifecycle**：一個 `implementing` 的 issue 也可能 blocking 他人，非互斥
- **`task-staged` 瞬時態**：AT→AD 交棒瞬間可能偵測到，skill 如實回報，AH 自行判斷是否為正常過渡，不引入時間門檻（避免時間邏輯複雜化）
