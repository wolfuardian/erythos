# Self-built Split System — Design Spec (#459a)

**Issue**: #459a（split #459 的第一階段）
**Parent**: #459（Wave 3 Area split/merge 系列）
**Date**: 2026-04-22
**Status**: Draft (pending user approval)
**Scope**: 砍 Dockview 的 split grid + resize + toJSON/fromJSON，用自建 vertex topology 取代，行為與現況對等（不含角落 split/merge 互動）

---

## 背景

Wave 2 完成後 Erythos 的 layout 架構：
- Dockview `DockviewComponent` 提供 split grid + 邊界拖曳 resize + toJSON 序列化
- Wave 1 已 `disableDnd: true` 並以 CSS 隱藏 tab bar，Dockview 只剩 split grid 在用
- AreaShell 包每個 panel、由 workspaceStore 持久化每 workspace 的 grid + editorTypes

**#459（parent）目標**：真正 Blender 式 Area split/merge（角落拖曳分割 / 合併相鄰 area）。此功能超過 Dockview 能表達範圍，必須自幹 split tree + 拓樸演算法。

**本 issue (#459a) 範圍**：先把底層 Dockview 替換為自建 vertex topology + edge-drag resize，達成**行為與現況對等**的可用狀態；#459b 再加角落 split/merge 互動。

**為何分階段**：一次替換 + 加新功能 PR 太大、中途卡住不可 revert。Wave 2 驗證「保留底層 + 漸進抽象」有效，反向的「漸進替換底層」同樣適用。

---

## 範圍決策（brainstorm 結論）

| 項目 | 決策 |
|------|------|
| 砍 Dockview 策略 | 分階段：#459a 資料模型 + resize（對等）→ #459b 角落 split/merge 互動 |
| 資料結構 | Vertex topology（Blender 真實模型），支援 T-junction |
| 座標系統 | 正規化比例 [0, 1]；視窗 resize 時 area 等比縮放 |
| Min-size | 常數 `MIN_AREA_PX = 120`；拖曳時 clamp，被動縮小不 clamp（加 scrollbar 解決） |
| Migration from v1 Dockview JSON | B 強硬：偵測到 v1 → 直接 reset 為 preset，不通知、不嘗試保留、不寫轉換 |
| Undo 整合 | 不進 Editor undo stack（與 Wave 2 workspace 操作一致） |

---

## 資料模型

**新檔 `src/app/areaTree.ts`**

```ts
export interface ScreenVert {
  id: string;
  x: number;   // normalized [0, 1]
  y: number;   // normalized [0, 1]，0 在頂、1 在底（跟 CSS top 一致）
}

export interface ScreenEdge {
  id: string;
  vertA: string;               // vert id
  vertB: string;               // vert id
  orientation: 'h' | 'v';      // h = 水平（兩 vert 同 y）；v = 垂直（兩 vert 同 x）
}

export interface ScreenArea {
  id: string;
  verts: {
    bl: string; br: string; tl: string; tr: string;
  };                            // 4 個角落 vert id
}

export interface AreaTree {
  version: 2;
  verts: ScreenVert[];
  edges: ScreenEdge[];
  areas: ScreenArea[];
}

export const MIN_AREA_PX = 120;
```

### 不變量（invariants）

1. 所有 edge 軸向（水平或垂直，非斜）
2. 每個 area 是矩形（4 個 vert 對齊）
3. 每個 vert 座標 ∈ [0, 1]
4. 外邊界固定有 4 個角 vert（corners of (0,0) / (1,0) / (0,1) / (1,1)）與 4 個邊框 edge
5. 內部 edge 分割相鄰 area
6. `Area.verts.{bl,br,tl,tr}` 各自引用存在的 `ScreenVert.id`

### 純函式 API

```ts
// Preset 建構
export function createLayoutPresetTree(): AreaTree
export function createDebugPresetTree(): AreaTree
export function createBlankTree(): AreaTree

// 驗證
export function validateTree(tree: unknown): tree is AreaTree  // shape + 不變量檢查

// 渲染計算
export function computeAreaRect(
  tree: AreaTree,
  areaId: string,
  containerW: number,
  containerH: number
): { left: number; top: number; width: number; height: number } | null

// 拖動連動
export function getEdgeDragGroup(tree: AreaTree, edgeId: string): string[]
// 演算法：找所有與被拖 edge 共線且連通的 verts（沿拖曳軸）
// Debug preset 的水平內部 edge 就會觸發 N=3 case（T-junction）

export function resizeEdge(
  tree: AreaTree,
  edgeId: string,
  newRatio: number,
  containerSize: number  // 用來檢查 MIN_AREA_PX
): AreaTree  // 純函式更新；違反 min-size 則 clamp

export function getAllInternalEdges(tree: AreaTree): ScreenEdge[]
```

### Preset 初始拓樸

**Layout（三欄，pure vertical split）**：
```
┌──────┬────────┬──────┐
│scene │viewport│props │
└──────┴────────┴──────┘
```
精確拓樸：
- **Verts (8)**：4 外框角 + 4 內部垂直交界
  - (0,0), (1,0), (0,1), (1,1) — 外框
  - (0.22, 0), (0.22, 1), (0.72, 0), (0.72, 1) — 內部
- **Edges (10)**：
  - 水平上邊 3 段：(0,0)-(0.22,0), (0.22,0)-(0.72,0), (0.72,0)-(1,0)
  - 水平下邊 3 段：(0,1)-(0.22,1), (0.22,1)-(0.72,1), (0.72,1)-(1,1)
  - 垂直左外框 1：(0,0)-(0,1)
  - 垂直右外框 1：(1,0)-(1,1)
  - 垂直內部 2：(0.22,0)-(0.22,1), (0.72,0)-(0.72,1)
- **Areas (3)**：scene-tree / viewport / properties

Drag 行為：拖垂直內部 edge（如 x=0.22）→ `getEdgeDragGroup` 回 {(0.22,0), (0.22,1)} = N=2。

> 注意外框頂/底邊的 (0.22, 0) / (0.72, 0) 等是 T-junction（3 edges 匯集），但在 x 方向拖動時只影響 x 座標，y 不變，所以這些 T-junction 不影響 N=2 結論。

**Debug（頂兩欄 + 底全寬）**：
```
┌──────────┬─────┐
│ viewport │ env │
├──────────┴─────┤
│     leaf       │
└────────────────┘
```
精確拓樸：
- **Verts (8)**：4 外框角 + 2 中間水平線交界 + 1 頂部垂直交界 + 1 中央 T-junction
  - (0,0), (1,0), (0,1), (1,1) — 外框
  - (0.7, 0) — 頂部垂直分割與上邊交界
  - (0, 0.6), (1, 0.6) — 中間水平線與左右外框交界
  - (0.7, 0.6) — **T-junction**（viewport/env 垂直分割 與 leaf 頂邊 交於此點）
- **Edges (10)**：
  - 水平上邊 2 段：(0,0)-(0.7,0), (0.7,0)-(1,0)
  - 水平下邊 1：(0,1)-(1,1)
  - 垂直左外框 2 段：(0,0)-(0,0.6), (0,0.6)-(0,1)
  - 垂直右外框 2 段：(1,0)-(1,0.6), (1,0.6)-(1,1)
  - 水平內部 2 段：(0,0.6)-(0.7,0.6), (0.7,0.6)-(1,0.6)
  - 垂直內部 1：(0.7,0)-(0.7,0.6)
- **Areas (3)**：viewport / env / leaf

Drag 行為：
- 拖**水平內部 edge**（y=0.6）→ `getEdgeDragGroup` 回 {(0, 0.6), (0.7, 0.6), (1, 0.6)} = **N=3**（T-junction 連動）
- 拖**頂部垂直內部 edge**（x=0.7，僅上半段）→ group = {(0.7, 0), (0.7, 0.6)} = N=2

> Debug preset 故意保留 T-junction 場景，讓 #459a 的拖動演算法從一開始就正確處理 N>2。若 preset 全無 T-junction，#459b 再補會留下 latent bug 可能。

**Blank（新建 workspace 預設）**：
```
┌────────────────┐
│                │
│   viewport     │
│                │
└────────────────┘
```
- 4 verts（純外框角）、4 edges（純外框）、1 area

---

## 組件結構

```
App.tsx
 ├─ Toolbar
 ├─ WorkspaceTabBar
 ├─ AreaTreeRenderer  ◄── 新，取代 DockLayout
 │    ├─ For each area:
 │    │    └─ AreaShell (existing)
 │    │         └─ <Editor />
 │    └─ For each internal edge:
 │         └─ AreaSplitter
 └─ StatusBar
```

### 新組件

**`src/app/layout/AreaTreeRenderer.tsx`**：
- Props：無
- 訂 `workspaceStore.currentWorkspace()` 取 `.grid`；若非 `AreaTree v2`（用 `validateTree` 判斷）→ fallback `createLayoutPresetTree()`
- 容器：`div` 滿版，`position: relative`
- ResizeObserver 容器 → 更新 `containerW/H` signal
- `<For each={tree.areas}>` 渲染 area：絕對定位，`left/top/width/height` 由 `computeAreaRect(tree, area.id, containerW, containerH)` 算
- `<For each={getAllInternalEdges(tree)}>` 渲染 splitter

**`src/app/layout/AreaSplitter.tsx`**：
- Props：`{ edge: ScreenEdge, tree: AreaTree, containerW: number, containerH: number }`
- 單一 edge 的 splitter bar（寬度 4px，`cursor: ew-resize` / `ns-resize` 依 orientation）
- `onPointerDown` → `setPointerCapture` + 記 startX/Y + 起始 ratio
- window pointermove → 計算 newRatio → `mutate(s => updateCurrentWorkspace(s, { grid: resizeEdge(tree, edge.id, newRatio, containerSize) }))`
  - 拖曳期間持續寫 store（Wave 2 已有 debounce 機制包 store，不需額外節流）
- `onPointerUp` → 清 drag state（Esc 要恢復？見 error handling）

### 修改

**`src/app/AreaShell.tsx`**：
- 原接 `DockviewPanelApi`，改接 `{ areaId: string }` prop
- `editorType` 讀寫邏輯維持（Wave 2 已集中在 workspaceStore）
- 不自己處理 ResizeObserver（Editor 內需 size 的自己處理，見下）

**`src/app/App.tsx`**：
- `<DockLayout components={COMPONENTS} />` → `<AreaTreeRenderer />`
- 移除 `COMPONENTS` 常數（Dockview panel component 映射不再需要）
- 移除 `AreaShell` 外包 HOC `(props) => <AreaShell panel={props.panel} initialEditorType={e.id} />`

**`src/app/workspaceStore.ts`**：
- `Workspace.grid` 型別保持 `unknown`（runtime 用 `validateTree` 檢查）
- `createLayoutPreset()` / `createDebugPreset()` 的 `grid` 欄位改存 `createLayoutPresetTree()` / `createDebugPresetTree()` 結果
- `loadStore()` 對舊 key / v1 schema 一律 reset（B 強硬）

### 刪除

- `src/app/layout/DockLayout.tsx`
- `src/app/layout/solid-dockview.tsx`
- `src/app/layout/workspaceLayout.ts`（applyPresetFallback 邏輯拆到 preset creator）
- `package.json` 的 `dockview-core` 相依（最後一個 PR 做；提早刪會 build 失敗）

### Viewport resize 整合

**無需額外 wiring**。`ViewportRenderer` 內部已自帶 `ResizeObserver`（`src/viewport/ViewportRenderer.ts:14, 45, 49`）觀察 mount container。

`AreaTreeRenderer` 改 area rect → AreaShell 容器大小變 → Viewport 內部 ViewportRenderer 的 ResizeObserver 自動觸發 → `renderer.setSize(w, h)` + PostProcessing setSize。無需透過 AreaContext 推 size signal。

其他 panel（SceneTree / Properties / Leaf / Environment / Settings / Context / Project）是純 HTML，CSS 100% 自適應，不需 resize 邏輯。

---

## 資料流 & 生命週期

### 啟動

```
App mount
 → workspaceStore load
 → AreaTreeRenderer mount
    ├─ containerRef.getBoundingClientRect() → containerW/H 初始值
    ├─ ResizeObserver 容器 → 持續更新 containerW/H signal
    ├─ currentWorkspace().grid → validateTree → 用；否則 createLayoutPresetTree()
    ├─ <For tree.areas>：AreaShell 以 area.id 為 key
    └─ <For getAllInternalEdges(tree)>：AreaSplitter
```

### Edge drag resize

```
pointerdown on AreaSplitter
 → setPointerCapture(e.pointerId)
 → 記 startX (or startY) + 起始 edge ratio
 → window pointermove:
    ├─ Δ = e.clientX - startX（垂直 edge） / Δ = e.clientY - startY（水平 edge）
    ├─ newRatio = startRatio + Δ / containerSize
    ├─ mutate(s => updateCurrentWorkspace(s, {
    │    grid: resizeEdge(tree, edge.id, newRatio, containerSize)  // 內部 clamp min-size
    │  }))
    └─ AreaTreeRenderer 的 grid signal 變 → 重算 area rect → 重 render
 → pointerup:
    └─ window listener 解除；無特殊收尾（state 已即時同步）
```

### 切 workspace

```
currentWorkspaceId 變
 → currentWorkspace() 讀取新 workspace.grid
 → createEffect 裡 tree signal 更新
 → <For tree.areas> 以 area.id 為 key diff：舊 area unmount、新 area mount
 → AreaShell unmount 觸發 Editor unmount（viewportState save 等生命週期繼承 Wave 2 行為）
 → containerW/H 不變（無 api.clear() 操作）
```

### 容器視窗 resize

```
window resize
 → 容器 ResizeObserver → containerW/H signal 更新
 → <For tree.areas> 的每個 area rect 用新 containerW/H 重算
 → AreaShell 容器大小變 → Viewport 內部 ResizeObserver 觸發 setSize
 → 其他 panel CSS 自適應
```

---

## Error handling

| 情境 | 處理 |
|------|------|
| `currentWorkspace().grid` undefined / null | `createLayoutPresetTree()` fallback |
| `grid` 為 v1 Dockview JSON（version ≠ 2） | 直接 reset 為 preset（B 強硬，無 toast） |
| `grid` 為 v2 但 `validateTree` 失敗（不變量破損） | reset 為 preset |
| 容器 `getBoundingClientRect()` 回 0（極少見） | fallback 1920×1080，下一 tick ResizeObserver override |
| Drag 期間 Esc | 記 drag 開始時 tree snapshot；Esc → 恢復 snapshot + pointerup cleanup |
| Drag 期間 pointer 滑出容器 | 不中斷（pointerCapture + window listener 已含） |
| Min-size 約束（視窗被動縮小導致 area < MIN_AREA_PX） | 不強制 clamp，讓 area 允許低於 MIN_AREA_PX；AreaTreeRenderer 容器加 `overflow: auto` 讓小視窗出 scrollbar |

**不做**：
- Undo（承 Wave 2 決議）
- 拖曳預覽 ghost（即時 state sync 已夠）
- 跨 tab localStorage 同步
- 觸控 / 手機 gesture（桌面優先）

---

## 測試

**新測試 `src/app/__tests__/areaTree.test.ts`**（vitest，純函式）：

### shape / 不變量
- `createLayoutPresetTree()` 產生：verts / edges / areas 數量正確、version=2、所有 vert 座標 ∈ [0,1]、4 個外框 vert 存在、所有 edge 軸向
- `createDebugPresetTree()` 同上
- `createBlankTree()`：1 area、4 verts、4 edges（外框）
- `validateTree(validTree)` = true
- `validateTree({version:1, ...})` = false
- `validateTree({version:2, verts:[{id:'x', x:1.5, y:0}], ...})` = false（x 超 1）
- `validateTree(emptyObject)` = false

### 渲染計算
- `computeAreaRect(tree, areaId, 1920, 1080)`：對 Layout scene-tree area 的 rect 符合期望（left=0, width=0.22*1920 等）
- Unknown areaId → null

### 拖動連動
- `getAllInternalEdges(Layout)`：回 2（中間兩條垂直內部 edge）；排除外框
- `getAllInternalEdges(Debug)`：回 3（2 水平內部 + 1 垂直內部）；排除外框
- `getEdgeDragGroup(Layout, v-interior-0.22)`：回 2 個 vert id（N=2）
- `getEdgeDragGroup(Debug, h-interior-y=0.6)`：回 **3** 個 vert id（N=3，含 T-junction vert (0.7, 0.6)）
- `getEdgeDragGroup(Debug, v-interior-x=0.7-top)`：回 2 個 vert id

### resize 純函式
- `resizeEdge(Layout, v-edge-1, 0.3, 1000)`：相關 vert x 被更新到 0.3
- `resizeEdge` 違反 min-size：`resizeEdge(Layout, v-edge-1, 0.05, 1000)` → ratio clamp 到 `MIN_AREA_PX/1000 = 0.12`
- `resizeEdge` 返回新 tree（不可變，不改原 tree）

**不寫**：
- AreaTreeRenderer integration 測試（DOM + pointer events + ResizeObserver）
- AreaSplitter 互動測試
- Viewport resize 整合測試（依賴 Three.js + jsdom 不支援 WebGL）

靠 build + 手動 QA + `role-pr-qc` diff 審查把關。

### 手動 QA

1. 清 localStorage → 開 app → 看到 Layout preset 三欄
2. 拖中間兩 splitter → area 寬度變化順暢，無閃爍 / 跳動
3. 切 Debug → 看到 viewport + env 頂部、leaf 全寬底部
4. 視窗 resize → area 等比跟著變
5. 拖到 min-size → 停住不能再壓扁
6. Reload → 拖動過的佈局保留
7. Viewport 拖邊 resize → Three.js canvas 跟著變
8. 新建 workspace（`+`）從 Layout 複製 → 新 tab 顯示同 Layout 佈局
9. 不存在 `dockview-core` import：`grep -rn "dockview" src/` 應無結果（docs 可能有）

---

## 已知限制（#459a 範圍外）

1. **T-junction 透過 split 動態產生**：本 issue preset 有 T-junction（Debug）驗證基本演算法；#459b 的 split/merge 會產生更複雜拓樸，彼時再全面壓測
2. **角落 drag 觸發 split / merge**：#459b 範圍
3. **Area 跨 workspace 拖動 / 重排**：不在規劃
4. **觸控設備 gesture**：桌面優先
5. **Editor UI state 切 workspace 重置**：#460 範圍

---

## 實作拆分建議（writing-plans 階段用）

初步建議切 3-4 個子 issue：

1. **#459a-1**：`areaTree.ts` 純函式 + vitest（data model + preset creator + resize + validate + computeRect）— 獨立、無 UI 依賴
2. **#459a-2**：`AreaTreeRenderer` 基本渲染 + AreaShell 對接（不含拖曳；畫面對等 Dockview，preset 看起來一樣）
3. **#459a-3**：`AreaSplitter` 拖曳 resize（完成行為對等）
4. **#459a-4**：砍 Dockview（刪 DockLayout / solid-dockview / workspaceLayout；移 package.json dockview-core；更新 CLAUDE.md）

依賴：1 → 2 → 3 → 4。每 PR 獨立可驗證。

---

## Commit message 慣例

所有 commit 用 `[app]` 前綴（與 Wave 1/2 一致）。每個 PR 結尾帶 `refs #<sub-issue>`。
