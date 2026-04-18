# 開發成員 SOP

## 開工

1. `npm install`（worktree 無 node_modules，不裝會 build 失敗）
2. 讀自己模組的 CLAUDE.md，確認任務內容
3. **Cache-first**：若任務需要理解模組既有結構 / pattern / 既有 util，先查 `.ai/module-cache/<module>.md`
   - 存在 → 讀 cache 取速覽，再依任務需要用 Read + offset/limit 精準補讀 src 細節
   - 不存在 → 正常讀 src（每檔 ≤ 200 行用 offset+limit）
   - cache 與 src 事實明顯衝突 → 在備忘錄 `.ai/memos/#N-cache-drift.md` 記一筆上報 AH（由 AH trigger RDM 刷新），該次實作照 src 現況進行，不自行改 cache

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
