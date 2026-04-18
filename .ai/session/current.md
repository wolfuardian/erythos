# Session 狀態（2026-04-18 — 新增 WORKFLOW.md 多角色協作流程 SOP）

## 本 session 產出（1 個 chore commit）

| Commit | 行改 | 內容 |
|--------|-----|------|
| `edecaf1` | +925 / -3 | 新增 `.ai/WORKFLOW.md`（922 行）+ pre-commit hook bump 版本 0.1.124 |

## 完成內容

指揮家要求「把角色流程寫一份可被複製的 md」+「打包角色規範作為 reference」。

產出 `.ai/WORKFLOW.md`（922 行），結構：

- **§1–§6 流程總覽（~360 行）**
  - §1 核心理念（成本 / DB Pull / 角色邊界 / Context 紀律）
  - §2 角色一覽表（指揮家 + 10 agent）
  - §3 Pipeline（全貌 + 6 條路徑：標準 / Fast Path / 大功能 / MP / DV / Pre-flight）
  - §4 Session Startup SOP
  - §5 關鍵紀律（Context / DB / Model / Dispatch / Insight / 分支 / 禁止）
  - §6 專案特定適配層（Erythos 範例 + 搬新專案的 6 步替換法）

- **Reference 濃縮版 R.1–R.9（~450 行）**
  - 每角色 40-60 行：TL;DR / 流程位置 / 輸入輸出 / 可做 vs 不可做 / Context 預算 / 模型
  - 刻意選濃縮版而非原檔照搬：對照用途下 40 行快讀 > 170 行完整規範

- **附錄（~110 行）**
  - 7 個角色 Dispatch Prompt 骨架模板
  - 目錄結構參考圖

## 架構決策（供下個 AH 理解設計意圖）

- **雙版本策略**：`.ai/WORKFLOW.md`（濃縮 digest）+ `.ai/roles/*.md`（完整規範）。dispatch prompt 應引用 `.ai/roles/<name>.md` 而非 WORKFLOW.md
- **單一事實來源仍是 `.ai/roles/`**：WORKFLOW.md 只給讀者 overview。規則變動時**先改 `.ai/roles/`，再補 WORKFLOW.md**，避免 drift
- **Erythos 具體範例保留**：§6 明確標示「專案特定層」，搬專案時替換。沒抽象化成空白 template 因為具體範例更易讀、易落地

## Pipeline 終點

- **Master @ `edecaf1`**（已 push）
- 0 active worktree / 0 open PR
- Open issues：#330 #355（舊技術債，未動）

## 下個 Session 優先序

### ★ 最優先：驗收新流程（與上 session 交接一致，仍未動）

新流程（EX / subAD / PM 不 trigger RDM）**尚未實戰驗收**。首次試水要記錄 token baseline：

1. **EX 首次 dispatch**：選真實「前置知識不足」情境 → 觀察 EX 能否精確回答 + 更新 DB
2. **subAD 首次試水**：推薦 A1 hover 統一（4-8 個 panel 獨立加 hover style，符合 subAD 甜蜜點）
3. **PM 不 spawn RDM**：觀察是否有隱形依賴（應無，但驗證）

### 次優先：DV 113 個視覺問題排修

上上 session 已列出（`.ai/audits/*.md`），主題：
- Hover 統一（= A1，與 subAD 試水合併）
- Disabled 對比度（context panel 最嚴重）
- Project Hub 空狀態重做（最大設計缺口）

### 第三優先：舊技術債

- #330 巢狀 Mesh 重複渲染（#318 延伸 bug）
- #355 抽 `computeDropPosition`（#338 技術債）

## 指揮家偏好觀察（本 session 新增）

- **「可被複製」=「完整打包的單檔」**：不是抽象化空白 template，而是「帶走即可用」的完整文件（含 Erythos 具體範例作為示範）
- **「簡單但 reference 可對照」的平衡感**：主體清爽（流程總覽），細節留 reference，不犧牲完整性。本 session 採「濃縮 reference」而非「原檔照搬」獲得這個平衡
- **OK 風格**：指揮家說「OK」= 直接執行，不需要再確認細節（本次 commit message 的前綴、是否直接 push 皆自決）

## 對下次 AH 的提醒

1. **WORKFLOW.md 是衍生產物**：規則變動時**先改 `.ai/roles/<name>.md`**，再同步 WORKFLOW.md 對應的 R 段。別單改 WORKFLOW.md 造成 drift
2. **WORKFLOW.md 可搬運**：若指揮家或他人要搬到新專案，起點是複製 `.ai/WORKFLOW.md` + `.ai/roles/` 整個資料夾，依 §6.5「適配方法」6 步替換
3. **§6 Erythos 特定層**：模組清單與根 CLAUDE.md 同步更新。若模組增減要**兩處都改**（或乾脆讓 WORKFLOW.md §6.1 改成「詳見根 CLAUDE.md」單一來源 — 未來重構機會）
4. **Dispatch Prompt 模板只是骨架**：實際 dispatch 時要補具體內容（檔案路徑、before/after、禁止事項），骨架不能直接用
5. **Open issues #330 / #355 沒動**：已掛三個 session 未處理，若指揮家沒新意圖，可主動提議啟動
