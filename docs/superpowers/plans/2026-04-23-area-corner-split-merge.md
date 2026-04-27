# Area Corner Split/Merge Implementation Plan (#459b)

> **Execution Note:** Erythos 的 AT/AD/QC pipeline（見根 `CLAUDE.md`）。每個 Task 對應一個 GitHub issue。AH dispatch AT → AT 寫 `src/app/CLAUDE.md` 當前任務 → AD 實作 → QC 審 → PM merge。

**Goal:** 在 Phase 1 vertex topology 之上加 Blender 式 corner drag split/merge 互動；從 area 角落拖曳即可切 area 或吃掉鄰居。

**Architecture:** `src/app/areaTree.ts` 擴充純函式（splitArea / mergeArea / canSplit / canMerge / getCornerAt / getCornerNeighbors / getAreaAt）處理拓樸；新 `src/app/cornerDragStore.ts` 管 drag state machine（idle / pending / active{split|merge|invalid}）；新 `src/app/layout/AreaCornerHandle.tsx` 掛在每個 area 4 角落接 pointerdown；`AreaTreeRenderer` 讀 cornerDragStore，active 時 render `previewTree` 取代 `workspace.grid`，並覆蓋一層 cursor badge overlay。

**Tech Stack:** TypeScript strict + SolidJS + vitest；無新相依。沿用 Phase 1 pattern（mutate workspaceStore、無 Command，初始 tree snapshot + Esc cancel）。

**Spec reference:** `docs/superpowers/specs/2026-04-23-area-corner-split-merge-design.md`

---

## File Structure

**新增**：
- `src/app/cornerDragStore.ts` — signal + state types
- `src/app/layout/AreaCornerHandle.tsx` — 16×16 hit area 元件 + pointerdown trigger

**修改**：
- `src/app/areaTree.ts` — 加 splitArea / mergeArea / canSplit / canMerge / getCornerAt / getCornerNeighbors / getAreaAt 純函式
- `src/app/__tests__/areaTree.test.ts` — +40 test（拓樸、鄰居、hit-test、min-size）
- `src/app/layout/AreaTreeRenderer.tsx` — active 時讀 previewTree、掛 AreaCornerHandle × 4 per area、cursor badge overlay
- `src/app/layout/index.ts` — barrel export AreaCornerHandle

**不動**：
- `src/app/workspaceStore.ts` — preview 期間不寫 workspaceStore，commit 時才 mutate 一次（保 Phase 1 sync 模式）
- `src/app/AreaShell.tsx`、`App.tsx`、核心 Editor 結構 — 與本 feat 無關

---

## Task 1: areaTree 純函式擴充 + vitest

**GitHub issue**：`[app] Wave 4-1: areaTree corner split/merge 純函式 + vitest (refs #459b)`

**Files:**
- Modify: `src/app/areaTree.ts`
- Modify: `src/app/__tests__/areaTree.test.ts`

**Depends on:** 無（Phase 1 areaTree 已 merged）
**Blocks:** Task 2, 3

### 新 API 骨幹

```ts
// src/app/areaTree.ts 新增匯出

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type Direction = 'n' | 's' | 'e' | 'w';

// Point-in-area hit test（cursor 落在哪個 area）
export function getAreaAt(
  tree: AreaTree,
  x: number, y: number,             // normalized [0,1]
): string | null;

// Corner hover 偵測（以像素 hitRadius 換算到 normalized，再落在哪個 area 的哪個 corner）
export function getCornerAt(
  tree: AreaTree,
  x: number, y: number,             // normalized [0,1]
  containerW: number, containerH: number,
  hitRadiusPx?: number,             // default 16
): { areaId: string; corner: Corner } | null;

// 由 (areaId, corner) 找出「共享該 corner 的」鄰居清單，供 merge 使用
export function getCornerNeighbors(
  tree: AreaTree,
  areaId: string,
  corner: Corner,
): Array<{
  neighborAreaId: string;
  sharedEdgeId: string;
  direction: Direction;             // 鄰居相對 src 的方位
}>;

// 拓樸操作（純函式，回傳新 tree）
export function splitArea(
  tree: AreaTree,
  areaId: string,
  axis: 'h' | 'v',
  ratio: number,                    // split 線在 area 內部的 normalized 位置 [0,1]
  newAreaId: string,                // 呼叫者預先生成 id（外部決定，為後續可接 Command）
  newVertIds?: { a: string; b: string },  // 呼叫者可選傳入，否則 `vert-${newAreaId}-a/b`
): AreaTree;

export function mergeArea(
  tree: AreaTree,
  srcAreaId: string,                // 擴張，id 保留
  dstAreaId: string,                // 被吃掉，必須是 src 鄰居
): AreaTree;

// 可行性判定
export function canSplit(
  tree: AreaTree,
  areaId: string,
  axis: 'h' | 'v',
  ratio: number,
  containerW: number, containerH: number,
  minPx?: number,                   // default MIN_AREA_PX
): boolean;

export function canMerge(
  tree: AreaTree,
  srcAreaId: string,
  dstAreaId: string,
): boolean;
```

