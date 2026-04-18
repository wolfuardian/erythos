# Session 狀態（2026-04-18 — Audit pipeline 完成 + RDM/PM 流程穩態化）

## 完成事項：5 PR merged + Phase 3a 驗證 + Simplify

### Audit pipeline（全 5 PR）

| PR | Issue | Panel | merge | RDM cache update |
|----|-------|-------|-------|------------------|
| #379 | #368 | viewport | `ccfb6f3` | scripts.md 首版 create（PM #379 timeout，AH 手動補） |
| #380 | #369 | leaf | `a62e61f` | 手動補（PM step 9 已 override 跳過） |
| #381 | #370 | project | `daad57d` | scripts.md 43→47（PM #381 重跑驗證 v2b） |
| #382 | #371 | settings | `8c1cbb0` | scripts.md 47→49 |
| #383 | #372 | context | `8c1cbb0` 後續 | scripts.md 49→52 |

### Phase 3a：RDM 自動 trigger（PM merge 後刷新模組 cache）

- v1（commit `f6cfeca`）：PM step 9 spawn RDM（同步等）→ **撞 stream timeout**（PM #379 教訓：3 層 nested 太深）
- v2b（commit `beb1db6`）：rdm SOP 鬆綁 — 小模組（≤8 檔且 <800 行）RDM 自己讀，不 spawn RD 大軍
- Simplify（commit `63d5473`）：PM step 9 行為跟實務對齊 — PM 對小模組直接做 cache update，大模組才 spawn RDM。一層 spawn 都不開

### 流程文件 simplify（commit `63d5473`）

- pr-merge.md step 1：加 conflict escalate 規範 + 禁止 force-push（#380 教訓）
- pr-merge.md step 9：重寫為「PM 自做 / spawn RDM」二分（小模組 / 大模組）
- tasker.md：「當前任務」內容**不得**用 `## ` 開頭 subheader（與 CLAUDE.md section 同層 → AD 還原時容易遺漏，#381 教訓）

### Sub-AD memory 升級（local，不進 git）

- 含本 session 實證對照表（5 PR ~535k token / 70-90 min vs 1 sub-AD PR ~140-180k / 25-35 min，省 60-67%）
- 觸發 4 條 checklist 精煉
- 實裝 lite path：下次甜蜜點 dispatch inline 「sub-AD 協調」指引（不寫獨立 SOP），跑 1-2 次後再萃取

## 主要模式與教訓

### Process 設計教訓

- **v1 → v2b 反覆是「下午建傍晚拆」**：advisor 點名。流程改動上線前要先過 1-2 個 failure mode（nested timeout、各層 spawn baseline 累積）
- **PM 自做 RDM drift 變成 feature**：PM #381/#382/#383 三次自跑 step 9 沒 spawn RDM → 結果穩定 → simplify 時直接寫進 SOP「小模組 PM 自做」
- **Force-push 防呆生效**：PM #380 自做 force-push 被 advisor 點 → 後續 dispatch inline 防呆 → PM #381/#382/#383 都正確 escalate AH 解 conflict

### 拆分粒度教訓

- **Audit pipeline 5 PR 是「過細」拆分**：同模組同 pattern 無 cross-PR 邏輯依賴 → N² 衝突（4 次 AH 親自 cd worktree 解 package.json + CLAUDE.md trivial conflict）
- **下次同類批次任務直上 sub-AD**：properties 階段 4「Variant A 擴散到 environment / scene-tree / leaf 等」是甜蜜點

### Dispatch 優化教訓

- **QC dispatch 優化版穩定省 22%**：禁止「對照既有 pattern」+ inline 三條檢查 + 不讀 pr-qc.md → 21-23k / 2-4 tool uses / 14-30 秒（vs 舊 28k / 11 uses / 58 秒）
- **AD token 暴漲與 dispatch 無關**：AD #370 OPFS 70k 是任務本身複雜（AT spec 有錯，AD 自己 trial-error）。dispatch 優化救不了
- **AT 質量影響倍增**：AT 寫不準 → AD 多 ~40k token trial-error。下次 AT 對複雜 web API（OPFS / Service Worker / IndexedDB）需先 prototype 確認再寫任務

