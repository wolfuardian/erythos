# Session 狀態（2026-04-17）

## 本次完成的 issue（20 個 merged）

| # | 標題 | PR | 類型 |
|---|------|-----|------|
| #315 | New project 不 auto-open + Close dialog labels | #316 | app |
| #317 | viewport Render Effects UX pass (Quality + Tone Mapping select) | #322 | viewport |
| #318 | glb 雙層 scale 壓扁 | #323 | core |
| #319 | .gitignore projects/ | #321 | repo |
| #320 | Grid 穿透物件 → 移主 scene | #342 | viewport |
| #324 | Tone Mapping 無效（composer 繞過） → 加 OutputPass | #332 | viewport |
| #325 | ProjectFile.type 擴 'texture' | #331 | core |
| #326 | Hub 模式移除 IMPORTED 區塊 | #333 | app |
| #327 | Browser mode Assets/ UI 重做（方案 B filter + flat list） | #339 | app |
| #328 | Assets/ drop-to-copy + auto-suffix | #352 | app+core |
| #329 | Assets/ filter bar SVG 線框 icon | #357 | app |
| #334 | Environment 加 Project HDR 下拉 | #337 | environment |
| #335 | `<select>` dark color-scheme | #336 | styles |
| #338 | Assets/ glb click=select, drag→Viewport | #354 | app+viewport |
| #340 | Environment 移除 URL 輸入框 | #341 | environment |
| #344 | EnvironmentPanel rgba → tokens | #348 | environment |
| #345 | ConfirmDialog CTA primary/secondary | #350 | components |
| #346 | Panel header 一致化（Env/Props/SceneTree）| #353 | 多 panels |
| #347 | SceneTree badge fallback cleanup | #351 | scene-tree |
| #356 | Shading mode 忽略 environment HDR | #358 | viewport |

## Open issues（4 個待做）

- #330 — [core] 巢狀 Mesh 重複渲染（#318 延伸）
- #343 — [styles] theme.css polish（對齊 nadi Blender 風單 PR）
- #349 — [styles] 補 `--badge-geometry` token（#347 memo 承接）
- #355 — [viewport] 抽 computeDropPosition refactor（#338 memo 承接）

## 方法論四條修正（session 中指揮家叮並已歸檔 knowledge.md / memory）

1. **多工預設**：並行開 issue/worktree/agent，除非真依賴才等
2. **TaskCreate 輕量**：外部有載體（GitHub issue/PR/worktree）就不再本地 task list 複製
3. **Worktree 語意命名**：`erythos-<issue>-<slug>`（例 `erythos-318-glb-transform`）
4. **主動掃 memos**：PM 後 AH 自己掃主 repo + 所有 worktree 的 `.ai/memos/`，不信 PM 回報「無 memo」

4 條已寫 `.ai/knowledge.md` 新章節「AH 方法論」+ 對應 `memory/feedback_*.md`

## Memo 流程實踐（session 內 3 次）

本 session 跑通三次「memo → 判斷 → 歸檔/開 issue → 刪 memo → commit」：
- #318 memo → 開 #330（nested mesh）→ rm memo
- #327 memo → 開 #338（glb drag integration）→ rm memo
- #347 memo → 開 #349（補 --badge-geometry token）→ rm memo
- #328 memo → 歸檔 knowledge.md 的「拖放/FSA API 陷阱」章節 → rm memo
- #338 memo → 開 #355（computeDropPosition refactor）→ rm memo

## 重要技術知識（已寫 knowledge.md）

- **拖放 / FSA API 陷阱**（來自 #328 memo）：writeFile 不 emit/rescan、findFreeName 用 getFileHandle NotFoundError、onDragOver 必 preventDefault、onDragLeave child guard、UI 字串 vs 寫死目錄同步

## 待討論（下次 session 繼續）

### UI 視覺美感盤點（session 尾端指揮家提出）
指揮家反映：MP 的 mockup 有美感，但實際網頁整體沒看到那種美感。希望**整體一個一個檢視、優化 UI 視覺樣式**。

AH 提議分兩步：
1. Step 1：全站視覺審計（不改 code） — 用 Playwright 或 RD 逐 panel 截圖列問題
2. Step 2：依批改結果分批開 issue 並行執行

指揮家選「先結束 session」未回三個 Q（Q1 Playwright MCP、Q2 顆粒度 panel vs row、Q3 要問題還是修法建議）→ 下次 session 先討論這三題。

可能用到的新角色：**DA (Design Auditor)** — 掃現狀找美感問題，類 RD 結構但聚焦視覺，產報告。mock-preview 是畫草案，DA 是審活網頁。可評估是否值得立角色檔。

### 其他懸念
- #330 nested mesh：等有藝術家資產觸發再修
- #343 theme.css polish：獨立 PR，可併入 UI 大計畫
- UIUX 推理輔助角色（跨多 session 構想）：本次無實測

## 指揮家偏好（本 session 新觀察）

- **大量平行 dispatch 容忍度高**：5 個 worktree + 多個 AT/AD/QC 同時跑完全 OK
- **Fast path 欣然接受**：Env URL removal / .gitignore / select dark 都走 Fast path 不抱怨
- **方法論自我批判**：session 中親自叮 AH 四條，全部落實即 OK，不多話
- **QC FAIL 正視**：#357 signal 錯位 + #352 寫死 3 目錄都由 QC 抓出，指揮家未責難，只關心有走流程修復
- **審美有細膩判斷**：#4A7FBF 定案放棄深藍候選（「Current 已完美」）、mockup 美感與實際 UI 落差能察覺
- **提問習慣連鎖**：會在同一訊息內拋 2-5 個並行問題（E-Q1/2/3、grid A/B/C 等），AH 需同時追蹤而非一個個回

## Session context 觀察

- 最大 session 跑量（20 merged + 多次 memo + 方法論重構）
- 尾端指揮家主動提議先結束 session，pipeline 狀態完美（0 worktree / 0 PR / 0 memo / master 同步）
- 下次應立刻進入 UI 視覺審計階段（先討論三題 Q 再執行）
