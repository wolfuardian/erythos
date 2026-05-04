# Codebase Complexity — Chain Analysis

延伸 `health-2026-05-04.md` 的 chain，對 P0/P1 跑完整四層判斷，其餘 triage 結論。

跑日：2026-05-04

---

## P0 — ViewportPanel.tsx（1061 行）

### 主要層級：**L3（重劃邊界）**
### 次要層級：L1（同層改寫）

### 結構盤點

| 區段 | 行數 | 職責 |
|---|---:|---|
| imports + signal declarations | 1-58 | Setup |
| onMount: pointer / drag-drop / keyboard / Viewport instance / transform commands | 59-405 | **viewport 行為核心** |
| createEffect × 12（render mode → viewport，scene lights → viewport，render settings → viewport，HDR / LookDev → viewport） | 405-528 | UI state 推到 viewport |
| return JSX：render mode toolbar | 535-589 | UI |
| return JSX：drag overlay | 590-633 | UI |
| return JSX：**Render Settings 子面板**（quality / tone mapping / bloom / SSAO / HDR / LookDev 6 區，皆有 collapsible group + slider + color picker） | 635-1061 | **獨立子產品** |

### 複雜度來源（一句話）

「Viewport 行為控制」+「Render Settings 編輯器子面板」兩個獨立產品塞在同一檔，第二個（~430 行）跟第一個沒有強耦合，靠 12 條 createEffect 把 UI signal 推到 viewport instance 即可。

### 複雜度搬家後去哪

抽 `<RenderSettingsPanel>`（含 quality / effects / HDR / lookdev 共 ~430 行）成獨立 component，透過 props 傳 `renderSettings` getter + `onUpdate` callback。複雜度未消失，但分到兩檔：
- ViewportPanel ~600 行（viewport mount + selection + drag-drop + render-mode toolbar + 12 條 createEffect 仍留）
- RenderSettingsPanel ~430 行（純 UI，無 viewport 依賴）

未來改 render settings UI 不會踩到 viewport mounting；反向亦然。

### 建議動作

1. **抽 `<RenderSettingsPanel>`** — line 635-1061 整段 JSX 抽出，props: `{ panelExpanded, setPanelExpanded, renderSettings, updateSetting, hdrIntensity, setHdrIntensity, hdrRotation, setHdrRotation, lookdevPreset, setLookdevPreset, isGroupOpen, toggleGroup }`。
2. **抽 `<ShadingToolbar>`** — line 553-589 render mode 4 顆按鈕 + scene lights toggle，props: `{ renderMode, setRenderMode, sceneLightsOn, setSceneLightsOn, hoveredShading, setHoveredShading }`。
3. **L1 局部清理**（次要）：`onTransformEnd` / `onMultiTransformEnd` 兩個 callback 內的 pos/rot/scale 三段重複可抽 helper（line 266-307）。但這是 onMount 內的事，影響不大，可後做或不做。

### 不建議動的部分

- **12 條 createEffect 把 signal 推到 viewport** — 這就是 panel 的本質工作（UI state → viewport instance），不是壞味道。拆 sub-panel 後會自然減少（render settings 的 effect 隨 panel 出去）。
- **onMount 內的 viewport instance 建構與 callback 配置（line 233-308）** — 是 viewport 與 editor.execute 的綁定點，職責清楚，不需動。
- **drag-drop overlay**（615-633）— 幾十行，跟 viewport drop 行為強耦合，留在 panel 合適。

### 預估規模

- 拆 `<RenderSettingsPanel>` 是純剪下重貼 + props 通道：估 +1 新檔（~430 行）、ViewportPanel -430 行 + 加 component 引用。Diff 約 ±500 行，**屬高風險路徑**（>100 行、跨模組、新增 component）→ 走 issue → worktree → AD → QC。
- 拆 `<ShadingToolbar>` 是次級工作，可單獨 PR 或併入上述。

### 下一步 → `codebase-cleanup`

但因規模屬高風險，建議流程：
1. 開 issue「[viewport] split RenderSettingsPanel from ViewportPanel」標 `Depends-on:` 無
2. 開 worktree → 派 AD（dispatch prompt 含本段 1-2 點建議）
3. PR + 派 QC
4. 收尾後開 P0-FU issue：考慮 `<ShadingToolbar>` 抽出（diff < 50 行可 AH 自做）

