# Codebase Health Report — Post-Chain

範圍：`src/*`（含 `__tests__/`）
時間窗：全期 git history（1122 commits，比 baseline +10）
跑日：2026-05-04（chain merge 後）

對照 baseline：`health-2026-05-04.md`（chain 前）

---

## 演化熱點（top 10，churn × size）

| # | 檔案 | churn | size | score | 解讀（含 baseline 對比） |
|---|---|---:|---:|---:|---|
| 1 | src/panels/viewport/ViewportPanel.tsx | 60 | 643 | 38,580 | **仍居首**（baseline 1061→643 -39%）— 拆 RenderSettingsPanel + ShadingToolbar 後尺寸大降但 churn +1（split commit），仍最常被改。**這證實 churn-driven 非 size-driven** — 即使精瘦化，viewport 仍是 feature 主戰場。 |
| 2 | src/panels/scene-tree/SceneTreePanel.tsx | 44 | 396 | 17,424 | 同模式（baseline 840→396 -53%，churn 43→44）。score 從 36k 降到 17k — 約 1/2，splits 確實降低風險暴露。 |
| 3 | src/panels/project/ProjectPanel.tsx | 23 | 692 | 15,916 | baseline 809→692 -14%，churn 20→23（chain 自身觸動 +3）。score 略降（16,180→15,916）。三大 P1 拆分（ProjectTypeIcon / menuItems / hooks）效果有限 — 因為核心 panel 邏輯仍在原檔。 |
| 4 | src/app/App.tsx | 36 | 245 | 8,820 | **新晉 #4**（baseline 33×249=8,217）。每個 chain PR 都動了 App.tsx（projectSession 抽出、AutoSave 接 lifecycle、NewProjectModal 接 caller）— 是「黏合層」性質的高 churn。 |
| 5 | src/components/NumberDrag.tsx | 19 | 320 | 6,080 | 不變（chain 沒動到這檔）。仍是 fix-heavy 元件但 LadderOverlay 已外抽，core drag 320 行屬合理。 |
| 6 | src/app/bridge.ts | 22 | 231 | 5,082 | 微升（baseline 21×228=4,788）— AutoSave fix 加 autosaveFlush dep 觸動 +1。 |
| 7 | src/viewport/Viewport.ts | 21 | 213 | 4,473 | 不變。 |
| 8 | src/components/Toolbar.tsx | 30 | 149 | 4,470 | 不變。 |
| 9 | src/core/project/ProjectManager.ts | 13 | 330 | 4,290 | 不變。 |
| 10 | src/viewport/ShadingManager.ts | 14 | 255 | 3,570 | 不變。 |

**離開 top 10**：
- ProjectChip（baseline #6 score 5,412）→ 451→187 拆 RecentProjectsDropdown 後出榜
- Welcome（baseline #11 score 4,256）→ 608→386 拆 NewProjectModal 後降到外圍
- ProjectChip 升 churn 13→16 但 size 砍半，score 已落榜外

---

## 耦合

### 循環依賴：1 個（baseline 3）

```
1) core/Editor.ts ↔ core/Command.ts
```

剩這條是 Command 模式契約核心（Command 需 Editor 介面、Editor 需 Command 型別），業界常見可接受。

**已解**：
- (2) Editor↔AutoSave — #714 改 createAutoSave factory pattern
- (3) editors→context→PanelHeader 鏈 — #712 改 useEditorsRegistry hook 注入

### Fan-out top 10

| # | 檔案 | imports | 變化 |
|---|---|---:|---|
| 1 | panels/viewport/ViewportPanel.tsx | 20 | +1（baseline 19）— 加 import RenderSettingsPanel + ShadingToolbar 但移掉 NumberDrag |
| 2 | core/Editor.ts | 14 | -1（baseline 15）— 移掉 AutoSave |
| 3 | app/App.tsx | 12 | +3（baseline 9）— 加 createAutoSave + projectSession + NewProjectModal |
| 3 | panels/project/ProjectPanel.tsx | 12 | +4（baseline 8）— 加 ProjectTypeIcon + projectMenuItems + useNewSceneFlow + useDeleteFlow |
| 3 | panels/scene-tree/SceneTreePanel.tsx | 12 | -1（baseline 13）— 加 TreeNode + sceneTreeMenuItems 但移掉部分 inline import |
| 6 | core/commands/index.ts | 10 | 不變 |
| 6 | core/index.ts | 10 | 不變 |
| 8 | app/bridge.ts | 9 | 不變 |
| 8 | app/editors.ts | 9 | 不變 |
| 8 | viewport/Viewport.ts | 9 | 不變 |

**洞察**：chain 的拆檔讓 fan-out 在 ProjectPanel + App.tsx 上升 — 因為新拆出的 helper 都需要 import。這是 chain 的真實「複雜度搬家」帳單：減少單檔內部複雜度，新增了跨檔 import 依賴關係。

---

## 程式碼健康

### 過大檔案（>500 行）：4 個（baseline 6）

| 檔 | 行數 | 變化 |
|---|---:|---|
| src/app/areaTree.ts | 803 | 不變（pure function library，complexity 評估「不動」） |
| src/panels/project/ProjectPanel.tsx | 692 | -117（809→692） |
| src/panels/viewport/ViewportPanel.tsx | 643 | **-418**（1061→643） |
| src/app/__tests__/areaTree.test.ts | 541 | 不變（pair test） |

**離開警戒**：
- SceneTreePanel.tsx 840→396 ✓
- Welcome.tsx 608→386 ✓

### 重複率：2.77%（54 clones / 595 dup lines / 190 files）

