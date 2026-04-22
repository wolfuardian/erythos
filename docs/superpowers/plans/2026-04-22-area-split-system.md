# Self-built Split System Implementation Plan (#459a)

> **Execution Note:** Erythos 的 AT/AD/QC pipeline（見根 `CLAUDE.md`）。每個 Task 對應一個 GitHub issue。AH dispatch AT → AT 寫 `src/app/CLAUDE.md` 當前任務 → AD 實作 → QC 審 → PM merge。

**Goal:** 砍 Dockview 的 split grid，用自建 vertex topology + edge-drag resize 取代；行為與現況對等。

**Architecture:** `src/app/areaTree.ts` 為純函式資料層（vertex/edge/area + preset + resize 演算法 + min-size clamp）；`src/app/layout/AreaTreeRenderer.tsx` 訂 workspaceStore 算 area rect 渲染 AreaShell；`src/app/layout/AreaSplitter.tsx` 處理 edge pointer drag。Dockview-core 最後一個 PR 移除。

**Tech Stack:** TypeScript strict + SolidJS + vitest；無新相依、拔除 dockview-core。

**Spec reference:** `docs/superpowers/specs/2026-04-22-area-split-merge-design.md`

---

## File Structure

**新增**：
- `src/app/areaTree.ts` — 純資料 + 純函式 API
- `src/app/__tests__/areaTree.test.ts` — vitest
- `src/app/layout/AreaTreeRenderer.tsx` — 取代 DockLayout
- `src/app/layout/AreaSplitter.tsx` — edge drag 拖曳

**修改**：
- `src/app/workspaceStore.ts` — preset creator 回傳 AreaTree；loadStore v1 reset
- `src/app/AreaShell.tsx` — props 從 `{ panel: DockviewPanelApi, initialEditorType }` 改 `{ areaId }`
- `src/app/App.tsx` — `<DockLayout>` 換 `<AreaTreeRenderer>`；移除 editors→COMPONENTS 映射
- `src/app/layout/index.ts` — barrel export
- `src/components/Toolbar.tsx` — 若有 dockview import 移除
- `package.json` — 移除 `dockview-core`

**刪除**：
- `src/app/layout/DockLayout.tsx`
- `src/app/layout/solid-dockview.tsx`
- `src/app/layout/workspaceLayout.ts`

---

## Task 1: areaTree.ts 純函式 + vitest

**GitHub issue**：`[app] Wave 3-1: areaTree 純函式 + preset + vitest`

**Files:**
- Create: `src/app/areaTree.ts`
- Create: `src/app/__tests__/areaTree.test.ts`

**Depends on:** 無
**Blocks:** Task 2, 3

### Types 與 API 骨幹

```ts
// src/app/areaTree.ts
export interface ScreenVert { id: string; x: number; y: number }
export interface ScreenEdge { id: string; vertA: string; vertB: string; orientation: 'h' | 'v' }
export interface ScreenArea { id: string; verts: { bl: string; br: string; tl: string; tr: string } }
export interface AreaTree { version: 2; verts: ScreenVert[]; edges: ScreenEdge[]; areas: ScreenArea[] }

export const MIN_AREA_PX = 120;

// Preset 建構
export function createLayoutPresetTree(): AreaTree
export function createDebugPresetTree(): AreaTree
export function createBlankTree(): AreaTree

// Validation
export function validateTree(tree: unknown): tree is AreaTree

// 渲染計算
export function computeAreaRect(
  tree: AreaTree,
  areaId: string,
  containerW: number,
  containerH: number
): { left: number; top: number; width: number; height: number } | null

// 拖動連動（含 T-junction N>2 支援）
export function getEdgeDragGroup(tree: AreaTree, edgeId: string): string[]

export function resizeEdge(
  tree: AreaTree,
  edgeId: string,
  newRatio: number,
  containerSize: number
): AreaTree

export function getAllInternalEdges(tree: AreaTree): ScreenEdge[]
```

### Preset 精確拓樸

