# Mock-Preview (MP) 角色設計

**日期**：2026-04-17
**狀態**：設計確認中
**由來**：2026-04-17 討論 New Project overlay（#301）時，AH 臨時 spawn general-purpose subagent 產出 before/after HTML mockup 供指揮家挑選方案，指揮家評價品質高，建議形成固定角色。

---

## 職責

純視覺化工人。接收 AH 提供的 N 個明確方案描述，產出 HTML 並排 mockup。

- **做**：把文字方案畫成可視 HTML
- **不做**：提建議、做決策、改原始碼、commit、開 PR、寫 CLAUDE.md

---

## 定位與觸發

### 在 pipeline 中的位置

腦爆階段，**issue 開出之前**。

```
指揮家提出 UI 意圖
  ↓
AH 判斷需視覺化 → spawn MP（背景）
  ↓
MP 產出 .ai/previews/<topic>.html
  ↓
指揮家看 mockup → 挑定方案（或要求修改 → 重跑）
  ↓
AH 開 issue（body 含 Mockup: 路徑）
  ↓
後續走常規 AT → AD → QC → PM 流程
```

### 觸發規則（AH 判斷）

UI 類變更（feat/fix/refactor/style）AH **預設主動詢問指揮家「要不要先 MP 畫？」**（不是直接 spawn），除非屬於以下豁免項：

- **純文字改動**：copy edit、錯字、翻譯
- **單一 CSS 屬性微調**：單一顏色換、單一 padding/margin 小調
- **純邏輯 bug**：無視覺結果變化（例如修正點擊處理邏輯）

其餘 UI 變更，不論看起來多簡單，AH 一律先問指揮家「要不要 MP 先畫？」。

### 前提條件

MP 是純視覺化工人，**需要「已明確的 N 方案」作為輸入**。

若指揮家只說「overlay 不順」、「好看一點」這種模糊描述，AH 先用對話把方案談清楚（至少有 2 個具體可畫的方向），才 spawn MP。不得把未解的需求丟給 MP 自行詮釋。

---

## 輸入 / 輸出

### 輸入（AH dispatch prompt 規範）

AH 給 MP 的 prompt 必須包含：

1. **主題 / topic**：短詞（例：`new-project-overlay`），用於檔名
2. **N 個方案的明確文字描述**：含 Before 狀態作為對照基準
3. **主要參考檔案（絕對路徑）**：UI 元件檔、樣式變數檔
4. **配色 / 尺寸來源**：例如 `theme.css` 的 CSS 變數
5. **排版偏好**：橫向並排 / 2x2 grid / 其他
6. **每個 panel 尺寸建議**：預設 480x360 或依上下文

目的：避免 MP 花 tool 去尋找檔案、降低 orientation 成本。

### 輸出

- **檔案位置**：`.ai/previews/<topic>.html`
- **格式**：單檔靜態 HTML，內嵌 CSS，無 JS 互動
- **內容**：
  - Before + N 方案並排（或 grid）
  - 每個 panel 上方標籤寫方案名（Before / Change 1 / Plan A ...）
  - 每個 panel 下方加簡短說明
  - 整體背景深色、配合專案風格
  - 盡量貼近實際配色與 layout（讀 theme.css 對應 hex）

### 回報

MP 完成後回報 ≤ 100 字：
- 檔案絕對路徑
- 參考的原始檔（≤ 3 個）
- 有無理解不清的地方

---

## 模型

**預設 Sonnet**。

若單次任務 AH 判斷複雜（方案多、UI 層級深、需細緻配色），在 dispatch prompt 明確註記「**本次請用 Opus**」並在 Agent 工具 `model` 參數指定。

升級判斷權在 AH。實測若 Sonnet 連續多次品質不足，再考慮把預設改 Opus（更新 spec）。

---

## 迭代語意

**無狀態**。每次需求變動 AH 重新 spawn 新 MP，MP 拿完整新需求重畫整份 HTML（覆蓋舊檔）。

不支援「在現有 HTML 上加 Plan C」這種增量更新。若未來迭代頻繁，再升級為增量模式。

---

## Issue 整合

AH 開 issue 時，在 body 加一行：

```
Mockup: .ai/previews/<topic>.html
```

放在 issue body 明顯位置（例如 `## 視覺預覽` 小節下）。PR body 亦可沿用此引用，方便 QC / 審查者對照。

---

## 清理（PM 流程）

PM 在 merge 收尾流程新增步驟：

1. 讀取 issue body（`gh issue view <N> --json body -q .body`）
2. 解析 `Mockup:` 行，取得 `.ai/previews/xxx.html` 路徑
3. 刪除該檔案

若 issue body 無 `Mockup:` 行，跳過此步驟（非 UI 或無用 MP 的 issue）。迭代過程若產生其他孤兒檔案（不太可能，因同一 topic 檔名會覆蓋），不在 PM 職責內，由 AH 後續 session startup 時掃 `.ai/previews/` 自行清理。

---

## 明確不做的事

- 不提方案建議（純視覺化，不越權）
- 不讀方案外的原始碼（只讀 AH 指定的檔案）
- 不修改 src 下任何檔案
- 不 commit、不 push、不開 PR
- 不寫 / 改 CLAUDE.md
- 不 spawn 其他 agent（包括 RD）— 若需讀多檔，AH 在 dispatch prompt 裡指定清單

---

## 實作影響範圍

本 spec 批准後，需動以下檔案：

1. **新增** `.ai/roles/mock-preview.md` — MP 角色規範（內容源自本 spec 的操作條款）
2. **修改** `CLAUDE.md`（根目錄） — 角色表增列 MP、工作流程區補 MP 觸發說明
3. **修改** `.ai/roles/pr-merge.md` — 加「解析 issue body 刪 mockup」步驟

實作本身為文件類變更，不涉及原始碼。可直接 commit 至 master，不需走完整 pipeline（參考既有 `.ai/` 相關 commit 慣例，如 `chore: 更新 session 交接筆記`）。

---

## 非本 spec 範圍

- MP 的品質評估機制（如何判定「Sonnet 品質不足」）— 暫依 AH 主觀判斷，未來累積案例再考慮量化
- MP 與 AT 的協作（AT 寫任務時是否引用 mockup）— 非 MP 職責，AT 自行處置
- 非 UI 類的視覺化需求（例如架構圖、資料流圖）— 本 spec 不涵蓋，未來若有需求再開新角色或擴充 MP
