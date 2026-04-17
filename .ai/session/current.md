# Session 狀態（2026-04-17 → 2026-04-18 — properties 視覺落地 + RDM 機制引入）

## 完成事項：3 PR merged + process 建設

### Properties 模組階段式落地

| PR | Issue | 摘要 | merge commit |
|----|-------|------|--------------|
| #374 | #373 | 階段 1：Variant A · Tint v2 視覺落地（平面結構）+ foldable + XYZ badge | 4ce2e9b |
| #376 | #375 | 階段 1.5：Delta Transform 子面板驗證 deep tint（`variant="deep"` prop） | b1e6e53 |
| #378 | #377 | 階段 1.6：padding-left 從 FoldableSection wrapper 移到 row 層級 | 6065f4d |

### 非 PR 改動（AH 直接在 master commit）

- **#343 關閉** + title 改中性（敏感詞清除）+ supersede comment 指向 #373
- **4 個 mockup git-tracked**（`.ai/previews/properties-*.html`）：design history 保留
- **pr-merge.md step 7 修訂**：不再自動刪 `.ai/previews/`（PM 曾誤刪 v4 事件教訓）
- **RDM 機制建立**：
  - 新 role `.ai/roles/reader-manager.md`（首版 + 架構修正）
  - `.ai/module-cache/` 目錄 + `.gitkeep`
  - 根 CLAUDE.md 角色表加 RDM 行 + 用途說明
  - 首次產出 `.ai/module-cache/properties.md`（55 行，baseline）

## 主要模式與教訓（已寫入 memory）

- **命名潔癖**：`nadi`（前公司名）**不得**寫入任何 git 追蹤位置（commit / PR / issue / `.ai/` / src）。本地 memory 可記（不進 git）。HTML mockup 內部 label 用中性（Baseline / Variant A / ...），不提 Blender / Unity / Nuke 等品牌名
- **Context 寶貴原則普適**：不只 AH 要省，AT / AD / QC / PM / MP / DV / RD 皆然。dispatch 給剛剛好 context、不讓 agent 自由擴探
- **RDM 架構（指揮家糾正）**：RDM **不親自讀 src**，而是 spawn RD 大軍並行讀 → 聚合 / 驗證 / 組織。首次 Phase 2 properties.md 是 RDM 親讀產生（例外 baseline），下次 update 走正確流程
- **PM 誤刪事件**：`.ai/previews/` 檔案未 git-track 被 PM 依舊規範 `rm` 掉，無法還原，重跑 MP 重建。新規範已防
- **Foldable 1px 跳動**：rest 和 focus border 厚度要一致（都 2px），focus 只切色值（AT #374 技術決策）
- **MultiSelectDraw 陷阱**：任何 row 視覺改動要同步 multi-select 視圖（#374 教訓，AT 主動用 advisor 識別）

## Process 觀察

- **本 session Stream 健康**：所有 agent（AT / AD / QC / PM / MP / RDM）均成功回報，無 stream timeout
- **Context 節約實證**：QC PR #378 dispatch 加精簡規則後 23k tokens（vs 前版 33k），35s（vs 67s），7 tool uses（vs 17） — **省約 30%**
- **AT 使用 advisor 升級**（#374）：dispatch 未提 MultiSelectDraw，AT 自行用 advisor 識別陷阱並納入任務
- **Mockup 疊代 4 版定調**：b-v1 → b2-variants-v1 → va-nested-v1 → va-tint-v2（採納）— 指揮家偏好「讓我確認是不是我想的」方式

## 下一個 session 優先序

### ★ 最優先：Phase 3 RDM 整合（PM trigger）

**問題**：RDM 機制建立了但沒人在 PM merge 後 trigger 它 → cache 不會自動維護 → stale

**最小 Phase 3a**（最關鍵）：
- 修訂 `.ai/roles/pr-merge.md` 加 step：merge 後判斷 PR 涉及哪個模組 → spawn RDM update 該模組 cache
- 這一步做完 RDM 機制才真正活起來

**完整 Phase 3**（視需求）：
- AT / AD / QC dispatch 模板預設「先查 `.ai/module-cache/<module>.md`，資訊不足才 spawn RD」
- 根 CLAUDE.md Session startup SOP 加「偵測 cache stale → 輪巡」

### 次優先：Audit pipeline 繼續

5 個 AT 產物備妥在 worktree，等 AD 依序（port 3000 衝突，必須 sequential）：
- #368 viewport（6 張截圖）
- #369 leaf（4 張，需 IndexedDB fixture）
- #370 project（7 張，含 OPFS stub）
- #371 settings（2 張，最簡）
- #372 context（5 張，右鍵觸發）

完成後批次 spawn DV 審視覺，6 panel audit 完成後排批次修繕計畫。

### 第三優先：Properties 階段 2+

- **階段 2**：正式巢狀資料模型 + PropertiesPanel 遞迴渲染（替換 Delta Transform hardcoded 0）
- **階段 3**：core 提供 Mesh metadata accessor（Geometry / Vertices / Faces）
- **階段 4**：Variant A 擴散到 environment / scene-tree / leaf 等其他 panel

### 第四優先：Sub-AD 機制（等甜蜜點）

指揮家明言要記得。擱置理由：RDM 剛落地需穩定 + 當前 PR 多耦合。甜蜜點 = 4–8 個獨立檔案的大 PR（跨 panel 統一視覺、批次 hardcoded 替換）。參考 memory `project_sub_ad_idea.md`。

## 指揮家偏好觀察（新增）

- **敏感詞紅線**：`nadi` 一律不留紀錄，AH 要主動守門（grep PR diff / mockup HTML 等產出）
- **Context 寶貴普適**：不只 AD 要省，所有角色都要
- **會迂迴確認擱置話題**：sub-AD 被 RDM 岔開後還會回頭問 — **AH 不要轉 topic 太快**，擱置的討論要主動記 memory 或追蹤
- **設計決策流程**：「讓我確認是不是我想的那樣」→ MP 一版 + before 對照足夠，不用一次畫 4 個 variants
- **對視覺細節敏感**：子面板縮排 14px 偏差一眼發現（說明他實際在瀏覽器檢視每個 PR 成果）
- **「立刻喔，很清楚了」**：表示他信任方向不需再討論，AH 直接執行
- **同意 PM 解機械性衝突**（之前 session）/ **不同意 PM 自動刪 mockup**（本 session）— 「無 drift」是關鍵判準

## Pipeline 終點

- **Master** @ `a334965`（含本 session 所有改動 + RDM 架構修正）
- **0 active worktree**
- **0 open PR**
- **Open issues**：#368 / #369 / #370 / #371 / #372（audit batch，AT 產物備妥）

## 懸念

- **RDM 機制未整合進 PM**：目前 RDM 只能手動 spawn，下個 session Phase 3a 優先補齊
- **Properties.md cache 的 date 標 `2026-04-17`**（實際 04-18）：RDM 日期來自 session context 非 system date，下次 RDM dispatch 可帶當下日期
- **audit screenshot 與新 master 對齊？**：5 AT 產物從 `eaddea6` 建 worktree，現 master 已到 `a334965`（涉 properties 改動但不影響 5 個 panel 的 audit）。worktree base 陳舊但不衝突
- **.claude/settings.local.json** 一直有 M 狀態（local 設定），無需處理