## Process 觀察

- **Stream 健康**：除 PM #379 v1（timeout）+ AD #370 OPFS（14.5 min 但完成），全部 agent 順利
- **AH 親自做 git ops**：cleanup commit / merge conflict / .gitignore 修改全 AH 親手做（避免 spawn AD 5-10k overhead，AH 直接做 ~30 秒）
- **Memory 飽和度**：本 session 引用了多條歷史 memory（advisor 機制 / sub-AD / context 寶貴普適 / RDM 架構 / 衝突 drift / force-push 警示），證明 memory 系統運作良好

## 指揮家偏好觀察（新增 / 更新）

- **反思性提問代表已收到資訊但需要重新評估**：「工作量挺大的，確認工作量與工作目標是否呈現正比」 = 暫停推進，認真回答 retrospective 問題
- **A + C 採納**：明確的 multi-option 提案 → 指揮家直接選編號（不展開），AH 立刻動
- **Simplify 偏好**：流程文件改動採「跟實務對齊」精神（PM 自做 RDM 是 drift 但變 feature），不是「強制服從原 SOP」
- **「指派後你自己再重新審視」**：希望 AH 兼具執行 + retrospective 雙重視角，不只埋頭做

## Pipeline 終點

- **Master** @ `63d5473`（含全部 5 audit script + Phase 3a v1+v2b+simplify + scripts.md cache 52 行）
- **0 active worktree**
- **0 open PR**
- **Open issues**：#330 / #355（與本 session 無關的舊 issue，待後續處理）

## 懸念

- **`.claude/settings.local.json`** 一直有 M 狀態：local 設定，無需處理（已成 chronic state）
- **AT 任務描述對複雜 web API 不準**：#370 OPFS stub 是教訓，下次類似要 AH 主動提示「需 prototype 確認」
- **CLAUDE.md placeholder 結構過於複雜**：tasker.md 已加禁止 `## ` 規範，但 worktree base 過舊的場景仍可能出現舊版 placeholder（`<!-- 由主腦填寫 -->` vs `<!-- 待填入 -->` 兩版混雜）

## 下一個 session 優先序

### ★ 最優先：Audit pipeline 後半段 — DV 視覺審計

5 個 audit script 已上 master，產出 5 個 panel 截圖目錄（`.ai/audits/<panel>/`，gitignored）。下次 session 起手：

1. AH 親跑 5 個 npm run audit:* 重新生成截圖（worktree 已被 cleanup，需在 master 跑）
2. 批次 spawn DV（每 panel 一個，並行）審 `.ai/audits/<panel>/` + `theme.css` → 產出 `.ai/audits/<panel>.md` 美感問題清單
3. 整合 6 panel（含 properties 已有 baseline）審視結果 → 排批次修繕計畫
4. **修繕批次正是 sub-AD 甜蜜點候選**：跨 panel 統一視覺修正

### 次優先：Properties 階段 2

- 正式巢狀資料模型 + PropertiesPanel 遞迴渲染（替換 Delta Transform hardcoded 0）
- 不適用 sub-AD（共用 type，跨檔耦合）

### 第三優先：Sub-AD 機制首次實裝

- 等遇到「跨 panel 統一視覺擴散」這類甜蜜點 → 直接 dispatch inline「sub-AD 協調」指引
- 跑通 1-2 次後再萃取成 .ai/roles/sub-ad.md

### 第四優先：舊 issue cleanup

- #330 巢狀 Mesh 重複渲染（#318 延伸 bug）
- #355 抽 computeDropPosition 公用函式（#338 技術債）

## 對指揮家的提醒

- **sub-AD 機制已成熟可用**，下次甜蜜點直接上不要再記「擱置」
- **Simplify 後的 PM step 9 跟實務對齊**：下次 PR merge PM 跑 ~3-4 分鐘穩定，不會 timeout
- **CLAUDE.md placeholder 規範收緊**（tasker.md 加禁止 `## `）— AT 下次寫任務應該不再留地雷