### 演算法摘要

**`getAreaAt(tree, x, y)`**: 遍歷 `tree.areas`，用 `computeAreaRect(tree, area.id, 1, 1)` 取得 normalized rect（`containerW=1, H=1` 等同 normalized 輸出），測 `left ≤ x < left+width && top ≤ y < top+height`。第一個命中的 area 回傳 id；無命中回 null（viewport 外 / 交界線上）。O(N_areas)。

**`getCornerAt(tree, x, y, W, H, radiusPx=16)`**:
1. 計算 `rx = radiusPx / W`, `ry = radiusPx / H`
2. 遍歷 areas，對每個 area 的 4 個 corner vert 測試 `|vert.x - x| < rx && |vert.y - y| < ry`
3. 注意：4-way corner 有多個 area 共用同一 vert → 用「象限判定」選 src = 以 corner 為原點，cursor 落在哪個象限就選該象限的 area
4. 同一命中回傳 `{ areaId, corner }`，無命中 null

**`getCornerNeighbors(tree, areaId, corner)`**:
1. 取 corner 對應的 vert id（例 tl → area.verts.tl）
2. 找所有其他 area，其 4 個 corner vert 有任一等於該 vert → 候選鄰居
3. 對每個候選，找到兩 area **共享的 edge**（edge 的 vertA/vertB 兩端都在兩 area 的 corner verts 集合內）
4. 算出 direction：共享 edge 若 orientation='v' 且鄰居 area.left > src.left → 'e'，反之 'w'；'h' 且鄰居 area.top > src.top → 's'，反之 'n'
5. 回傳清單（同一 corner 最多 3 個鄰居）

**`splitArea(tree, areaId, 'v', ratio, newAreaId)`**（水平切對稱）:
1. 取 A = tree.areas 找 id；A 的 verts { tl, tr, bl, br }
2. A 的實際 rect（用 computeAreaRect 以 normalized 輸出）: `left, top, right = left+width, bottom = top+height`
3. split 線 x 座標：`splitX = left + ratio * width`
4. 在 A 的 **top edge** 上插新 vert `vTop = { id: newVertIds.a, x: splitX, y: top }`
5. 在 A 的 **bottom edge** 上插新 vert `vBot = { id: newVertIds.b, x: splitX, y: bottom }`
6. **切斷 top edge**：找到 A 的 top edge（edge orientation='h'、兩端 y=top、x 區間包含 splitX）。分兩段：原 edge vertA→vTop、新 edge vTop→原 vertB。**若 top 邊原本不是單一 edge**（既有 T-junction），找覆蓋 splitX 的那段切；T-junction 原本的 vert 保留。
7. 切斷 bottom edge 同理。
8. 新增 `e_split = { id: 'edge-${newAreaId}', vertA: vTop.id, vertB: vBot.id, orientation: 'v' }`
9. 原 A 變 left half：`verts = { tl: A.tl, tr: vTop.id, bl: A.bl, br: vBot.id }`
10. 新 area：`{ id: newAreaId, verts: { tl: vTop.id, tr: A.tr, bl: vBot.id, br: A.br } }`

**`mergeArea(tree, srcId, dstId)`**:
1. 先 `canMerge` 確認為鄰居；用 `getCornerNeighbors` 外層已定；此層再 find 共享 edge。
2. 計算 src 吃掉 dst 的邊界：以共享 edge 方向決定 src 哪側 corner 搬家
   - 共享 vertical edge、dst 在 src 東邊：src.tr = dst.tr、src.br = dst.br
   - 共享 vertical edge、dst 在西邊：src.tl = dst.tl、src.bl = dst.bl
   - 共享 horizontal edge、dst 在南邊：src.bl = dst.bl、src.br = dst.br
   - 共享 horizontal edge、dst 在北邊：src.tl = dst.tl、src.tr = dst.tr
