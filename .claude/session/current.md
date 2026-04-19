# Session 狀態（2026-04-19 深夜 — skill 大重構 + .ai 搬遷 + dockview themeAbyss 永久根治）

## 本 session 完成

### 流程基礎建設
- `5263cb6` 套用「結構排除」原則精修 10 skill 約束段（D 類 -19 行）
- `483c3ff` `.ai/` → `.claude/` 整體搬遷（14 檔 git rename + 26 檔 path sed + .gitignore 清理）
- `101c9ed` 安裝 AH 自改 CLAUDE.md 協定（T1-T4 框架，全文 `.claude/self-edit-protocol.md`，CLAUDE.md 加 3 行 pointer）
- `fab8c70` role-design-visual 改對話回報（不再寫 `.claude/audits/`，補設計取捨段）
- `8292586` CLAUDE.md 加「結構成本意識」段（指揮家 mid-session 直加）+ panel-bg mockup 入庫

### Panel 色系統一（指揮家視覺驗收 PASS）
- DV 跨 panel 一致性審計（scene-tree / project / viewport overlay 三方比對）
- MP 出 A/B/C 3 方案 mockup（`.claude/previews/panel-bg-unification.html`），指揮家挑 **A.1 全 solid**
- `#404 / #407 [viewport]` + `#405 / #406 [app]` 並行 2 PR，merge — 殺 4 處 `rgba(20,20,20,0.X)`
- `#408 / #409 [app]` dockview 自訂 erythos theme — 永久根因解決，dockview chrome 全對映 token

## 遇到的問題

1. **Agent tool 繼承 1M context** — 預設 spawn 觸發 `extra-usage required` 錯誤。必須明示 `model: sonnet` 才能跑 sonnet subagent。指揮家認為這是 bug。
2. **AH 誤引「歷史 meta-exception」** — 提案 P1/P2 時把 `#400`、`#1063060` 當作「歷史單行直改 master 例外」，實際上 `#400` 走 PR、`#1063060` 是 chore（CLAUDE.md 還原），不算 src 例外。指揮家糾正 → 升級 `feedback_strict_workflow.md` memory：AH 不得提議 src 變更走 meta-exception。
3. **DV skill 重做時遺漏 conversation-report 改動** — 第一次改完被 revert，第二次只重做 D 類負面句精修，沒帶回 conversation-report。事後在 #panel-bg 議題中重派 DV 才發現，補修 `fab8c70`。
4. **dockview default theme = abyss** — 用戶觀察到 `#000c17` 冷藍，挖到根因在 `node_modules/dockview-core/dist/cjs/dockview/dockviewComponent.js`：沒傳 theme option 時 default 是 themeAbyss（VS Code Abyss 風）。
5. **task 跨無模組歸屬檔案** — `src/styles/theme.css` 無模組擁有，#408 task spec 顯式授權 AD 修改，繞過 app 範圍限制。

## 未完成待辦

**無**。Pipeline 乾淨（0 open issue / 0 open PR / 0 worktree / master ahead origin 0）。

## 下個 session 第一步

執行 `session-startup` → `flow-pipeline-state-detect`。依狀態：
- 指揮家丟新題 → 正常 pipeline
- 無新題 → 問指揮家是否要重檢視 leaf panel（前 session 遺留待議）或新方向

## 觀察到的偏好（非顯而易見）

- **結構成本意識**（CLAUDE.md L91-107，指揮家 mid-session 親加）— 預設口語回應，少用編號 / 表格 / 三段式。一輪一決策點。送出前自檢「這結構是指揮家需要還是我想展示思考完整」。
- **改一律禁止跳過流程**（再次申明）— src 程式碼變更必走完整流程，AH 不得提議 meta-exception 即便 1 行。CLAUDE.md / `.claude/` / chore 才是合法直改。
- **指揮家會 mid-session 直改 CLAUDE.md** — 「結構成本意識」段就是這樣加進來的，AH 不需主動拉回。

## 重要 commit / 檔案

- `8292586` 是本 session 最後一個 commit。Master ahead origin 0（已 push）。
- 新增 `.claude/self-edit-protocol.md`、`.claude/previews/panel-bg-unification.html`
- CLAUDE.md 新增段：「結構成本意識」（L91-107）、「AH 自改 CLAUDE.md」（L139-141）
- `.gitignore` 清掉 `.claude/audits/` 死規則