**Layout（三欄，純垂直分割）**：
- 8 verts + 10 edges + 3 areas
- 垂直內部邊：x=0.22 和 x=0.72
- Vert 座標：4 外框角 + (0.22,0), (0.22,1), (0.72,0), (0.72,1)
- Area ids：`'scene-tree'` / `'viewport'` / `'properties'`

**Debug（頂 2 欄 + 底全寬，含 T-junction）**：
- 8 verts + 10 edges + 3 areas
- 水平內部邊 y=0.6；頂部垂直內部邊 x=0.7
- T-junction vert: (0.7, 0.6)
- Area ids：`'viewport'` / `'environment'` / `'leaf'`

**Blank（新建 workspace 預設）**：
- 4 verts (純外框) + 4 edges + 1 area
- Area id：`'viewport'`

### Steps

- [ ] **Step 1.1**: 建 `areaTree.ts` 檔案骨架，寫 types / const / `generateUUID` import（`../utils/uuid`）
- [ ] **Step 1.2**: 實作 preset 三函式。Hardcode 確切 vert id（用 stable 命名如 `'vert-tl'`, `'vert-bl-col1'` 等，方便測試）或純 `generateUUID()`（spec 未強制；推 stable 命名，測試易讀）
- [ ] **Step 1.3**: `validateTree`：檢查 shape (version=2、verts/edges/areas 為陣列)、範圍 (x/y ∈ [0,1])、edge 的 vertA/vertB 存在、area.verts.bl/br/tl/tr 存在
- [ ] **Step 1.4**: `computeAreaRect`：從 area.verts 取得 bl/tr vert 座標 → `left = bl.x * W, top = tl.y * H, width = (br.x - bl.x) * W, height = (bl.y - tl.y) * H`
- [ ] **Step 1.5**: `getAllInternalEdges`：從所有 edges 中排除「兩端都在外框（x=0/1 或 y=0/1）且沿該邊界的」edges
  - 垂直外框 edge：兩 vert 都在 x=0 或都在 x=1
  - 水平外框 edge：兩 vert 都在 y=0 或都在 y=1
- [ ] **Step 1.6**: `getEdgeDragGroup(tree, edgeId)`：
  ```ts
  // 拖曳軸：垂直 edge 拖 x、水平 edge 拖 y
  // 演算法：
  // 1. 取被拖 edge 的兩端 vert
  // 2. 對每個 vert，找所有以該 vert 為端點、方向 = 被拖 edge 方向 的其他 edges
  //    若其他端點 vert 也在同 x (垂直拖) / 同 y (水平拖) → 加入 group，遞迴
  // 3. 回傳所有連通 vert id
  ```
  - 關鍵：不是「同座標全找」，而是「沿拖曳軸連通的 vert 才連動」。Debug 的 (0.7, 0.6) T-junction，水平拖 y=0.6 時連動 {(0, 0.6), (0.7, 0.6), (1, 0.6)}，因為它們都在 y=0.6 且以水平 edges 連通
- [ ] **Step 1.7**: `resizeEdge`：對 edgeId 呼 `getEdgeDragGroup` 取 group；若 vertical edge 更新所有 group vert 的 x 為 newRatio，水平則更新 y。**min-size clamp**：
  ```ts
  // newRatio 先 clamp 到 [MIN_AREA_PX/containerSize, 1 - MIN_AREA_PX/containerSize]
  // 再進一步確保：每個相鄰 area 的實際寬/高 ≥ MIN_AREA_PX
  //   用 computeAreaRect 迭代測試；若某 area 會 < MIN_AREA_PX → 以該 area 為準 clamp
  ```
  回傳新 tree（不可變）