3. 刪 dst area、刪共享 edge
4. 共享 edge 的兩個端點 vert：若 merge 後無任何其他 edge 以其為端點 → 刪 vert；否則保留（T-junction 或在外框上）
5. 刪 dst 內部曾擁有、現在無人引用的 edge / vert（需掃一遍 tree）

**`canSplit(tree, areaId, axis, ratio, W, H, minPx=MIN_AREA_PX)`**:
- 用 `computeAreaRect` 取 area 實際像素 size
- axis='v': 切後 `leftW = ratio * areaW`、`rightW = (1-ratio) * areaW`；兩者皆 ≥ minPx 才 true
- axis='h' 同理換 H

**`canMerge(tree, srcId, dstId)`**:
- `getCornerNeighbors(src, ?)` 任一 corner 包含 dst → true
- 否則 false（非鄰居）

### 測試覆蓋（+40 test）

```ts
// src/app/__tests__/areaTree.test.ts 新增 describe

describe('getAreaAt', () => {
  // layout preset: scene-tree (x<0.22), viewport (0.22≤x<0.72), properties (x≥0.72)
  // 對每個 area 中心點、四個 corner 內側、邊界死角 → expect 對應 id / null
});

describe('getCornerAt', () => {
  // 四個外框角、內部 corner (4-way in debug preset)
  // hitRadius 16px、container 1000×500 → rx=0.016, ry=0.032
  // 測試落在 corner 內、剛好邊界、邊界外
  // 4-way corner 象限判定：cursor 左上 → tl area
});

describe('getCornerNeighbors', () => {
  // layout preset scene-tree.tr corner → viewport 東邊鄰居
  // layout preset viewport.tl corner → scene-tree 西邊
  // debug preset viewport.br corner (T-junction) → environment 東、leaf 南
  // blank preset 無鄰居 → 空陣列
});

describe('splitArea', () => {
  // Blank preset 唯一 area 垂直切 ratio=0.5 → 2 area, 2 new vert, 1 new edge
  // Layout preset 的 viewport 水平切 → 正確保留左右內部垂直邊（split 後新 edge 與原 T-junction 互不干擾）
  // Debug preset 的 viewport 水平切 (y≥0.6 那塊不行因為已被 T-junction 界 → 應落在 viewport 的 [0,0.6] 範圍) → 正確
  // 切後 validateTree 仍 true
  // 切後純函式性：原 tree 不變
});

describe('mergeArea', () => {
  // Layout preset merge scene-tree ← viewport (viewport 消失、scene-tree 擴到 x=0.72)
  // Debug preset merge viewport ← environment (T-junction vert 保留，成為 scene-tree 後續 split 時的拓樸)
  // merge 後 validateTree true
  // 純函式性
  // 非鄰居直接呼叫 → 預期拋錯或 noop（選拋錯更明確）
});

describe('canSplit', () => {
  // MIN_AREA_PX=120, container 1000×500
  // Layout viewport (0.22-0.72 = 500px) 垂直切 ratio=0.5 → true (250px each)
  // Layout scene-tree (0-0.22 = 220px) 垂直切 ratio=0.5 → false (110px 一邊)
  // 水平同理
  // Ratio 邊界 0/1 → false
});

describe('canMerge', () => {
  // Layout preset scene-tree + viewport → true
  // Layout preset scene-tree + properties → false (非鄰居，中間隔 viewport)
  // Blank preset 自己 + 自己 → false
});
```

### Steps

- [ ] **Step 1.1**: 在 `src/app/areaTree.ts` 末尾加 Corner / Direction type 與 7 個新函式的 export
- [ ] **Step 1.2**: 實作 `getAreaAt`（最簡單，先動）
  ```ts
  export function getAreaAt(tree: AreaTree, x: number, y: number): string | null {
    for (const area of tree.areas) {
      const r = computeAreaRect(tree, area.id, 1, 1);
      if (!r) continue;
      if (x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height) {
        return area.id;
      }
    }
    return null;
  }
  ```
