---
name: flow-session-startup
description: When AH starts a new session (including after /clear), read handoff notes, rebuild pipeline state (worktrees, open PRs, open issues, unpushed master commits), identify current situation (開發中 / 等 QC / 等 merge / 等修復 / 等依賴 / 閒置), and surface next-step proposals. Run at the beginning of every session before taking any action.
model: claude-opus-4-7
effort: xhigh
allowed-tools: Bash, Read
---

# AH Session Startup — Pipeline 狀態重建

## 目標

每次 session 開始（含 `/clear` 後），重建當前 pipeline 狀態，讀懂當下局勢，給指揮家清晰現況 + 下一步提議。

## 驗收

- 讀完並刪除 `.ai/session/` 交接筆記（若有）
- 掃完 worktree / open PR / open issue / unpushed master
- Unpushed master commits → **先 push** 再建新 worktree
- 每個 active worktree 的模組 CLAUDE.md「當前任務」/「待修項」已讀
- Open issue 的 `Depends-on:` / `Blocks:` 依賴圖已建
- 給出狀態判斷 + 下一步提議

## 流程

### 1. 讀上次 session 交接筆記
```bash
ls .ai/session/
```
有檔案 → 逐一讀 → **讀完刪**（保證新鮮，不累積過時 context）。

### 2. 重建 pipeline 狀態
```bash
git worktree list                        # 開發中 worktree
gh pr list                               # 待 QC / 待 merge 的 PR
gh issue list                            # 開放 issue
git log origin/master..master --oneline  # 未 push commit
```

**若 `git log origin/master..master` 非空 → 先 `git push` master 再建新 worktree**（避免 unpushed commits 混入 PR diff 造成假 QC FAIL，#304 教訓）。

### 3. 掃 active worktree
對每個 worktree 讀其模組 CLAUDE.md「當前任務」+「待修項」。

### 4. 建 issue 依賴圖
掃所有 open issue body 的 `Depends-on:` / `Blocks:` 行。優先推進**無依賴**者；被封鎖 issue 先處理其依賴。

### 5. 狀態判斷

| 狀態 | 條件 | 下一步 |
|------|------|--------|
| 開發中 | worktree 存在、無 PR | spawn `role-developer` |
| 等 QC | PR open、無 QC comment | spawn `role-pr-qc` |
| 等 merge | PR 有 `QC PASS` | spawn `role-pr-merge` |
| 等修復 | PR 有 `QC FAIL` + CLAUDE.md 有待修項 | spawn `role-developer` fix |
| 等依賴 | issue 有 `Depends-on:` 指向未合 issue | 先處理依賴 |
| 閒置 | 無 worktree、無 open PR | 等指揮家指示 |

## 約束

- 不讀 git log / diff 超過最近 5 條
- 不直接讀大模組 src 檔（需模組 context → 查 `.ai/module-cache/<module>.md` 或觸發 `role-explorer`）
- 不 spawn 任何 subagent（此 skill 只做盤點）

## Session 結束前

在 `.ai/session/current.md` 寫交接筆記供下個 session 讀：
- 本次完成什麼（issue / PR 清單）
- 遇到問題和解決方式
- 未完成待辦
- 觀察到指揮家偏好

## 異常處理

| 條件 | 動作 |
|------|------|
| Unpushed master commits | 先 push 再建新 worktree |
| Open PR 狀態不明（無 comment / review） | spawn `role-pr-qc` |
| Worktree 對應 branch 已刪 | 回報孤兒 worktree，請指揮家確認是否清理 |
| 交接筆記缺失（首次 session 除外） | 回報並直接掃 git state |
