# Session 狀態（2026-04-18 — α/β 工程線完成 + 流程架構定案）

## 完成事項

### 工程線：3 個 PR 一口氣跑完

| PR | Issue | Module | Merge SHA | Cache 變動 |
|----|-------|--------|-----------|-----------|
| #385 | #384 | app（theme.css） | `887827a` | — (src/styles/ 無模組) |
| #388 | #387 | core | `2c4d1b9` | **core.md create** 77 行 |
| #389 | #386 | scripts | `adb4842` | scripts.md 52→54 行 |

- **#384 (β)**：全站 form control accent-color → `var(--accent-blue)` — fast-path, 3 行 CSS 解 multi-panel 粉紅問題
- **#387**：Editor.init() 末尾 emit `leafStoreChanged` — fast-path, 3 行 TS 修**一般使用者存 leaf reload 資料顯示 0** 的 bug（由 AT #386 探勘發現）
- **#386 (α)**：leaf audit defensive `waitForTimeout(500)` + panel timeout 3000→5000ms（正規流程，AT 探勘把 issue 假設改寫）

### DV 視覺審計（8 panel 完整）

- 8 audit scripts 跑過 → 32 張截圖
- 5 新 DV（viewport/leaf/project/settings/context）產出 `.ai/audits/<panel>.md`
- 3 既存（scene-tree/environment/properties）沿用舊 .md
- **113 個視覺問題**列出

主旋律（跨 panel 共性）：
1. **Hover 無感**（5/8 panel）
2. **色彩調性失準**（β 修了 form accent，其他還在）
3. **Prototype 感**（多 panel verdict 重複）
4. **Disabled 對比度低**（context panel 最嚴重）

### SOP 前置 Refactor（commit `6c9bb39`）

- reader.md 降格為 RDM 工具
- CLAUDE.md root 新增 Cache-first 讀取紀律
- tasker / developer / pr-qc.md 加 cache-first 起手流程
- pr-merge.md 修 cache 權責矛盾

**⚠️ 注意：這半已被後半腦力激盪推翻** — RD/RDM 即將全廢。下次 session refactor 時會把這些再重寫。

## 流程架構定案（本 session 最大產物）

### 重大決策

- **RD + RDM 廢除**（實戰證明 RDM 成本高、消費者不明）
- **EX（探勘）新角色**，獨承前置知識生產
- **AA 保留**為可選戰略審查
- **subAD 升級**為 AD 標準工具（AD = 總執行長 + subAD 細節實作）
- **PM step 9 廢除**（不再 spawn RDM）

### 新流程

```
                          ┌─────────────┐
                          │   指揮家    │
                          └──────┬──────┘
                                 │
                          ┌─────────────┐
                          │  AH 主腦    │←──── 最終回報
                          └──────┬──────┘
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    │ (可選, 資訊不足)            │ (主線, 信任 DB)              │ (可選, 戰略審)
    ↓                            │                            ↓
┌───────┐                  ┌──────────┐                  ┌───────┐
│EX 探勘│─── 寫入 ─────►│前置知識DB│◄──── 讀取 ────────│AA 顧問│
└───────┘                  └────┬─────┘                  └───────┘
                                │
                                ↓
                         ┌─────────────┐
                         │  任務需求   │ (issue + spec)
                         └──────┬──────┘
                                │ ★ AH 建 Worktree
                                ↓
                         ┌─────────────┐
                         │  Worktree   │
                         └──────┬──────┘
                                │
                      ┌─────────┴──────────┐
               正規流程↓              Fast-path↓ (豁免級, AH 自寫任務)
                  ┌───────┐                  │
                  │AT 規劃 │                  │
                  └───┬───┘                  │
                      │                       │
                      └───────────┬───────────┘
                                  ↓
                           ┌─────────────┐
                           │   AD 執行   │ ← 總執行長
                           │  ╔═══════╗  │
                           │  ║subAD×N║  │ ← AD 視需要並行 spawn
                           │  ╚═══════╝  │
                           └──────┬──────┘
                                  │ 開 PR
                                  ↓
                           ┌─────────────┐
                           │   QC 審查   │
                           └──────┬──────┘
                                  │
                         ┌────────┴────────┐
                     PASS↓             FAIL↓
                         │                 │
                         │   ┌─────────────▼──────────┐
                         │   │ 任務需求 (待修項更新)   │
                         │   └─────────────┬──────────┘
                         │           ★ AH 決策:修 or 擴新 issue
                         │                 └──→ AD 重做
                         ↓
                  ┌─────────────┐
                  │  PM 收尾    │ ← merge + cleanup
                  └──────┬──────┘  (不再 spawn RDM)
                         │
                         ↓
                      回 AH → 指揮家

    ★ = AH 中段決策介入點
```

### 新角色定義表

| 角色 | 定位 | 狀態 |
|------|------|------|
| **AH** 主腦 | 啟動 / Worktree 建 / QC FAIL 裁決 / 審閱 / 最終回報 | 保留 |
| **EX** 探勘 | 動態問題探勘 → 寫入前置知識 DB | **新增** |
| **AA** 顧問 | 戰略審查（可選） | 保留 |
| **AT** 規劃 | 任務需求 → 任務描述；正規流程必經；Fast-path 可跳 | 保留 |
| **AD** 執行 | 總執行長；親改或分派 subAD | 升級 |
| **subAD** | AD 分派的細節實作者（獨立檔案並行） | **新增** |
| **QC** 審查 | PR diff 審查 | 保留 |
| **PM** 收尾 | Merge + cleanup（step 9 廢除） | 簡化 |
| ~~RDM~~ | 功能被 EX 吸收 | **廢除** |
| ~~RD~~ | 隨 RDM 廢除 | **廢除** |