- [ ] **Step 1.3**: 實作 `getCornerAt`，含 4-way 象限判定（若 cursor 同時在多 area 的 corner 範圍內，以 cursor 相對 corner vert 的象限決定 src area — 例 cursor.x < vert.x && cursor.y < vert.y → 挑 br corner 等於該 vert 的 area）
- [ ] **Step 1.4**: 實作 `getCornerNeighbors`，用「共享 corner vert + 共享 edge」判斷
- [ ] **Step 1.5**: 實作 `canSplit`、`canMerge`（純判定、短小）
- [ ] **Step 1.6**: 實作 `splitArea`：找 area rect、算 splitX/Y、切斷 top/bottom (或 left/right) edge、插新 vert、加 split edge、更新 area.verts
- [ ] **Step 1.7**: 實作 `mergeArea`：find 共享 edge、搬 src corner、刪 dst 與共享 edge、清理孤兒 vert
- [ ] **Step 1.8**: 在 `src/app/__tests__/areaTree.test.ts` 加上述 7 個 describe block（table-driven 為主）
- [ ] **Step 1.9**: `npm run build` 過、`npm run test -- areaTree` 全過
- [ ] **Step 1.10**: 開 PR 前還原 CLAUDE.md：`git checkout main -- src/app/CLAUDE.md`
- [ ] **Step 1.11**: Commit + PR

**Commit**：
```
[app] Wave 4-1: areaTree corner split/merge 純函式 + vitest (refs #<issue>)
```

---

## Task 2: cornerDragStore + AreaCornerHandle

**GitHub issue**：`[app] Wave 4-2: cornerDragStore + AreaCornerHandle pointerdown (refs #459b)`

**Files:**
- Create: `src/app/cornerDragStore.ts`
- Create: `src/app/layout/AreaCornerHandle.tsx`
- Modify: `src/app/layout/AreaTreeRenderer.tsx`（掛 AreaCornerHandle × 4 per area）
- Modify: `src/app/layout/index.ts`（barrel export）

**Depends on:** Task 1
**Blocks:** Task 3

### cornerDragStore 骨幹

```ts
// src/app/cornerDragStore.ts
import { createSignal } from 'solid-js';
import type { AreaTree } from './areaTree';
import type { Corner } from './areaTree';

export type CornerDragPhase =
  | { phase: 'idle' }
  | {
      phase: 'pending';
      srcAreaId: string;
      corner: Corner;
      startClientX: number;
      startClientY: number;
      initialTree: AreaTree;
    }
  | {
      phase: 'active';
      srcAreaId: string;
      corner: Corner;
      mode: 'split' | 'merge' | 'invalid';
      axis?: 'h' | 'v';
      splitRatio?: number;
      dstAreaId?: string;
      cursorClientX: number;
      cursorClientY: number;
      previewTree?: AreaTree;
      initialTree: AreaTree;
    };

const [cornerDragStore, setCornerDragStore] = createSignal<CornerDragPhase>({ phase: 'idle' });

export { cornerDragStore, setCornerDragStore };
```

### AreaCornerHandle 骨幹

```tsx
// src/app/layout/AreaCornerHandle.tsx
import { type Component } from 'solid-js';
import { currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';
import { cornerDragStore, setCornerDragStore } from '../cornerDragStore';
import {
  getAreaAt, getCornerNeighbors, splitArea, mergeArea,
  canSplit, canMerge,
  type Corner,
} from '../areaTree';

const HIT_SIZE = 16;         // px
const DRAG_THRESHOLD = 5;    // px
const EDGE_RESERVE = 4;      // px，corner 內側避開 edge splitter 的 4px 中段

interface AreaCornerHandleProps {
  areaId: string;
  corner: Corner;
  areaRect: { left: number; top: number; width: number; height: number };  // px
  containerW: number;
  containerH: number;
}

export const AreaCornerHandle: Component<AreaCornerHandleProps> = (props) => {
  // 依 corner 決定在 area 內側哪個 12×12 區塊（預留 edge 的 4px）
  const hitStyle = () => {
    const base = {
      position: 'absolute' as const,
      width: `${HIT_SIZE - EDGE_RESERVE}px`,
      height: `${HIT_SIZE - EDGE_RESERVE}px`,
      'z-index': 9,  // 低於 AreaSplitter 的 10
      'touch-action': 'none' as const,
    };
    // corner → 相對 area 的 inset
    switch (props.corner) {
      case 'tl': return { ...base, left: `${EDGE_RESERVE}px`, top: `${EDGE_RESERVE}px`, cursor: 'crosshair' };
      case 'tr': return { ...base, right: `${EDGE_RESERVE}px`, top: `${EDGE_RESERVE}px`, cursor: 'crosshair' };
      case 'bl': return { ...base, left: `${EDGE_RESERVE}px`, bottom: `${EDGE_RESERVE}px`, cursor: 'crosshair' };
      case 'br': return { ...base, right: `${EDGE_RESERVE}px`, bottom: `${EDGE_RESERVE}px`, cursor: 'crosshair' };
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const initialTree = currentWorkspace().grid;
    setCornerDragStore({
      phase: 'pending',
      srcAreaId: props.areaId,
      corner: props.corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialTree,
    });

    // move / up / key 在 Task 3 才真正寫進階邏輯；本 Task 先寫最小 stub：
    // - pointerup 僅清 state，不 commit
    // - 無 pointermove 處理
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointerup', onUp);
      setCornerDragStore({ phase: 'idle' });
    };
    window.addEventListener('pointerup', onUp);
  };

  return <div style={hitStyle()} onPointerDown={handlePointerDown} />;
};
```

