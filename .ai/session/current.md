# Session 狀態（2026-04-17 第三輪 / 接續上半 + 下半場）

## 完成事項：5 PRs merged

| PR | Issue | 摘要 | merge commit |
|----|-------|------|--------------|
| #360 | #359 | audit 基建（playwright seed pattern + scene-tree.mjs） | b9e0003 |
| #361 | #349 | 補 --badge-geometry token | cd638aa |
| #364 | #362 | environment audit seed | a56f7ca |
| #367 | #365 | viewport + leaf 背景色改 #3f3f3f | 92dee69 |
| #366 | #363 | properties audit seed | 21506f6 |

## 新模式驗證

1. **跨機協作**（#359）：純檔案搬 + 本機 AD 接力收尾
   - 教訓：背景 agent 跨 session 不延續，session 結束前需檢查未收尾任務（spawned 但 timeout）
   - 接力 prompt 需明寫已完成 vs 待補步驟，避免重做

2. **Fast path 變體**（#349, #365）：跨模組或極小變更，純 prompt 任務、無模組 CLAUDE.md
   - 省 AT 整輪 + CLAUDE.md 還原步驟
   - 適用：純 1 行 CSS / hex 變更，跨多模組但無設計分歧

3. **Audit script pattern 證實可複製**：environment（三輪曲折）+ properties（一輪 + timeout 接力）

## 主要教訓（已寫入 knowledge.md）

- **Dockview DOM 沒 ARIA role / data-view-id**：必用 `.dv-default-tab-content` + `.dv-content-container` 等 class（#362 三輪才解，每輪 AD 都自報停手 + 給實測修法）
- **Scene Tree `getByText('Scene', { exact: true })` 是碰巧能用**：因 panel 內文連著 row 文字，exact 過濾掉。不適用其他 panel
- **多態 panel 用全頁截圖**規避 panel-locator 不穩（properties 案例）

## Process 觀察

- **Stream timeout**（#363 AD）：實作做完但收尾 stream 斷。檢查 worktree 狀態（git status + ls 產物）即可判斷實際進度。接力派 AD 補 commit/push/PR
- **PM 解機械性衝突**（#366）：兩 PR 改同檔同位置（package.json scripts 區塊），PM 報告衝突 → AH 評估「無 drift」後授權 PM 解 → PM 跑 `git merge origin/master` + 解衝突 + push + `gh pr merge`。memory `feedback_conflict_drift.md` 規則的例外
- **`gh pr merge --delete-branch` 對 worktree 引用的分支會 fail**（本地分支刪不掉）：PM 自己 fallback 處理（手動 `git branch -d`）。下次可在 PM SOP 註明「先 worktree remove 再 pr merge」
- **dev server port 3000**：兩個 AD 不能並行跑 audit。要 sequence 派 AD（一個跑完 kill server 後再派下一個）

## 下一個 session 優先序

### 1. 原計畫第 2 步：剩 4 panel audit（已完成 scene-tree / environment / properties）
- `assets`：filter bar + grid（grid 互動可能複雜）
- `viewport-controls`：toolbar + shading mode buttons
- `hub`：Hub 模式 vs Editor 模式切換（特殊狀態管理）
- `leaves`：未知，需 AT 探勘

可平行（4 個 issue / worktree / AT / AD），但**注意 dev server port**：AD spawn 要 sequence。
**spawn AT 時提示**「Dockview selector 用 `.dv-*` class」（已記 knowledge.md，未來 AT 應該會自查 knowledge.md）。

### 2. 全 6 panel audit pattern 完成後：spawn DV 寫美感問題
目前 `.ai/audits/` 只有 scene-tree.md（DV 報告 + 截圖）。environment / properties 截圖跑出但未派 DV。
下個 session 啟動 audit batch 後可批量 spawn DV。

### 3. 第 2 步 + DV 完成後：第 3 步批次修繕計畫
讀 6 panel `.ai/audits/<panel>.md` 整理跨 panel 共通問題，分類修繕。可能需要 `.ai/roles/design-engineer.md`（DE）角色處理工程健康檢查。

### 4. 原本 3 個 open issue 還沒處理
- #330 [core] 巢狀 Mesh 重複渲染（等藝術家資產觸發）
- #343 [styles] theme.css polish（可併入 UI 修繕大計畫）
- #355 [viewport] refactor: computeDropPosition（技術債，獨立處理）

## 觀察到的指揮家偏好

- **「同步」一字代表「兩處保持對齊」**（#365 viewport + leaf 改色案例）
- 偏好平行（一次 spawn 多個 task）但接受 AH 對 dev server port 衝突的序列化判斷
- **接受 PM 解機械性衝突**（無 drift 場合）— 「程式碼衝突開 issue 防 drift」規則的例外是「純機械合併」
- 結束 session 比拼進度，今日進度足夠就停

## Pipeline 終點

- master clean @ 21506f6（含本筆記 commit 後會更新）
- 0 active worktree
- 3 open issues：#330 #343 #355
- knowledge.md 加了 Dockview selector pattern 章節
- `.ai/audits/` 內 environment / properties 截圖已有，scene-tree.md DV 報告已寫（上 session）

## 懸念

- environment.mjs 跟 properties.mjs 的 selector pattern 不同（panel locator vs 全頁），未來 4 panel 跑出來後可能要統一格式（或保留各自最適）
- audit 截圖未版控？看了 .ai/audits/ 在 git 中，`.ai/audits/<panel>/*.png` 應該被 commit（scripts/CLAUDE.md 慣例「截圖輸出目錄統一放 .ai/audits/，會被 commit 是預期」）