- [ ] **Step 1.8**: vitest 測試覆蓋：
  - `createLayoutPresetTree`：8 verts / 10 edges / 3 areas、validateTree = true、所有 vert ∈ [0,1]
  - `createDebugPresetTree`：8 verts / 10 edges / 3 areas、含 vert 座標 (0.7, 0.6)
  - `createBlankTree`：4 verts / 4 edges / 1 area
  - `validateTree` false cases：`{version:1,...}` / 空物件 / vert x=1.5 / edge 引用不存在 vert
  - `computeAreaRect(Layout, 'viewport', 1000, 500)` = `{ left: 220, top: 0, width: 500, height: 500 }`（假設 x=0.22, 0.72）
  - `computeAreaRect` unknown areaId → null
  - `getAllInternalEdges(Layout)` = 2 edges（x=0.22 + x=0.72 垂直內部）
  - `getAllInternalEdges(Debug)` = 3 edges（水平內部 2 段 + 頂部垂直內部 1 段）
  - `getEdgeDragGroup(Layout, 'edge-v-x=0.22')` = 2 vert ids（N=2）
  - `getEdgeDragGroup(Debug, 'edge-h-y=0.6-left')` = 3 vert ids 含 T-junction（N=3）
  - `resizeEdge(Layout, x=0.22 edge, 0.3, 1000)` → 相關 vert 的 x 變 0.3
  - `resizeEdge` clamp：`resizeEdge(Layout, x=0.22 edge, 0.05, 1000)` → clamp 到 `MIN_AREA_PX/1000 = 0.12`
  - `resizeEdge` 純函式：原 tree 不變
- [ ] **Step 1.9**: `npm run build` 過、`npm run test -- areaTree` 全過
- [ ] **Step 1.10**: 開 PR 前還原 CLAUDE.md：`git checkout master -- src/app/CLAUDE.md`
- [ ] **Step 1.11**: Commit + PR

**Commit**：
```
[app] areaTree 純函式 + preset + vitest (refs #<issue>)
```

---

## Task 2: AreaTreeRenderer + AreaShell 改 props

**GitHub issue**：`[app] Wave 3-2: AreaTreeRenderer 渲染 + AreaShell props 重構`

**Files:**
- Create: `src/app/layout/AreaTreeRenderer.tsx`
- Modify: `src/app/AreaShell.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/workspaceStore.ts`（preset creator 改用 areaTree）

**Depends on:** Task 1
**Blocks:** Task 3

### 新 AreaTreeRenderer 骨幹

```tsx
// src/app/layout/AreaTreeRenderer.tsx
import { type Component, createSignal, createEffect, onCleanup, onMount, For } from 'solid-js';
import { store, currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';
import { AreaShell } from '../AreaShell';
import { validateTree, computeAreaRect, createLayoutPresetTree, type AreaTree } from '../areaTree';

export const AreaTreeRenderer: Component = () => {
  let containerRef!: HTMLDivElement;
  const [containerSize, setContainerSize] = createSignal({ w: 0, h: 0 });

  onMount(() => {
    const rect = containerRef.getBoundingClientRect();
    setContainerSize({ w: rect.width || 1920, h: rect.height || 1080 });

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  // 若 grid 不合法 → fallback preset（並寫回 store，修復污染狀態）
  createEffect(() => {
    const grid = currentWorkspace().grid;
    if (!validateTree(grid)) {
      mutate(s => updateCurrentWorkspace(s, { grid: createLayoutPresetTree() }));
    }
  });

  const tree = (): AreaTree => {
    const g = currentWorkspace().grid;
    return validateTree(g) ? g : createLayoutPresetTree();
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto' }}
    >
      <For each={tree().areas}>
        {(area) => {
          const rect = () => computeAreaRect(tree(), area.id, containerSize().w, containerSize().h);
          return (
            <div
              style={{
                position: 'absolute',
                left: `${rect()?.left ?? 0}px`,
                top: `${rect()?.top ?? 0}px`,
                width: `${rect()?.width ?? 0}px`,
                height: `${rect()?.height ?? 0}px`,
                overflow: 'hidden',
              }}
            >
              <AreaShell areaId={area.id} />
            </div>
          );
        }}
      </For>
      {/* Splitter 在 Task 3 加 */}
    </div>
  );
};
```

### AreaShell 改動

