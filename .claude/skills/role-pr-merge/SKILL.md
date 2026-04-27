---
name: role-pr-merge
description: When AH needs to finalize a PR that has "QC PASS" comment, merge it and execute the full post-merge cleanup sequence (merge → close issue → remove worktree → pull main → delete branch → clean module CLAUDE.md → verify build → commit leftover). Use after AH confirms QC PASS on a pull request.
model: claude-sonnet-4-6
effort: low
allowed-tools: Bash, Read, Edit
---

# PR Merge 收尾

## 目標

QC PASS 的 PR 走完整 merge 收尾，讓 main 回到乾淨狀態。

## 驗收

- PR merge 成功（無衝突）
- 關聯 issue 已關閉
- Worktree 已移除、branch 已刪（本地 + 遠端）
- main 已同步
- 模組 CLAUDE.md 任務區塊清空（保留 placeholder 註解）
- `npm run build` 通過，或明確回報錯誤
- Leftover 檔案按分類處理完畢（可 commit 的 commit，不可的跳過 + 回報）

## 輸入

AH 提供：
- PR 編號
- Issue 編號（可能多個）
- Worktree 絕對路徑
- 分支名稱

## 流程

1. `gh pr merge <PR> --merge`
2. `gh issue close <N>`（多 issue 就多次）
3. `git worktree remove <worktree-path> --force`
4. `git checkout -- tsconfig.app.tsbuildinfo 2>/dev/null && git pull`
5. `git branch -d <branch>` + `git push origin --delete <branch>`
6. **驗證**模組 CLAUDE.md 已由 AD 整檔還原至 main 原貌（`git diff main~1 -- <path>` 應無差異）。若「當前任務/待修項/上報區」殘留非 placeholder 內容，清空保留 placeholder 註解。**若發現「範圍限制」或「慣例」被異動，停下回報 AH**（AT/AD 流程異常，PM 無權判斷正確原貌）
7. `npm run build`
8. `git status -s` 看 leftover，按下表處理

| 檔案類型 | 處理 |
|---------|------|
| `src/<module>/CLAUDE.md`（step 6 清理後） | 可 commit |
| `package.json` / `package-lock.json`（hook bump） | 可 commit |
| `tsconfig.app.tsbuildinfo` | 可 commit |
| `.claude/previews/*.html` | 跳過 + 回報 AH |
| 根 `CLAUDE.md` / `.claude/module-cache/*` / `.claude/specs/*` | 跳過 |
| 其他 unstaged src/ | 跳過 + 回報異常（不應出現） |

可 commit：
```bash
git add <具體檔案>   # 不用 -A
git commit -m "chore: merge 收尾 #<PR>"
git push
```

Leftover 全數跳過或無改動：不 commit，回報「step 9 跳過 + 原因」。

## 約束

- **不解 merge 衝突**：遇 CONFLICTING / DIRTY 停下回報 AH（`rebase + push --force` 是破壞性，此 skill 無此授權 — #380 教訓）
- **不刪** `.claude/previews/*.html`（design source of truth；mockup 非一次性，跨 issue 服役 — 2026-04-18 起一律保留）
- **不碰** `.claude/module-cache/`（DB 由 EX 維護）
- **不碰** 根 `CLAUDE.md`（AH 可能在改）
- **不用** `git add -A`（逐個指定避免誤 commit）

## 異常處理

| 條件 | 動作 |
|------|------|
| `gh pr merge` 失敗（衝突） | 停下回報 AH |
| `npm run build` 失敗 | 不修復，原樣回報錯誤輸出 |
| Leftover 全部跳過類 | 不 commit，回報跳過項清單 |
| unstaged src/ 出現 | 回報異常（這不該發生） |

## 輸出

簡短回報：
- merge 結果
- build 結果
- leftover 處理（commit SHA 或跳過原因）
- 任何異常