### AreaTreeRenderer 掛 handle

在原本 area `<div>` 內部渲染 `<For each={['tl','tr','bl','br']}>` 掛 4 個 handle：

```tsx
// src/app/layout/AreaTreeRenderer.tsx — 在原 area 渲染區塊內加 corner handles
import { AreaCornerHandle } from './AreaCornerHandle';
import type { Corner } from '../areaTree';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

// ... 原本的 For 裡：
<div style={{ position: 'absolute', left: `${rect()?.left}px`, /* ... */ }}>
  <AreaShell areaId={area.id} />
  <For each={CORNERS}>
    {(corner) => (
      <AreaCornerHandle
        areaId={area.id}
        corner={corner}
        areaRect={rect()!}
        containerW={containerSize().w}
        containerH={containerSize().h}
      />
    )}
  </For>
</div>
```

### Steps

- [ ] **Step 2.1**: 建 `src/app/cornerDragStore.ts`（上述骨幹）
- [ ] **Step 2.2**: 建 `src/app/layout/AreaCornerHandle.tsx`（上述骨幹 — pointerdown 進 pending、pointerup 回 idle、不做 preview 邏輯）
- [ ] **Step 2.3**: 改 `src/app/layout/AreaTreeRenderer.tsx`：import Corner 與 AreaCornerHandle；在 area 渲染 div 內加 `<For each={CORNERS}>` 掛 4 個 handle
- [ ] **Step 2.4**: 改 `src/app/layout/index.ts` 加 `AreaCornerHandle` barrel export
- [ ] **Step 2.5**: `npm run build` 過
- [ ] **Step 2.6**: 手動 QA：
  - Layout / Debug preset 每個 area 4 個角落 hover 時 cursor 變 crosshair
  - pointerdown 在任一 corner → DevTools 能看到 cornerDragStore `{ phase: 'pending', ... }`
  - pointerup → 回 idle
  - 按住拖動（Task 2 不做 preview，workspace 不變；Task 3 才連 preview）
  - AreaSplitter 邊界拖曳 resize 仍正常（z-index 10 > handle 9，邊優先）
- [ ] **Step 2.7**: 還原 CLAUDE.md：`git checkout main -- src/app/CLAUDE.md`
- [ ] **Step 2.8**: Commit + PR

**Commit**：
```
[app] Wave 4-2: cornerDragStore + AreaCornerHandle pointerdown (refs #<issue>)
```

---

## Task 3: Preview 整合 + state machine + cursor badge + 完整 QA

**GitHub issue**：`[app] Wave 4-3: corner drag preview + commit + cursor badge (refs #459b)`

**Files:**
- Modify: `src/app/layout/AreaCornerHandle.tsx`（pointermove / pointerup / keydown 完整邏輯）
- Modify: `src/app/layout/AreaTreeRenderer.tsx`（讀 previewTree 取代 grid、cursor badge overlay）

**Depends on:** Task 2
**Blocks:** 無

### AreaCornerHandle 完整 pointermove / pointerup / keydown