```tsx
// src/app/AreaShell.tsx — 新 props
interface AreaShellProps {
  areaId: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const [editorType, setET] = createSignal(
    currentWorkspace().editorTypes[props.areaId] ?? 'viewport'
  );

  const handleSetType = (nextId: string) => {
    setET(nextId);
    mutate(s => updateCurrentWorkspace(s, {
      editorTypes: {
        ...(currentWorkspace().editorTypes),
        [props.areaId]: nextId,
      },
    }));
  };

  const currentDef = () => editors.find(e => e.id === editorType());

  return (
    <AreaContext.Provider value={{
      id: props.areaId,
      get editorType() { return editorType(); },
      setEditorType: handleSetType,
    }}>
      <Show when={currentDef()}>
        {(def) => {
          const Comp = def().component;
          return <Comp />;
        }}
      </Show>
    </AreaContext.Provider>
  );
};

// Fallback 'viewport' — preset 的 editorTypes map 已完整覆蓋所有 area id。
// #459b 使用者 split 出新 area 時會臨時缺 editorType，fallback 到 viewport。
```

### App.tsx 改動

```tsx
// 移除 COMPONENTS 常數、editors.map(...)
// 把 <DockLayout components={COMPONENTS} /> 換成 <AreaTreeRenderer />
```

### workspaceStore.ts 改動

```ts
// createLayoutPreset() 的 grid 欄位：
import { createLayoutPresetTree, createDebugPresetTree } from './areaTree';

export function createLayoutPreset(): Workspace {
  return {
    id: LAYOUT_PRESET_ID,
    name: 'Layout',
    grid: createLayoutPresetTree(),
    editorTypes: {
      'scene-tree': 'scene-tree',
      'viewport': 'viewport',
      'properties': 'properties',
    },
  };
}

export function createDebugPreset(): Workspace {
  return {
    id: DEBUG_PRESET_ID,
    name: 'Debug',
    grid: createDebugPresetTree(),
    editorTypes: {
      'viewport': 'viewport',
      'environment': 'environment',
      'leaf': 'leaf',
    },
  };
}

// loadStore() 裡 v1 偵測改為「validateTree 失敗就 reset」
// migration from LEGACY_KEY：強硬 reset，不解 Dockview JSON
```

### Steps

- [ ] **Step 2.1**: 改 `workspaceStore.ts` preset creator（加 `import` from `areaTree`、改 `grid` 欄位、加 `editorTypes` 映射）
- [ ] **Step 2.2**: 改 `workspaceStore.ts` `loadStore()` — 檢查 `parsed.workspaces[i].grid` 用 `validateTree`；失敗就 reset 整個 workspace 為 preset
- [ ] **Step 2.3**: 改 `AreaShell.tsx` props 從 `{ panel, initialEditorType }` 改 `{ areaId }`，editor type 讀初始值用 `defaultEditorTypeFor(areaId)` 或 `currentWorkspace().editorTypes[areaId]`
- [ ] **Step 2.4**: 建 `AreaTreeRenderer.tsx`（如上骨幹）
- [ ] **Step 2.5**: 改 `App.tsx`：移除 COMPONENTS 映射、`<DockLayout>` → `<AreaTreeRenderer />`
- [ ] **Step 2.6**: 改 `layout/index.ts` 加 `AreaTreeRenderer` barrel export，暫留 DockLayout export（Task 4 再刪）
- [ ] **Step 2.7**: `npm run build` 過
- [ ] **Step 2.8**: 手動 QA：清 localStorage → 重整 → 看到 Layout 三欄（無拖曳功能，邊界是死的）；切 Debug → 看到正確佈局；切 workspace 畫面對應更換；視窗 resize → area 等比例縮放
- [ ] **Step 2.9**: 還原 CLAUDE.md：`git checkout master -- src/app/CLAUDE.md`
- [ ] **Step 2.10**: Commit + PR

**Commit**：
```
[app] AreaTreeRenderer + AreaShell props 重構 (refs #<issue>)
```

---

## Task 3: AreaSplitter 拖曳 resize

**GitHub issue**：`[app] Wave 3-3: AreaSplitter 邊界拖曳 resize`

**Files:**
- Create: `src/app/layout/AreaSplitter.tsx`
- Modify: `src/app/layout/AreaTreeRenderer.tsx`（渲染 splitter）