baseline 2.79%，幾乎無變化。chain 拆檔過程沒引入新重複。

### 巢狀深度：未跑（無 ESLint config，沿襲 baseline）

---

## 結構深度：4 層（不變）

健康，遠低警戒（>6）。

---

## 主觀補強（top 5 熱點分析）

### 1. ViewportPanel.tsx — 仍 L3 候選但程度大降

雖然 RenderSettingsPanel 已外抽，剩下的 643 行內仍有 12 條 createEffect + 10+ 個 createSignal + onMount 內 280 行 transform/drag/keyboard handler。**未來 P0-FU**（如 SceneOpsToolbar 整合 / 新 transform mode）可能進一步拆 onMount 內子段。但當前 643 行屬「panel 本職」尺寸，churn 主因是 viewport 是 feature 主戰場 — **這是業務本質，不是設計問題**。

### 2. SceneTreePanel.tsx — 已拆完，churn 屬正常

396 行 + TreeNode 已外抽 + menuItems 已 pure function。剩下 396 行純 panel 邏輯（state + effects + JSX shell）。score 從 36k 降到 17k 屬決定性改善。**目前 healthy state，無需再動**。

### 3. ProjectPanel.tsx — L3 拆得不夠徹底

692 行 + 已抽 4 helper（ProjectTypeIcon / menuItems / useNewSceneFlow / useDeleteFlow）但剩下 panel body 仍含：folder tree + grid view + list view + multi-select state + drag-drop + 4 dialog 渲染。複雜度搬到 helper 但 panel 主檔仍重。**下次評估候選**：folder tree 與 asset views 拆 sub-component（grid view / list view 各約 80-100 行 JSX）。

### 4. App.tsx — L2，黏合層本質

245 行做：bootstrap + project open/close lifecycle + scene resolve + autosave handle wire + restore-on-mount。chain 後 churn 反而升（每個 chain PR 都涉及 App.tsx）— 這是「集中黏合」應有的代價，非設計問題。**不建議再動**。

### 5. NumberDrag.tsx — 不變，本質難（L1）

chain 沒動，狀態同 baseline。drag input 數學細節 + 瀏覽器 API + 硬體輸入抽象的本質難度，不是設計問題。

---

## 跨指標危險區（關聯排序）

| 檔案 | 在哪幾條清單上？ | 處置 |
|---|---|---|
| **ViewportPanel.tsx** | hotspot #1 + fan-out #1 + 過大 #3 | 三項全中。但已 chain #717 處理過一輪，churn 仍高是業務本質。下次大版本 viewport 重設計時再評估。 |
| **ProjectPanel.tsx** | hotspot #3 + fan-out #3 + 過大 #2 | 三項全中。可考慮 P1-d 補拆（folder tree / asset views）但回收價值遞減。 |
| areaTree.ts | 過大 #1（單條，無 churn） | 「複雜但穩定」象限，complexity 評估「不動」。 |
| App.tsx | hotspot #4 + fan-out #3 | 黏合層應有的雙高，不建議動。 |
| Editor.ts | fan-out #2 + cycle 端點 | 守護名單，動它必派 QC。 |

---

## 限制聲明

不變於 baseline：
- 隱式耦合（bridge signals / EventEmitter / 全域 store）未涵蓋
- 語意重複（概念上重複但 code 不同）未涵蓋
- 業務邊界合理性未涵蓋
- 25 天樣本（現 28 天），churn 趨勢仍無法判定長期
- 巢狀深度未自動量化
- fan-out ≠ fan-in
- audit scripts 是視覺截圖工具，不在 health 範圍

---

## 趨勢（baseline → post-chain）

| 指標 | Baseline | Post-chain | Δ |
|---|---:|---:|---:|
| 循環依賴 | 3 | 1 | **-2 ✓** |
| 過大檔案 (>500) | 6 | 4 | **-2 ✓** |
| top 1 hotspot score | 62,599 (ViewportPanel) | 38,580 (同) | **-38%** |
| top 3 hotspot 平均 score | (62,599+36,120+16,180)/3 = 38,300 | (38,580+17,424+15,916)/3 = 23,973 | **-37%** |
| 總檔案數 | 126 | 138 | +12（chain 新增） |
| 總 LOC | 16,782 | 17,147 | +365（boilerplate cost） |
| 重複率 | 2.79% | 2.77% | 持平（chain 沒引入新 duplicate）|

**重要洞察**：score 降 37% 但 hotspot 排序不變 — chain 動的就是 top 3 的 size 軸，churn 軸是業務本質難動。下次再跑要看的是「同檔在 top 連續上榜幾次」— 這是「真正該重新設計」的訊號。

---

## 下一步建議 → Chain

主要選項：

1. **結束本輪 chain，跑下次 health** — 等下個季度，看 hotspot 排序有無變化。若 ViewportPanel / ProjectPanel / SceneTreePanel 連續 2 季穩居 top 3 且 churn 仍高 → 可能該動「邊界劃法」（不只內部拆）。
2. **補拆 ProjectPanel folder tree + asset views** — 補完三大 panel 對稱拆解。但價值遞減，可緩做。
3. **不再拆檔，改投資 module CLAUDE.md feature map** — 對 agent 維護幫助可能大於繼續拆。每個 panel 模組 CLAUDE.md 補一段「主要 flow → 對應檔案」索引。
4. **守護 Editor.ts** — 仍是耦合中心 + 1 條 cycle 端點。任何 Editor 動線改動仍走高風險 PR + QC。

**建議優先序**：3 > 1 > 2，不必再走 chain refactor。
