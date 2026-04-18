# Session 狀態（2026-04-18 — 流程 SOP 大重構 + 歸位簡化）

## 本 session 產出（3 個 chore commit）

| Commit | 行改 | 內容 |
|--------|-----|------|
| `7579f63` | +345 / -279 | RDM / RD → EX + subAD（流程重構） |
| `31337f6` | +3 / -263 | Untrack `.ai/audits/` + `.claude/settings.local.json` |
| `7979083` | +35 / -190 | 廢 `.ai/memos/` + `.ai/knowledge.md`；內容歸位到 core.md / scripts.md / MEMORY |
| **淨** | **−349 行** | 三階段 simplify |

## 流程架構（已落地）

```
AH → (可選) spawn EX 探勘 → 任務 → (正規) AT / (Fast-path) AH 自寫 → AD (總執行長)
                                                                          ↓
                                                            (可選) spawn subAD × N 並行改獨立檔
                                                                          ↓
                                                                    QC → PM 收尾
```

### 新角色
- **EX**（Explorer）：按需探勘前置知識，pull 模式，寫入 `.ai/module-cache/<module>.md`
- **subAD**（Sub-Developer）：AD 分派的單檔實作者，多檔並行

### 廢除
- RDM / RD（push 模式產物可能無消費 → 廢）
- `.ai/memos/` / `.ai/knowledge.md`（insight 改走 PR body / QC comment）
- PM step 9 trigger RDM（不再自動刷 DB）
- `.ai/audits/scene-tree-engineering.md`（違反新 DV 規範的異類）

### 結構保留
- `.ai/module-cache/*.md` 路徑保留（DB 初始內容仍在，EX 按需覆寫）
- DB 頭的 `_Last updated: by RDM_` 標記保留（EX 刷新時自然覆寫）

## 文件最終結構

- `.ai/roles/` × 9 個 role 檔（explorer / sub-developer / developer / pr-merge / pr-qc / tasker / advisor / mock-preview / design-visual）
- `.ai/module-cache/` × 3（core 84 / properties 55 / scripts 55）
- `.ai/scene-format-*.md` × 2（Phase 4 IO 要用）
- `.ai/id-strategy.md`（ADR 歷史）
- `CLAUDE.md` root 285 行

## Pipeline 終點

- **Master @ `7979083`**（本檔 commit 後會推進）
- 0 active worktree / 0 open PR
- Open issues：#330 #355（與本 session 無關的舊技術債）

## 下個 Session 優先序

### ★ 最優先：驗收新流程

新流程**未實戰**。首次試水要記錄 token baseline：

1. **EX 首次 dispatch**：選真實「前置知識不足」情境（例如想改 components 但不確定 props 形狀） → 觀察 EX 是否能精確回答 + 更新 DB
2. **subAD 首次試水**：推薦 A1 hover 統一（4-8 個 panel 獨立加 hover style，符合 subAD 甜蜜點觸發條件）
3. **PM 不 spawn RDM**：觀察是否有隱形依賴（應無，但驗證）

### 次優先：DV 113 個視覺問題排修繕

上上 session 已列出（`.ai/audits/*.md`），主題：
- Hover 統一（= A1，與 subAD 試水合併）
- Disabled 對比度（context panel 最嚴重）
- Project Hub 空狀態重做（最大設計缺口）

### 第三優先：舊技術債

- #330 巢狀 Mesh 重複渲染（#318 延伸 bug）
- #355 抽 computeDropPosition（#338 技術債）

## 指揮家偏好觀察（本 session 新增）

- **激進 simplify 風格**：A/B 選項時選 A（激進），不挑保守；看到檔案多會本能想「還留著嗎」
- **主動抽樣檢查 AH 遺漏**：MP 流程圖問題體現指揮家會抽查「我是不是忘了某件事」。AH 回答時**具體引用行號**才能證明沒漏
- **文字規範 > 視覺產出**：「流程圖我自己可以畫給自己看」— 指揮家相信文字自洽，不要求 AH 另外產視覺總覽
- **順便型指示**：「順便 Simplify 多餘與陳舊的檔案」= 期望 AH 擴大範圍到鄰近清理，不死守字面任務

## 對下次 AH 的提醒

1. **EX 首次 dispatch 前**：`.ai/module-cache/` 三個 DB 是 RDM 時期產出（標記 `by RDM`），格式仍是舊「Module Cache」標題而非新「前置知識」；EX 首次刷新時順手統一即可，不預先動
2. **subAD spawn 模板**：`.ai/roles/sub-developer.md` 已定義。AD 在 dispatch prompt 中要給 **精確修法 + 負面指令 + 單次並行 ≤ 4 個**
3. **insight 流動檢查**：看到 AT/AD/QC 回報含「DB 缺口」/「DB 過時」/「建議 spawn EX」時，AH 要判斷：開 issue / spawn EX / 寫 MEMORY / 忽略（4 擇 1，不要推遲）
4. **ConfirmDialog 陷阱已在 MEMORY**：`reference_confirm_dialog.md` 說明不支援 variant / danger / 紅色按鈕。AH 規劃相關改動先查 MEMORY
5. **core.md 略超 EX 規範**：84 行 vs 80 上限。EX 刷新時可精簡（移「AutoSave debounce 2 秒」這種 grep 即得的條目）
6. **自動記憶清理完成**：`feedback_rdm_architecture.md` / `project_sub_ad_idea.md` 已刪，避免誤導下個 session