**Depends on:** Task 2
**Blocks:** Task 4

### AreaSplitter 骨幹

```tsx
// src/app/layout/AreaSplitter.tsx
import { type Component, createSignal } from 'solid-js';
import { mutate, updateCurrentWorkspace, currentWorkspace } from '../workspaceStore';
import { resizeEdge, type AreaTree, type ScreenEdge } from '../areaTree';

interface AreaSplitterProps {
  edge: ScreenEdge;
  tree: AreaTree;
  containerW: number;
  containerH: number;
}

const SPLITTER_SIZE = 4; // px

export const AreaSplitter: Component<AreaSplitterProps> = (props) => {
  // 計算 splitter 位置：垂直 edge 畫在 x=vert.x，高度為 edge 覆蓋範圍；水平同理
  const rect = () => {
    const vertA = props.tree.verts.find(v => v.id === props.edge.vertA)!;
    const vertB = props.tree.verts.find(v => v.id === props.edge.vertB)!;
    if (props.edge.orientation === 'v') {
      const x = vertA.x * props.containerW - SPLITTER_SIZE / 2;
      const yTop = Math.min(vertA.y, vertB.y) * props.containerH;
      const yBot = Math.max(vertA.y, vertB.y) * props.containerH;
      return { left: x, top: yTop, width: SPLITTER_SIZE, height: yBot - yTop };
    } else {
      const y = vertA.y * props.containerH - SPLITTER_SIZE / 2;
      const xLeft = Math.min(vertA.x, vertB.x) * props.containerW;
      const xRight = Math.max(vertA.x, vertB.x) * props.containerW;
      return { left: xLeft, top: y, width: xRight - xLeft, height: SPLITTER_SIZE };
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const vertical = props.edge.orientation === 'v';
    const containerSize = vertical ? props.containerW : props.containerH;
    const initialVert = props.tree.verts.find(v => v.id === props.edge.vertA)!;
    const startCoord = vertical ? initialVert.x : initialVert.y;
    const startClient = vertical ? e.clientX : e.clientY;

    // snapshot for Esc
    const initialTree = props.tree;

    let currentTree = props.tree;

    const onMove = (ev: PointerEvent) => {
      const deltaClient = vertical ? ev.clientX - startClient : ev.clientY - startClient;
      const newRatio = startCoord + deltaClient / containerSize;
      currentTree = resizeEdge(initialTree, props.edge.id, newRatio, containerSize);
      mutate(s => updateCurrentWorkspace(s, { grid: currentTree }));
    };

    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        mutate(s => updateCurrentWorkspace(s, { grid: initialTree }));
        onUp();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        left: `${rect().left}px`,
        top: `${rect().top}px`,
        width: `${rect().width}px`,
        height: `${rect().height}px`,
        cursor: props.edge.orientation === 'v' ? 'ew-resize' : 'ns-resize',
        'touch-action': 'none',
        'user-select': 'none',
        'z-index': 10,
      }}
    />
  );
};
```

### AreaTreeRenderer 加 splitter 渲染

```tsx
// 在 </For> 之後加第二個 <For>：
import { getAllInternalEdges } from '../areaTree';
import { AreaSplitter } from './AreaSplitter';

// ... 原 <For each={tree().areas}> 之後：
<For each={getAllInternalEdges(tree())}>
  {(edge) => (
    <AreaSplitter
      edge={edge}
      tree={tree()}
      containerW={containerSize().w}
      containerH={containerSize().h}
    />
  )}
</For>
```

### Steps

- [ ] **Step 3.1**: 建 `AreaSplitter.tsx`（上述骨幹）
- [ ] **Step 3.2**: 改 `AreaTreeRenderer.tsx` 加 splitter `<For>`
- [ ] **Step 3.3**: 改 `layout/index.ts` 加 `AreaSplitter` barrel export
- [ ] **Step 3.4**: `npm run build` 過
- [ ] **Step 3.5**: 手動 QA：
  - Layout 兩個垂直 splitter → 拖動 scene-tree / properties 寬度變化
  - Debug 水平 splitter（y=0.6）→ 拖動，**viewport 和 env 高度同時變化**（N=3 T-junction 連動；leaf 高度反向）
  - Debug 頂部垂直 splitter（x=0.7，y ∈ [0, 0.6]）→ 拖動 viewport / env 寬度
  - 拖到 min-size (120px) 停住
  - 拖動中按 Esc → 位置回到起始
  - 視窗 resize → area 與 splitter 位置 / 大小同步更新
  - Reload → 拖動後的佈局保留
