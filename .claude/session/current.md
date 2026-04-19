# Session 狀態（2026-04-19 晚 — 多 PR + 流程漏洞修補 + Backlog 清空）

## 本 session 完成

### Pipeline（5 個 PR merge + 多個 chore commit）

- **`.ai/roles/` 雙源清理** commit `291072b`（13 檔，-940）
- **#355 viewport drop helper**（PR #394）merge `e45d802`
- **#330 nested mesh double render**（PR #395）merge `79a76d0` — EX 探勘 + AT 糾正實作位置在 `ResourceCache.ts` 非 `SceneSync.ts`
- **#396 hover phase 2**（PR #397）merge — viewport-tab + settings + project-hub，per-module 2 commit
- **#398 viewport bg B3 方案**（PR #399）**失敗關閉** — post-processing alpha 被 FXAA 破壞
- **#400 viewport bg fast-path A**（PR #401）merge — `0x3f3f3f` → `0x0a0a0a` 單行（指揮家視覺驗收 PASS）
- **#402 leaf preview bg fast-path**（PR #403）**關閉** — leaf panel 全黑有其他渲染問題，暫緩

### Chore / 流程

- `edb2a6a` CLAUDE.md 加「回應節奏」段（指揮家手寫，AH commit 純文件變更）
- `1063060` 還原 `src/panels/viewport/CLAUDE.md` 被 #355 AT 覆寫的範圍限制
- `a85cf66` 3 skill 增補整檔還原原則（role-tasker/role-developer/role-pr-merge）
- MEMORY `feedback_claude_md_restore.md` 整合新教訓升級
- 清理殘留 worktree 目錄（erythos-359 / 363 / 400-viewport-bg）

### Backlog 清空（指揮家一次性 purge）

- UIUX 推理輔助角色構想 → MEMORY 移除
- Project Hub 3 項（texture→HDRI / models 拖曳 / 專案 auto-save）→ MEMORY 移除
- `--bg-hover` 對比度驗收 → 視為已解決
- Leaf panel 系統性問題 → 未建 memory，指揮家要重新檢視需求

## 遇到的問題（教訓）

1. **AT 兩次糾正上游**（#330 糾正 EX 實作位置 / #396 糾正 issue body 行號）— AT 讀 src 的價值不可跳過
2. **#355 AT 誤改「範圍限制」區塊 + AD 漏還原 + PM 沒驗證** — 污染 master 跨 2 PR 才顯形。**已在 3 skill 寫入整檔還原原則 + 驗證機制**
3. **B3 方案失敗**（PR #399）— 視覺 bug 靜態分析有上限，post-processing alpha 保留脆弱。advisor 正確指出「hand back 給指揮家 DevTools 診斷」。教訓：視覺不確定先試 fast-path A
4. **Windows `git worktree remove --force` 不實際刪目錄**（node_modules lock）— 需手動 `rm -rf` 跟上。PM skill 可考慮加收尾驗證

## 未完成待辦

**無明確待辦**。Pipeline 乾淨（0 open issue / 0 open PR / 0 worktree），backlog 已 purge。

可選待指揮家重新定義：
- Leaf panel 系統性問題（剛浮現，指揮家要先重新檢視需求）

## 下個 session 第一步

執行 `session-startup` 讀本檔 → `flow-pipeline-state-detect`。依狀態：
- 若指揮家丟新題 → 正常 pipeline
- 若無新題且 backlog 空 → 問指揮家是否要重新檢視 leaf panel / 其他新方向

master `a85cf66`，origin 同步。

## 觀察到的偏好（非顯而易見）

- **fast-path 直改 master 偏好強**：指揮家樂於授權純文件 / 單行常數改動跳 PR 流程。建「回應節奏」段、`1063060` CLAUDE.md 污染修復、#400 單行都是走 master
- **B 方案太複雜時毫不猶豫回 A**：視覺 bug 寧願試錯再調，不堆架構改動
- **「重新檢視需求」= 清 backlog 從零開始**：指揮家不想背負舊 idea，喜歡乾淨狀態
- **視覺驗收永遠由指揮家目測**：agent 幫不上忙，AH 越早 hand back 越省時間
- **session 可長**：本 session 單輪處理 3 個交接筆記待辦 + 2 個 tech debt 相關 + 4 個 chore，agent spawn 數 ~15 仍在指揮家容忍範圍

## 重要檔案 / 狀態

- `CLAUDE.md` 新增「回應節奏」段 + 型別檢查行括號略修
- `src/panels/viewport/CLAUDE.md` 已還原為標準模組結構
- `src/viewport/ViewportRenderer.ts:27` 背景 `0x0a0a0a`（#400）
- `src/panels/leaf/LeafPanel.tsx:33` 仍是 `0x3f3f3f`（leaf 全黑有其他問題，未修）
- 3 SKILL.md（role-tasker/role-developer/role-pr-merge）含整檔還原原則
- `.ai/roles/` 已刪（dir 不存在）