## 主要教訓

### RDM 的成功反而是反面教材
- PM #388 spawn RDM 成功：6 分鐘 / 34k token / 24 tool uses / 77 行 cache
- 問題：**這 77 行誰會讀？** 沒消費保證 = token 可能白花
- JIT 模式（EX 按需寫入）成本類似、但保證有消費

### AT 探勘能力驗證 EX 角色需求
- AT #386 token 55k（典型 AT ~20-30k）—— 原因是被迫讀 5 個 src 檔當探勘者
- 這是 EX 缺席的**實證成本**

### 大模組 RDM 路徑 v2b 壓測通過但無意義
- 3 層 nested spawn（PM → RDM → RD 大軍）未 timeout
- 但 RDM 即將廢除，此驗證失去實用價值
- 保留作「流程複雜度警惕」參考

### Cache-first 消費端契約有效
- AT #386 起手查 scripts.md cache（52 行）省了讀整個 scripts/
- 證明 cache-first pattern 正確；只是生產端要換人（RDM → EX）

## Chronic Noise（下 session 可清理）

- `.claude/settings.local.json` 每次 PM 回報跳過（local 設定）
- `.ai/audits/properties/*.png` 3 張 tracked vs `.gitignore` 矛盾（PM #385/#388/#389 三次回報同樣 noise）
- 修法：`git rm --cached .ai/audits/` 讓 gitignore 生效（單指令小 chore）

## Pipeline 終點

- **Master @ `b3da1a4`**
- 0 active worktree / 0 open PR
- 本 session 處理 issues：#384 #385 #386 #387 #388 #389（全 closed / merged）
- Open issues：#330 #355（與本 session 無關的舊技術債）

## 下一個 Session 優先序

### ★ 最優先：流程 SOP Refactor（1 個完整 session）

改寫 / 刪除清單：

| 檔案 | 動作 |
|------|------|
| `.ai/roles/explorer.md` | **新增** |
| `.ai/roles/sub-developer.md` | **新增**（或併 developer.md） |
| `.ai/roles/developer.md` | 大改（AD 總執行長 + subAD 分派 pattern） |
| `.ai/roles/reader.md` | **刪除** |
| `.ai/roles/reader-manager.md` | **刪除** |
| `.ai/roles/pr-merge.md` | 廢 step 9（不 spawn RDM） |
| `.ai/roles/tasker.md` | 微調（cache-first → DB-first 用語） |
| `.ai/roles/pr-qc.md` | 微調（同上） |
| `CLAUDE.md` root | 大改（role table / AH Context 保護 / 全部 reader 相關段） |
| `.ai/module-cache/*.md` | 保留為 DB 初始內容（改由 EX lazy 更新） |

**重要**：meta-flow 重構不適合 spawn agent，AH 必須親自改。估計 1-2 小時。

### 次優先：工程線延續

- **ζ. A1 hover 統一（sub-AD 首次試水）**：refactor 後立刻實戰 AD→subAD 模式
- **θ. `npm run audit:leaf` 端到端驗收**：1 個命令快速確認 #386+#387 真修好
- **ι. chronic noise 清理**：`git rm --cached .ai/audits/` 等 一指令

### 第三優先：DV 113 問題排修繕

- Hover 統一（= ζ）
- Disabled 對比度（context panel 最嚴重）
- Project Hub 空狀態重做（最大設計缺口）

### 第四優先：舊 issue cleanup

- #330 巢狀 Mesh 重複渲染
- #355 抽 computeDropPosition

## 指揮家偏好觀察（本 session 更新）

- **腦力激盪喜歡分點對答**：6 點逐一回饋 → 高效定案。別一次給長篇申論
- **A+C 風格延續**：選項明確時直選編號（α / β / A1 B1 等）
- **Simplify 偏好強化**：RD/RDM 廢除是 session 最大 simplify，指揮家不捨複雜度
- **「你來幫我畫」= 信任 AH 執行**：定案後放手，不盯細節
- **反思性提問前置定向**：「先論述到這，你認為呢」= 徵求共識再推進，不是叫 AH 表態

## 對下次 AH 的提醒

1. **流程 refactor 前** 先 `.ai/session/` 讀完本筆記，確認流程圖共識仍在
2. **refactor 期間** 不要刪 `.ai/module-cache/*.md` 檔案本身，只改它們的維護機制
3. **refactor 後第一次 merge** PM step 9 跳過是新行為，觀察有無隱形依賴
4. **EX 首次 dispatch** 選真實「前置知識不足」情境（別為試而試），記錄 token baseline
5. **subAD 首次試水** 依然推薦 A1 hover 統一作甜蜜點
6. **chronic noise `.ai/audits/properties/*.png`** 下次 PM 可能又回報同樣 3 張，順手清掉 `git rm --cached`