---

## P1 — ProjectPanel.tsx（809 行）

### 主要層級：**L3（重劃邊界）**
### 次要層級：L1（同層改寫）

### 結構盤點

| 區段 | 行數 | 職責 |
|---|---:|---|
| TYPE_META + filterIcon + FOLDERS 常數 | 11-42 | 資料定義（~32 行） |
| 16 個 createSignal | 47-77 | 狀態 |
| 篩選邏輯 / multi-select handler / new-scene flow / delete flow / context menu items | 108-329 | 行為 |
| return JSX：toolbar + folder tree + grid view + list view + dialogs + context menu | 332-808 | UI |

### 複雜度來源（一句話）

職責內聚度比 ViewportPanel 高（都是 file browser）但仍把 context menu 構造、3 種 dialog 配置、multi-select 點擊邏輯、new-scene flow、delete flow 全攤平在 component body — 是「職責一致但內部模式分層不明」的 L3。

### 複雜度搬家後去哪

四個方向，每個搬法不同：

1. **filterIcon → `<ProjectTypeIcon type={type}>`** 純元件（內聯 SVG 移到自己的檔）
2. **Context menu items 構造（264-313）** → 抽 `buildProjectMenuItems(file, ctx)` 純函式（無 hook 依賴），ProjectPanel 只負責「show」+「給 ctx」
3. **New-scene flow + Delete flow** → 抽 hooks（`useNewSceneFlow(editor)`, `useDeleteFlow(editor, files)`），把 dialog state、open/close、確認 callback 全包進 hook，ProjectPanel 內只剩 `<NewSceneDialog {...newSceneFlow.props} />`
4. **Multi-select 點擊邏輯（150-194）** → 抽 `useMultiSelect()` hook（generic，未來其他清單可重用）

複雜度搬到：4 個 helper 檔 / 各 30-100 行。ProjectPanel ~500 行（仍偏大但每段都是「真正的 file browser UI」）。

### 建議動作

優先序：
1. **filterIcon → `<ProjectTypeIcon>`**（diff < 30 行，AH 自做）
2. **buildProjectMenuItems pure function**（diff ~80 行，AD 派或 AH 自做）
3. **useDeleteFlow + useNewSceneFlow** hooks（中等規模 diff，AD 派）
4. **useMultiSelect**（generic 程度高，需確認是否其他面板也用得到 — 若只用在這一個 panel，先不做，等第二個用例出現再抽 [YAGNI]）

### 不建議動的部分

- **TYPE_META / FOLDERS 常數** — 32 行純資料，搬出去無價值（搬完 import path 反而變長）。
- **Grid + List 雙 view JSX** — 都是「file 顯示」的兩種模式，分檔會強行切割「同產品概念」，不利同步維護。可考慮局部 refactor 共用 row 結構，但不抽 sub-component。
- **16 個 signal** — 看似多但都是同產品的 UI 狀態，抽 store 反而增加間接層。

### 預估規模

- (1) 是 P0-quick fix（< 30 行 + 純機械搬移）：**AH 直做**
- (2) ~80 行純函式抽出：**AD 中等變更**
- (3) hooks 拆分：~150-200 行 diff，**AD + 視情況 QC**

### 下一步 → `codebase-cleanup`（分階段）

P1 不像 P0 是單一大手術，可分 3 個小 PR：
- P1-a [project] extract ProjectTypeIcon component
- P1-b [project] extract buildProjectMenuItems pure function
- P1-c [project] extract useNewSceneFlow + useDeleteFlow hooks

---

## P2 — SceneTreePanel.tsx — **延後**

Triage 結論：refs #702 phase 1 visual redesign 系列 PR 仍在進行中（最近三次 commit 都是該系列），結構正在變動。等該批 PR 全部 merge 後再評估，否則做的拆分可能很快被 redesign 推翻。

**重新評估時機**：refs #702 系列 issue 全部 close 之後。

**屆時應檢查**：phase 1 redesign 是否已內含結構重組（若 redesign 本身就把 indent guide / drag-drop / toggle 拆成獨立 sub-component），則本 P2 可能直接消失。

---