- [ ] **Step 3.6**: 還原 CLAUDE.md：`git checkout master -- src/app/CLAUDE.md`
- [ ] **Step 3.7**: Commit + PR

**Commit**：
```
[app] AreaSplitter pointer drag resize (refs #<issue>)
```

---

## Task 4: 砍 Dockview

**GitHub issue**：`[app] Wave 3-4: 移除 Dockview 相依`

**Files:**
- Delete: `src/app/layout/DockLayout.tsx`
- Delete: `src/app/layout/solid-dockview.tsx`
- Delete: `src/app/layout/workspaceLayout.ts`
- Modify: `src/app/layout/index.ts`（移除刪檔的 export）
- Modify: `package.json`（移除 `dockview-core`）
- Modify: 其他引用 dockview 的檔案（逐一找掉）

**Depends on:** Task 3
**Blocks:** 無

### Steps

- [ ] **Step 4.1**: 搜尋殘留 dockview 引用：`grep -rn "dockview\|Dockview" src/`
- [ ] **Step 4.2**: 逐個檔案移除或改寫（預期應該只有 `layout/index.ts` 的 barrel export 和 `Toolbar.tsx` 若 Wave 2 之後還有 — 先搜尋確認範圍）
- [ ] **Step 4.3**: 刪 `src/app/layout/DockLayout.tsx`
- [ ] **Step 4.4**: 刪 `src/app/layout/solid-dockview.tsx`
- [ ] **Step 4.5**: 刪 `src/app/layout/workspaceLayout.ts`
- [ ] **Step 4.6**: 改 `src/app/layout/index.ts` 移除相關 export，保留 `AreaTreeRenderer` / `AreaSplitter` / `WorkspaceTabBar` / `WorkspaceTab` / `WorkspaceContextMenu`
- [ ] **Step 4.7**: `npm uninstall dockview-core`（會自動改 package.json 和 package-lock.json）
- [ ] **Step 4.8**: 搜尋 CSS：`grep -rn "dockview" src/*.css src/**/*.css 2>/dev/null`；若有 import 'dockview-core/dist/styles/dockview.css' 或 `.dv-` class 引用 → 處理
- [ ] **Step 4.9**: `npm run build` 過（若失敗說明 Step 4.1 漏了）
- [ ] **Step 4.10**: 手動 QA：清 localStorage → 開 app 行為與 Task 3 完成時一致；檢查 DevTools Network 確認 dockview JS 不被載入
- [ ] **Step 4.11**: 還原 CLAUDE.md：`git checkout master -- src/app/CLAUDE.md`
- [ ] **Step 4.12**: Commit + PR

**Commit**：
```
[app] 移除 dockview-core 相依 + 刪舊 DockLayout (refs #<issue>)
```

---

## 依賴關係總覽

```
Task 1 (areaTree + vitest) ──→ Task 2 (AreaTreeRenderer) ──→ Task 3 (AreaSplitter) ──→ Task 4 (砍 Dockview)
```

**序列執行**，無並行空間（每一步建立在前一步之上）。

---

## 已知限制（本 plan 不解，#459b 後續）

1. 角落拖曳 split / merge 互動
2. Area split 時拓樸維護演算法（T-junction 動態產生 / 消除）
3. Area 跨 workspace 拖動
4. 觸控 gesture

---

## Commit message 慣例

所有 commit 用 `[app]` 前綴。每個 PR 結尾帶 `refs #<sub-issue>`。PR 前記得 `git checkout master -- src/app/CLAUDE.md` 還原模組 CLAUDE.md。
