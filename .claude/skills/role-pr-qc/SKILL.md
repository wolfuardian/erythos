---
name: role-pr-qc
description: When AH needs to review a PR for scope adherence, contract consistency, conventions, build pass, and cross-branch compatibility, verify the changes and return `QC PASS` or `QC FAIL` in a PR comment. Use after AD opens a PR.
model: claude-sonnet-4-6
effort: high
allowed-tools: Bash, Read, Grep
---

# PR 品質審查

## 目標

審 AD 的 PR：確認改動符合 scope / 契約 / 慣例，能 build、未破壞跨分支相容。在 PR comment 留 `QC PASS` 或 `QC FAIL` 結論。

## 驗收

- **Scope**：只改允許的檔案（對照根 CLAUDE.md 模組邊界）
- **架構契約**：Command 模式、事件順序（`objectAdded → sceneGraphChanged`）、Command undo 完整還原
- **慣例**：`editor.execute(cmd)`、SolidJS 生命週期（`onMount` / `onCleanup`）、import 路徑
- `npm run build` 通過
- **跨分支相容**：import 路徑 / 型別匹配
- PR 上留下 `QC PASS` 或 `QC FAIL` 明確標記

## 輸入

AH 提供：
- PR 編號
- 可選：特定審查重點（如「只做 build 驗證」）

## 流程

### 0. 機器閘門（fail fast）

LLM 進場前先跑機器能判定的：

```bash
cd <worktree-path> && npm run build && npm run typecheck && npm run lint
```

任一失敗 → 直接 `QC FAIL`，**不進後續 diff 審查**。輸出段寫明哪一項失敗與首 10 行錯誤即可。這一步擋掉一半以上的無效 review。

### 1. Issue 盤點
```bash
gh issue list --state open
```

對 PR 關聯 issue，用 `git log --all --grep="refs #N"` 追蹤對應 commit。缺 `refs #N` 本身即為問題。

### 2. Diff 審查
```bash
gh pr diff <PR>
```

Diff > 300 行先看 stat（`| head -50`），再逐檔重點讀改動區段。不一次讀巨型 diff。

需模組 context 時**先查** `.claude/module-cache/<module>.md`（EX 維護的 DB，預設可信）。DB 不存在或與 src 衝突 → 在 QC 回報標 **DB 過時** 上報 AH，按 src 現況審。

逐檔檢查：
- 只改允許範圍（對照根 CLAUDE.md 模組邊界）
- 無越權修改其他模組

### 3. 契約一致性

機器抓得到的先跑結構化規則：

```bash
sg scan -r .claude/skills/role-pr-qc/rules/
```

命中即 FAIL，回報中附規則 id 與命中位置。LLM 只處理規則抓不到的語意層：

- 函式簽名語意（改名可由規則抓；行為改變需 LLM 判斷）
- 事件順序：`objectAdded → sceneGraphChanged`（可寫規則）
- Command undo 完整還原（含 selection 清除）

`rules/` 不存在 → 第一次 QC 先 LLM 手審，把發現的 pattern 沉澱成 `rules/*.yml`，之後每次 QC 都免重推。新模式發現 → 新增規則。

### 4. 慣例
- 用 `editor.execute(cmd)`，非直接 `addObject`
- SolidJS：`onMount` 綁定、`onCleanup` 清除
- import 路徑正確

### 5. Build
```bash
cd <worktree-path> && npm run build
```

Worktree 已在正確分支，不需 `git checkout`。

### 6. 跨分支相容

用跑的不用推的：

```bash
# 試合併目標分支，不 commit
git merge --no-commit --no-ff origin/<target-branch> || { git merge --abort; echo 'MERGE CONFLICT'; exit 1; }
# 合併狀態下驗證
npm run build && npm run typecheck
RC=$?
# 無論成敗都還原
git merge --abort
[ $RC -eq 0 ] || echo 'POST-MERGE BUILD/TYPECHECK FAILED'
```

衝突或 post-merge 失敗 → FAIL，附首錯 10 行。`--abort` 必跑，絕不留合併狀態在 worktree。

## 輸出

### QC PASS
```bash
gh pr review <PR> --comment --body "QC PASS — <一句結論>"
```

### QC FAIL
```bash
gh pr review <PR> --request-changes --body "QC FAIL — <問題列表 + 建議修法>"
```

嚴重到值得獨立追蹤 → 開 issue：
```bash
gh issue create --label bug --title "[分支簡稱] <問題>" --body "..."
```

### 複審
- `git log --all --grep="refs #N"` 確認修復 commit
- 驗證實際解決問題
- 留 `QC PASS` comment + `gh issue close #N`
- 新問題 → 開新 issue + request changes

## 約束

- 不 commit 到 feat/* 分支（Bash 在手，需明確排除）
- 不操作 main
- 跨分支 merge 測試後必須 `git merge --abort`，絕不保留合併狀態
- **不 `--approve`**（所有 agent 共用同一 GitHub 帳號，無法 self-approve；用 comment 的 `QC PASS` 替代）

## 異常處理

| 條件 | 動作 |
|------|------|
| Phase 0 機器閘門失敗 | 直接 FAIL，不進 diff 審查 |
| `sg scan` 規則命中 | 自動 FAIL，不 LLM 補判 |
| Build 失敗 | 列為 FAIL 問題，不嘗試修復 |
| Merge 衝突（Phase 6） | FAIL，附衝突檔案清單 |
| DB 與 src 衝突 | 標「DB 過時」上報 AH，按 src 現況審 |
| Diff > 300 行 | 先看 stat，重點區段逐檔讀 |
| Commit 無 `refs #N` | 本身視為問題，回報 |

## Insight 回報

意外發現 / 改進建議 → 寫在 PR review comment 的結論段；嚴重到值得獨立修 → 開 issue。不寫獨立備忘錄檔。