```tsx
const handlePointerDown = (e: PointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);

  const initialTree = currentWorkspace().grid;
  const startClientX = e.clientX;
  const startClientY = e.clientY;

  setCornerDragStore({
    phase: 'pending',
    srcAreaId: props.areaId,
    corner: props.corner,
    startClientX, startClientY,
    initialTree,
  });

  let lockedAxis: 'h' | 'v' | undefined = undefined;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startClientX;
    const dy = ev.clientY - startClientY;
    const dist = Math.hypot(dx, dy);

    // < 5px 仍 pending
    if (dist < DRAG_THRESHOLD && lockedAxis === undefined) return;

    // 首次 > 5px 鎖 axis
    if (lockedAxis === undefined) {
      lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'v' : 'h';
    }

    // normalized cursor
    const cx = ev.clientX / props.containerW;
    const cy = ev.clientY / props.containerH;
    const areaAtCursor = getAreaAt(initialTree, cx, cy);

    const base = {
      phase: 'active' as const,
      srcAreaId: props.areaId,
      corner: props.corner,
      cursorClientX: ev.clientX,
      cursorClientY: ev.clientY,
      initialTree,
      axis: lockedAxis,
    };

    // split 條件：cursor 仍在 src
    if (areaAtCursor === props.areaId) {
      const srcRect = computeAreaRect(initialTree, props.areaId, 1, 1)!;
      const ratio = lockedAxis === 'v'
        ? (cx - srcRect.left) / srcRect.width
        : (cy - srcRect.top) / srcRect.height;
      const ok = canSplit(initialTree, props.areaId, lockedAxis, ratio,
                          props.containerW, props.containerH);
      if (ok) {
        try {
          const previewTree = splitArea(
            initialTree, props.areaId, lockedAxis, ratio,
            `area-${Date.now()}`,
          );
          setCornerDragStore({ ...base, mode: 'split', splitRatio: ratio, previewTree });
          return;
        } catch (err) {
          console.error('[corner-drag] splitArea failed', err);
          setCornerDragStore({ ...base, mode: 'invalid' });
          return;
        }
      }
      setCornerDragStore({ ...base, mode: 'invalid', splitRatio: ratio });
      return;
    }

    // merge 條件：cursor 在 src 鄰居
    if (areaAtCursor) {
      const neighbors = getCornerNeighbors(initialTree, props.areaId, props.corner);
      const match = neighbors.find(n => n.neighborAreaId === areaAtCursor);
      if (match && canMerge(initialTree, props.areaId, areaAtCursor)) {
        try {
          const previewTree = mergeArea(initialTree, props.areaId, areaAtCursor);
          setCornerDragStore({ ...base, mode: 'merge', dstAreaId: areaAtCursor, previewTree });
          return;
        } catch (err) {
          console.error('[corner-drag] mergeArea failed', err);
          setCornerDragStore({ ...base, mode: 'invalid' });
          return;
        }
      }
    }

    // 非鄰居 / viewport 外 / 交界死角
    setCornerDragStore({ ...base, mode: 'invalid' });
  };

  const onUp = () => {
    target.releasePointerCapture(e.pointerId);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);

    const s = cornerDragStore();
    if (s.phase === 'active' && (s.mode === 'split' || s.mode === 'merge') && s.previewTree) {
      mutate(st => updateCurrentWorkspace(st, { grid: s.previewTree! }));
    }
    setCornerDragStore({ phase: 'idle' });
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      // initialTree 已是原始，Phase 2 preview 不寫 workspaceStore，idle 即可
      onUp.call(null);
      // 但若 active 已 mutate（不會發生，保守 rollback）
      mutate(st => updateCurrentWorkspace(st, { grid: initialTree }));
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
};
```

（需 import `computeAreaRect` from `'../areaTree'`。）

### AreaTreeRenderer 讀 previewTree + badge overlay