## P3 — App.tsx — **直接 cleanup**

Triage 結論：health 標 L2，範圍小（localStorage key 三個常數 + scene path resolve helper），明確該動且不跨模組（搬到 `core/project/`）。

**動作**：抽 `core/project/projectSession.ts` 含：
- `LAST_PROJECT_KEY` / `LAST_SCENE_KEY_PREFIX` / `DEFAULT_SCENE_PATH`
- `getLastProjectId()` / `setLastProjectId(id)` / `clearLastProjectId()`
- `getLastScenePath(projectId)` / `setLastScenePath(projectId, path)`

App.tsx 改用該模組函式，估 diff < 50 行 + 1 新檔。**AH 自做**（單檔邏輯抽出 + 1 個 import 重組）。

**不必跑 complexity 完整流程**（小範圍 L2，triage 直結論）。

---

## 守護 — `core/Editor.ts` — **不主動動，列名單**

Triage 結論：不在 hotspot top 5，churn × size = 3,519，無立即訊號。但同時是 fan-out 中心 + 兩條循環依賴的端點。

**Action**：列入「動它必派 QC」名單（已在 health report 寫明）。本 chain 不主動觸發 complexity / cleanup。

未來何時主動處理：
- 循環依賴 (1) Editor ↔ Command 是契約核心，難動
- 循環依賴 (2) Editor ↔ AutoSave 可動 — AutoSave 改純 listener 註冊（Editor 不持 AutoSave instance）。**獨立 issue 候選**

---

## 循環依賴 #3 — editors → context → PanelHeader → editors

### 根因

`src/components/PanelHeader.tsx` line 4：
```ts
import { editors } from '../app/editors';
```

違反 components/ 模組邊界（`src/components/CLAUDE.md` 慣例：components/ 不依賴 app/）。

PanelHeader 用 `editors` 在內部跑 EditorSwitcher 邏輯（猜測）—應改為 props-based：caller 傳 editors 進來。

### 修法

**Option A（建議）**：PanelHeader 改 props-based
- 加 prop `editors?: EditorDef[]`（或必填）
- caller（panel 們）傳入：可從 EditorContext.useEditor 取（bridge 層）
- 移除 `import { editors } from '../app/editors'`

**Option B**：在 components 層複製 / 上移 editors registry — **不推薦**，會兩處同步

### Layer & 規模

- **L3（重劃邊界）** — 跨模組依賴方向錯
- 估 diff：PanelHeader.tsx 本身 ~10-20 行 + caller（grep 用法）改 N 處（多個 panel 用 PanelHeader）
- 視 caller 多寡決定 AH 自做 / AD 派

### 下一步 → `codebase-cleanup`

先 grep 確認 PanelHeader 有幾個 caller，再決定流程。

---

## Chain 收尾

| 項 | 結論 | 下一步 |
|---|---|---|
| P0 ViewportPanel | L3 主 + L1 次 | issue → worktree → AD 拆 RenderSettingsPanel + ShadingToolbar |
| P1 ProjectPanel | L3 主 + L1 次（分階段） | 3 個小 PR — P1-a AH 直做 / P1-b 中變更 AD / P1-c hooks 拆 AD |
| P2 SceneTreePanel | 延後 | 待 refs #702 phase 1 系列收尾 |
| P3 App.tsx | L2 範圍清楚 | AH 直做 — 抽 `projectSession.ts` |
| 守護 Editor.ts | 不主動 | Editor↔AutoSave 解循環可作獨立 issue 候選 |
| Circular dep #3 | L3 根因清楚 | grep PanelHeader callers → 視規模 AH/AD |

**全 chain 一次性 vs 分批**：
- 全部走完估 1 個 P0 大 PR + 3 個 P1 小 PR + 1 個 P3 小 PR + 1 個 #3 小 PR + 1 個 Editor↔AutoSave 中 PR ≈ 7 PR
- 不建議單一 epic — 分 PR 各自獨立易 review，互不阻塞
- 建議順序：**P3 + #3** 先（小、立即清掉）→ **P1-a / b / c** 中段 → **P0** 最後（最大手術，獨立穩定環境跑）→ 最後考慮 Editor↔AutoSave

是否真的要全跑，由指揮家決定 — 本 skill 給建議，不執行。
