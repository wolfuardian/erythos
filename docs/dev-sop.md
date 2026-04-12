# 開發成員 SOP

## 開工

1. `npm install`（worktree 無 node_modules，不裝會 build 失敗）
2. 讀自己模組的 CLAUDE.md，確認任務內容

## 開發

- commit 格式：`[模組] 簡述 (refs #N)`，用 `refs` 不用 `closes`（issue 由主腦關閉）
- commit body 寫一句 why（新增檔案或改架構時必須寫）
- build 通過再 commit（`npm run build`）
- 遇到非顯而易見的發現 → 寫備忘錄 `.ai/memos/#N-簡述.md`，開 PR 前 commit

## 收工

1. 還原模組 CLAUDE.md：`git checkout -- <path>/CLAUDE.md`（避免 merge 衝突）
2. push + 開 PR：`gh pr create --title "[模組] 簡述 (refs #N)" --body "改動摘要"`

## 禁止

- 不改自己模組以外的檔案（`.ai/memos/` 除外）
- 不操作 main/master、不 merge、不關 issue