```tsx
// tree() 改成：
const tree = (): AreaTree => {
  const s = cornerDragStore();
  if (s.phase === 'active' && s.previewTree) return s.previewTree;
  const g = currentWorkspace().grid;
  return validateTree(g) ? g : createLayoutPresetTree();
};

// JSX 內，container div 最後加 overlay layer：
<Show when={cornerDragStore().phase === 'active'}>
  {() => {
    const s = cornerDragStore();
    if (s.phase !== 'active') return null;
    const label =
      s.mode === 'split' ? (s.axis === 'v' ? 'Split ▶' : 'Split ▼') :
      s.mode === 'merge' ? 'Merge →' :
      /* invalid */        "Can't do";
    const cursor =
      s.mode === 'split' ? (s.axis === 'v' ? 'ew-resize' : 'ns-resize') :
      s.mode === 'merge' ? 'move' :
      'not-allowed';
    return (
      <>
        {/* 全螢幕 cursor 覆蓋 */}
        <div style={{
          position: 'fixed', inset: 0, 'z-index': 20,
          cursor, 'pointer-events': 'none',
        }} />
        {/* Badge 跟 cursor */}
        <div style={{
          position: 'fixed',
          left: `${s.cursorClientX + 12}px`,
          top: `${s.cursorClientY + 16}px`,
          padding: '4px 8px',
          'border-radius': '2px',
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          'font-size': '11px',
          'z-index': 21,
          'pointer-events': 'none',
          'user-select': 'none',
        }}>{label}</div>
      </>
    );
  }}
</Show>
```

### 手動 QA Matrix

| Preset | 動作 | 預期 |
|--------|------|------|
| Layout | scene-tree tr corner 往 viewport 拖 | merge → viewport 消失、scene-tree 擴至 x=0.72 |
| Layout | viewport tl corner 往內拖（同 axis='v' 超過 5px） | split 垂直、預覽即時變化，release 生效 |
| Layout | viewport tr corner 往外拖（非鄰居方向 — 左 scene-tree） | 先 split（若 cursor 仍在 viewport 內，axis 鎖住）；若拖出到 scene-tree → merge preview 切換 |
| Debug | 4-way (T-junction, viewport br) corner 啟動 | 依象限判定 src；拖進 env → merge、拖進 leaf → merge、拖回 viewport 中 → split |
| Debug | leaf tl corner 朝上拖 | 進入 environment 或 viewport → merge；停在 leaf 內 → split 水平 |
| Any | pending 階段 (< 5px) release | 無事發生，idle |
| Any | active 拖到接近 MIN_AREA_PX 邊界 | mode='invalid'、not-allowed cursor、Can't do badge |
| Any | active 按 Esc | layout 不變、idle |
| Any | 連續 split 到深度 3+，再 merge 回去 | 拓樸正確恢復 |
| Blank | 單 area 任一 corner 拖 | 只能 split（無鄰居可 merge） |

### Steps

- [ ] **Step 3.1**: 改 `AreaCornerHandle.tsx` — 擴充 handlePointerDown 為完整 pointermove / pointerup / keydown 實作（覆蓋 Task 2 的 stub）
- [ ] **Step 3.2**: 改 `AreaTreeRenderer.tsx` — `tree()` 讀 previewTree 優先；加 cursor + badge overlay `<Show>` 區塊；import `cornerDragStore`
- [ ] **Step 3.3**: `npm run build` 過
- [ ] **Step 3.4**: 全 matrix 手動 QA（上表）
- [ ] **Step 3.5**: 邊界測：視窗 resize 中按住 corner drag（應 no-op 不 crash）、快速反覆 pointerdown/up（state 不漏）、drag 中切 workspace（目前無 UI 可切但仍測一次）
- [ ] **Step 3.6**: 還原 CLAUDE.md：`git checkout main -- src/app/CLAUDE.md`
- [ ] **Step 3.7**: Commit + PR

**Commit**：
```
[app] Wave 4-3: corner drag preview + commit + cursor badge (refs #<issue>)
```

---

## 依賴關係總覽

```
Task 1 (areaTree 純函式 + vitest) ──→ Task 2 (cornerDragStore + handle stub) ──→ Task 3 (preview + commit + overlay)
```

**序列執行**，無並行空間。

---

## 已知限制（本 plan 不解，spec 已列）

1. Merge 丟 dst editor state — 待 #460 area state persistence
2. 不支援跨 workspace 拖動
3. 觸控 gesture 未專測
4. Split/merge 無 animation
5. Merge 不遞迴吃 dst 的複雜 sub-layout — 由使用者先 merge 內部

---

## Commit message 慣例

所有 commit 用 `[app]` 前綴。每個 PR 結尾帶 `refs #<sub-issue>`。PR 前記得 `git checkout main -- src/app/CLAUDE.md` 還原模組 CLAUDE.md。
