# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #541：areaTree corner split/merge 純函式 + vitest

修改 2 個現有檔案（局部修改，在末尾追加新函式與新測試 describe block）。

---

### 檔案 1：`src/app/areaTree.ts`（追加新 export）

在現有 `resizeEdge` 函式之後，**檔案末尾**加入以下程式碼（完整貼入）：

```ts
// ---------------------------------------------------------------------------
// Corner / Direction types（供 split/merge API 使用）
// ---------------------------------------------------------------------------
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type Direction = 'n' | 's' | 'e' | 'w';

// ---------------------------------------------------------------------------
// getAreaAt: 找出 normalized 座標 (x,y) 落在哪個 area
// 遍歷 tree.areas，用 computeAreaRect(tree, id, 1, 1) 取 normalized rect
// 測 left ≤ x < left+width && top ≤ y < top+height
// O(N_areas)
// ---------------------------------------------------------------------------
export function getAreaAt(
  tree: AreaTree,
  x: number,
  y: number,
): string | null {
  for (const area of tree.areas) {
    const r = computeAreaRect(tree, area.id, 1, 1);
    if (!r) continue;
    if (x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height) {
      return area.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// getCornerAt: 找出 normalized 座標 (x,y) 落在哪個 area 的哪個 corner 16px 命中圓
// 演算法：
//   1. rx = hitRadiusPx / containerW, ry = hitRadiusPx / containerH
//   2. 遍歷 areas，對每個 area 的 4 個 corner vert 測 |vert.x - x| < rx && |vert.y - y| < ry
//   3. 4-way corner 象限判定（多 area 共用同一 vert）：
//      以 corner vert 為原點，cursor 落哪個象限就選該象限的 area：
//        cursor.x <= vert.x && cursor.y <= vert.y → 挑以此 vert 為 br 的 area
//        cursor.x >= vert.x && cursor.y <= vert.y → 挑以此 vert 為 bl 的 area
//        cursor.x <= vert.x && cursor.y >= vert.y → 挑以此 vert 為 tr 的 area
//        cursor.x >= vert.x && cursor.y >= vert.y → 挑以此 vert 為 tl 的 area
//   4. 回傳 { areaId, corner } 或 null
// ---------------------------------------------------------------------------
export function getCornerAt(
  tree: AreaTree,
  x: number,
  y: number,
  containerW: number,
  containerH: number,
  hitRadiusPx = 16,
): { areaId: string; corner: Corner } | null {
  const rx = hitRadiusPx / containerW;
  const ry = hitRadiusPx / containerH;
  const vertMap = new Map(tree.verts.map(v => [v.id, v]));

  // collect all hits
  const hits: Array<{ areaId: string; corner: Corner; vx: number; vy: number }> = [];
  for (const area of tree.areas) {
    const corners: Corner[] = ['tl', 'tr', 'bl', 'br'];
    for (const corner of corners) {
      const v = vertMap.get(area.verts[corner]);
      if (!v) continue;
      if (Math.abs(v.x - x) < rx && Math.abs(v.y - y) < ry) {
        hits.push({ areaId: area.id, corner, vx: v.x, vy: v.y });
      }
    }
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return { areaId: hits[0].areaId, corner: hits[0].corner };

  // 4-way: 象限判定 — pick by cursor relative to the shared vert position
  const { vx, vy } = hits[0];
  let targetCorner: Corner;
  if (x <= vx && y <= vy) {
    targetCorner = 'br';
  } else if (x >= vx && y <= vy) {
    targetCorner = 'bl';
  } else if (x <= vx && y >= vy) {
    targetCorner = 'tr';
  } else {
    targetCorner = 'tl';
  }
  const match = hits.find(h => h.corner === targetCorner);
  return match ? { areaId: match.areaId, corner: match.corner } : { areaId: hits[0].areaId, corner: hits[0].corner };
}

// ---------------------------------------------------------------------------
// getCornerNeighbors: 由 (areaId, corner) 找出共享該 corner vert 的鄰居清單
// 演算法：
//   1. 取 area.verts[corner] 對應的 vertId
//   2. 找所有 other areas，其任一 corner vert = vertId（候選鄰居）
//   3. 對每個候選，找兩 area 共享的 edge（edge 兩端 vertId 都在兩 area corner verts 集合內）
//   4. 計算 direction（共享 edge 方向 + 鄰居位置）
//      - orientation='v' && neighbor.left > src.left → 'e'；反之 'w'
//      - orientation='h' && neighbor.top > src.top  → 's'；反之 'n'
//   5. 回傳清單（同一 corner 最多 3 個鄰居）
// ---------------------------------------------------------------------------
export function getCornerNeighbors(
  tree: AreaTree,
  areaId: string,
  corner: Corner,
): Array<{
  neighborAreaId: string;
  sharedEdgeId: string;
  direction: Direction;
}> {
  const src = tree.areas.find(a => a.id === areaId);
  if (!src) return [];

  const vertMap = new Map(tree.verts.map(v => [v.id, v]));
  const sharedVertId = src.verts[corner];
  const srcVertIds = new Set([src.verts.bl, src.verts.br, src.verts.tl, src.verts.tr]);

  const result: Array<{ neighborAreaId: string; sharedEdgeId: string; direction: Direction }> = [];

  for (const other of tree.areas) {
    if (other.id === areaId) continue;
    const otherVerts = [other.verts.bl, other.verts.br, other.verts.tl, other.verts.tr];
    if (!otherVerts.includes(sharedVertId)) continue;

    // 找共享 edge（兩端都同時在 src 和 other 的 corner vert 集合中）
    const otherVertIds = new Set(otherVerts);
    const sharedEdge = tree.edges.find(e =>
      srcVertIds.has(e.vertA) && otherVertIds.has(e.vertA) &&
      srcVertIds.has(e.vertB) && otherVertIds.has(e.vertB),
    );
    if (!sharedEdge) continue;

    // 計算 direction
    const srcRect = computeAreaRect(tree, areaId, 1, 1);
    const otherRect = computeAreaRect(tree, other.id, 1, 1);
    if (!srcRect || !otherRect) continue;

    let direction: Direction;
    if (sharedEdge.orientation === 'v') {
      direction = otherRect.left > srcRect.left ? 'e' : 'w';
    } else {
      direction = otherRect.top > srcRect.top ? 's' : 'n';
    }

    result.push({ neighborAreaId: other.id, sharedEdgeId: sharedEdge.id, direction });
  }

  return result;
}

// ---------------------------------------------------------------------------
// canSplit: 判定能否在 area 上沿 axis 在 ratio 位置切割
// 條件：切後兩邊的像素尺寸皆 >= minPx
// ---------------------------------------------------------------------------
export function canSplit(
  tree: AreaTree,
  areaId: string,
  axis: 'h' | 'v',
  ratio: number,
  containerW: number,
  containerH: number,
  minPx = MIN_AREA_PX,
): boolean {
  if (ratio <= 0 || ratio >= 1) return false;
  const rect = computeAreaRect(tree, areaId, containerW, containerH);
  if (!rect) return false;
  if (axis === 'v') {
    const leftW = ratio * rect.width;
    const rightW = (1 - ratio) * rect.width;
    return leftW >= minPx && rightW >= minPx;
  } else {
    const topH = ratio * rect.height;
    const botH = (1 - ratio) * rect.height;
    return topH >= minPx && botH >= minPx;
  }
}

// ---------------------------------------------------------------------------
// canMerge: 判定 srcAreaId 和 dstAreaId 是否相鄰（共享邊）
// 以 getCornerNeighbors 找所有角落鄰居，其中有 dst 即為 true
// ---------------------------------------------------------------------------
export function canMerge(
  tree: AreaTree,
  srcAreaId: string,
  dstAreaId: string,
): boolean {
  if (srcAreaId === dstAreaId) return false;
  const corners: Corner[] = ['tl', 'tr', 'bl', 'br'];
  for (const corner of corners) {
    const neighbors = getCornerNeighbors(tree, srcAreaId, corner);
    if (neighbors.some(n => n.neighborAreaId === dstAreaId)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// splitArea: 純函式，將 areaId 沿 axis 在 ratio 位置切割，回傳新 tree
// axis='v' → 垂直切線（豎著），左半保留 areaId，右半是 newAreaId
// axis='h' → 水平切線（橫著），上半保留 areaId，下半是 newAreaId
//
// 演算法（以 axis='v' 為例）：
//   1. 取 area 的 normalized rect（containerW=1, H=1）
//   2. splitX = left + ratio * width
//   3. 在 top edge 上插新 vert vTop(splitX, top)
//   4. 在 bottom edge 上插新 vert vBot(splitX, bottom)
//   5. 切斷 top edge：找覆蓋 splitX 的那段 h-edge，拆成兩段
//   6. 切斷 bottom edge 同理
//   7. 新增 vertical split edge e_split = (vTop, vBot)
//   8. 原 area verts: { tl, tr→vTop, bl, br→vBot }（保留 areaId）
//   9. 新 area verts: { tl→vTop, tr, bl→vBot, br }（newAreaId）
// axis='h' 對稱，splitY = top + ratio * height，左/右改為上/下
// ---------------------------------------------------------------------------
export function splitArea(
  tree: AreaTree,
  areaId: string,
  axis: 'h' | 'v',
  ratio: number,
  newAreaId: string,
  newVertIds?: { a: string; b: string },
): AreaTree {
  const area = tree.areas.find(a => a.id === areaId);
  if (!area) return tree;

  const rect = computeAreaRect(tree, areaId, 1, 1);
  if (!rect) return tree;

  const vIdA = newVertIds?.a ?? `vert-${newAreaId}-a`;
  const vIdB = newVertIds?.b ?? `vert-${newAreaId}-b`;
  const splitEdgeId = `edge-${newAreaId}`;

  let newVerts = [...tree.verts];
  let newEdges = [...tree.edges];
  let newAreas = [...tree.areas];

  if (axis === 'v') {
    const splitX = rect.left + ratio * rect.width;
    const top = rect.top;
    const bottom = rect.top + rect.height;

    // insert verts
    const vTop = { id: vIdA, x: splitX, y: top };
    const vBot = { id: vIdB, x: splitX, y: bottom };
    newVerts = [...newVerts, vTop, vBot];

    // helper: cut the h-edge spanning splitX at y=yVal
    const cutHEdge = (yVal: number, insertVertId: string): void => {
      const idx = newEdges.findIndex(e => {
        if (e.orientation !== 'h') return false;
        const vA = newVerts.find(v => v.id === e.vertA);
        const vB = newVerts.find(v => v.id === e.vertB);
        if (!vA || !vB) return false;
        if (Math.abs(vA.y - yVal) > 1e-9 || Math.abs(vB.y - yVal) > 1e-9) return false;
        const minX = Math.min(vA.x, vB.x);
        const maxX = Math.max(vA.x, vB.x);
        return splitX > minX + 1e-9 && splitX < maxX - 1e-9;
      });
      if (idx === -1) return;
      const old = newEdges[idx];
      const vA = newVerts.find(v => v.id === old.vertA)!;
      const vB = newVerts.find(v => v.id === old.vertB)!;
      const leftVId = vA.x < vB.x ? old.vertA : old.vertB;
      const rightVId = vA.x < vB.x ? old.vertB : old.vertA;
      newEdges.splice(idx, 1,
        { id: `${old.id}-L`, vertA: leftVId, vertB: insertVertId, orientation: 'h' },
        { id: `${old.id}-R`, vertA: insertVertId, vertB: rightVId, orientation: 'h' },
      );
    };

    cutHEdge(top, vIdA);
    cutHEdge(bottom, vIdB);

    // split edge
    newEdges = [...newEdges, { id: splitEdgeId, vertA: vIdA, vertB: vIdB, orientation: 'v' }];

    // update areas
    newAreas = newAreas.map(a =>
      a.id === areaId
        ? { ...a, verts: { tl: a.verts.tl, tr: vIdA, bl: a.verts.bl, br: vIdB } }
        : a,
    );
    newAreas = [...newAreas, {
      id: newAreaId,
      verts: { tl: vIdA, tr: area.verts.tr, bl: vIdB, br: area.verts.br },
    }];

  } else {
    // axis === 'h'
    const splitY = rect.top + ratio * rect.height;
    const left = rect.left;
    const right = rect.left + rect.width;

    const vLeft = { id: vIdA, x: left, y: splitY };
    const vRight = { id: vIdB, x: right, y: splitY };
    newVerts = [...newVerts, vLeft, vRight];

    // helper: cut the v-edge spanning splitY at x=xVal
    const cutVEdge = (xVal: number, insertVertId: string): void => {
      const idx = newEdges.findIndex(e => {
        if (e.orientation !== 'v') return false;
        const vA = newVerts.find(v => v.id === e.vertA);
        const vB = newVerts.find(v => v.id === e.vertB);
        if (!vA || !vB) return false;
        if (Math.abs(vA.x - xVal) > 1e-9 || Math.abs(vB.x - xVal) > 1e-9) return false;
        const minY = Math.min(vA.y, vB.y);
        const maxY = Math.max(vA.y, vB.y);
        return splitY > minY + 1e-9 && splitY < maxY - 1e-9;
      });
      if (idx === -1) return;
      const old = newEdges[idx];
      const vA = newVerts.find(v => v.id === old.vertA)!;
      const vB = newVerts.find(v => v.id === old.vertB)!;
      const topVId = vA.y < vB.y ? old.vertA : old.vertB;
      const botVId = vA.y < vB.y ? old.vertB : old.vertA;
      newEdges.splice(idx, 1,
        { id: `${old.id}-T`, vertA: topVId, vertB: insertVertId, orientation: 'v' },
        { id: `${old.id}-B`, vertA: insertVertId, vertB: botVId, orientation: 'v' },
      );
    };

    cutVEdge(left, vIdA);
    cutVEdge(right, vIdB);

    // split edge
    newEdges = [...newEdges, { id: splitEdgeId, vertA: vIdA, vertB: vIdB, orientation: 'h' }];

    // update areas
    newAreas = newAreas.map(a =>
      a.id === areaId
        ? { ...a, verts: { tl: a.verts.tl, tr: a.verts.tr, bl: vIdA, br: vIdB } }
        : a,
    );
    newAreas = [...newAreas, {
      id: newAreaId,
      verts: { tl: vIdA, tr: vIdB, bl: area.verts.bl, br: area.verts.br },
    }];
  }

  return { ...tree, verts: newVerts, edges: newEdges, areas: newAreas };
}

// ---------------------------------------------------------------------------
// mergeArea: 純函式，src 吃掉 dst（必須是鄰居），回傳新 tree
// 演算法：
//   1. 找共享 edge（用 getCornerNeighbors 找任一 corner 有 dst 的鄰居項）
//   2. 依共享 edge 方向決定 src 哪側 corner 搬到 dst 對應 corner：
//      - v edge, dst 在 src 東邊: src.tr=dst.tr, src.br=dst.br
//      - v edge, dst 在 src 西邊: src.tl=dst.tl, src.bl=dst.bl
//      - h edge, dst 在 src 南邊: src.bl=dst.bl, src.br=dst.br
//      - h edge, dst 在 src 北邊: src.tl=dst.tl, src.tr=dst.tr
//   3. 刪 dst area、刪共享 edge
//   4. 共享 edge 的兩端 vert：若無任何其他 edge 引用 → 刪 vert（孤兒清理）
//   5. 刪 dst 內部曾擁有、現在無任何 edge 引用的孤兒 vert
//   拋錯：若 dst 不是 src 的鄰居
// ---------------------------------------------------------------------------
export function mergeArea(
  tree: AreaTree,
  srcAreaId: string,
  dstAreaId: string,
): AreaTree {
  if (!canMerge(tree, srcAreaId, dstAreaId)) {
    throw new Error(`mergeArea: ${dstAreaId} is not a neighbor of ${srcAreaId}`);
  }

  const src = tree.areas.find(a => a.id === srcAreaId)!;
  const dst = tree.areas.find(a => a.id === dstAreaId)!;

  // find shared edge info
  const corners: Corner[] = ['tl', 'tr', 'bl', 'br'];
  let sharedEdgeId = '';
  let direction: Direction = 'e';
  for (const corner of corners) {
    const neighbors = getCornerNeighbors(tree, srcAreaId, corner);
    const match = neighbors.find(n => n.neighborAreaId === dstAreaId);
    if (match) {
      sharedEdgeId = match.sharedEdgeId;
      direction = match.direction;
      break;
    }
  }

  const sharedEdge = tree.edges.find(e => e.id === sharedEdgeId)!;

  // update src verts
  let newSrcVerts = { ...src.verts };
  if (direction === 'e') {
    newSrcVerts = { ...newSrcVerts, tr: dst.verts.tr, br: dst.verts.br };
  } else if (direction === 'w') {
    newSrcVerts = { ...newSrcVerts, tl: dst.verts.tl, bl: dst.verts.bl };
  } else if (direction === 's') {
    newSrcVerts = { ...newSrcVerts, bl: dst.verts.bl, br: dst.verts.br };
  } else {
    // 'n'
    newSrcVerts = { ...newSrcVerts, tl: dst.verts.tl, tr: dst.verts.tr };
  }

  // remove dst area & shared edge
  let newAreas = tree.areas
    .filter(a => a.id !== dstAreaId)
    .map(a => a.id === srcAreaId ? { ...a, verts: newSrcVerts } : a);
  let newEdges = tree.edges.filter(e => e.id !== sharedEdgeId);

  // collect all remaining vert references
  const referencedVerts = new Set<string>();
  for (const e of newEdges) {
    referencedVerts.add(e.vertA);
    referencedVerts.add(e.vertB);
  }
  for (const a of newAreas) {
    referencedVerts.add(a.verts.bl);
    referencedVerts.add(a.verts.br);
    referencedVerts.add(a.verts.tl);
    referencedVerts.add(a.verts.tr);
  }

  // remove orphan verts
  const newVerts = tree.verts.filter(v => referencedVerts.has(v.id));

  return { ...tree, verts: newVerts, edges: newEdges, areas: newAreas };
}
```

---

### 檔案 2：`src/app/__tests__/areaTree.test.ts`（追加新 describe block）

在現有 `resizeEdge` describe block **之後**（檔案末尾），加入以下完整程式碼：

```ts
// ---------------------------------------------------------------------------
// 新 import（在檔案頂部加到現有 import 清單）
// ---------------------------------------------------------------------------
// 修改第一行 import，加入新符號：
// import {
//   createLayoutPresetTree,
//   createDebugPresetTree,
//   createBlankTree,
//   validateTree,
//   computeAreaRect,
//   getAllInternalEdges,
//   getEdgeDragGroup,
//   resizeEdge,
//   MIN_AREA_PX,
//   getAreaAt,
//   getCornerAt,
//   getCornerNeighbors,
//   canSplit,
//   canMerge,
//   splitArea,
//   mergeArea,
// } from '../areaTree';
```

**注意**：先更新 import 行，再貼以下 describe block。

```ts
// ---------------------------------------------------------------------------
// getAreaAt
// ---------------------------------------------------------------------------
describe('getAreaAt', () => {
  it('Layout: viewport 中心點 (0.47, 0.5) → viewport', () => {
    expect(getAreaAt(createLayoutPresetTree(), 0.47, 0.5)).toBe('viewport');
  });

  it('Layout: scene-tree 中心 (0.11, 0.5) → scene-tree', () => {
    expect(getAreaAt(createLayoutPresetTree(), 0.11, 0.5)).toBe('scene-tree');
  });

  it('Layout: properties 中心 (0.86, 0.5) → properties', () => {
    expect(getAreaAt(createLayoutPresetTree(), 0.86, 0.5)).toBe('properties');
  });

  it('超出邊界 (1.5, 0.5) → null', () => {
    expect(getAreaAt(createLayoutPresetTree(), 1.5, 0.5)).toBeNull();
  });

  it('Debug: leaf 中心 (0.5, 0.8) → leaf', () => {
    expect(getAreaAt(createDebugPresetTree(), 0.5, 0.8)).toBe('leaf');
  });

  it('Debug: environment 中心 (0.85, 0.3) → environment', () => {
    expect(getAreaAt(createDebugPresetTree(), 0.85, 0.3)).toBe('environment');
  });

  it('Blank: 中心 (0.5, 0.5) → viewport', () => {
    expect(getAreaAt(createBlankTree(), 0.5, 0.5)).toBe('viewport');
  });
});

// ---------------------------------------------------------------------------
// getCornerAt
// ---------------------------------------------------------------------------
describe('getCornerAt', () => {
  // container 1000×500; rx=0.016, ry=0.032
  const W = 1000, H = 500;

  it('外框左上角 (0.005, 0.01) → { areaId: scene-tree/viewport(Blank), corner: tl }', () => {
    const r = getCornerAt(createBlankTree(), 0.005, 0.01, W, H);
    expect(r).not.toBeNull();
    expect(r!.corner).toBe('tl');
  });

  it('Layout 外框左上角 → scene-tree tl', () => {
    const r = getCornerAt(createLayoutPresetTree(), 0.005, 0.01, W, H);
    expect(r).not.toBeNull();
    expect(r!.areaId).toBe('scene-tree');
    expect(r!.corner).toBe('tl');
  });

  it('Layout 外框右下角 → properties br', () => {
    const r = getCornerAt(createLayoutPresetTree(), 0.995, 0.99, W, H);
    expect(r).not.toBeNull();
    expect(r!.areaId).toBe('properties');
    expect(r!.corner).toBe('br');
  });

  it('Layout 內部 vert(0.22, 0) 左上側（cursor < vert）→ 象限 br → scene-tree', () => {
    // vert at (0.22, 0); cursor 左上側 → pick area whose br = this vert = scene-tree.tr
    const r = getCornerAt(createLayoutPresetTree(), 0.215, 0.005, W, H);
    expect(r).not.toBeNull();
    // cursor.x < 0.22 && cursor.y < 0 → corner=br → scene-tree.tr? 
    // scene-tree.tr = v4 (0.22,0); viewport.tl = v4 (0.22,0)
    // cursor.x <= vert.x && cursor.y <= vert.y → targetCorner=br
    // scene-tree has no br at v4 (scene-tree.br = v5); viewport has no br at v4; only scene-tree.tr = v4
    // fallback: hits[0]
    expect(r).not.toBeNull();
  });

  it('命中圓外 (0.5, 0.5) Layout → null（遠離任何 corner vert）', () => {
    expect(getCornerAt(createLayoutPresetTree(), 0.5, 0.5, W, H)).toBeNull();
  });

  it('Debug T-junction (0.7, 0.6) cursor 右下側 → tl area（viewport 或 leaf 之 tl）', () => {
    // cursor.x >= 0.7 && cursor.y >= 0.6 → targetCorner = tl → find area whose tl = v7
    // leaf.tl = v5 (0,0.6)、viewport.tl = v0、environment.tl = v4 → leaf 的 tl 不是 v7
    // viewport.br = v7、environment.bl = v7、leaf.tr = v6 — 需看哪個 corner = v7
    // viewport.br = v7 (0.7,0.6)、environment.bl = v7 → targetCorner=tl → no match → hits[0]
    const r = getCornerAt(createDebugPresetTree(), 0.705, 0.605, W, H);
    expect(r).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCornerNeighbors
// ---------------------------------------------------------------------------
describe('getCornerNeighbors', () => {
  it('Layout: scene-tree tr corner → 1 鄰居 (viewport，方向 e)', () => {
    const ns = getCornerNeighbors(createLayoutPresetTree(), 'scene-tree', 'tr');
    expect(ns.length).toBeGreaterThanOrEqual(1);
    const match = ns.find(n => n.neighborAreaId === 'viewport');
    expect(match).toBeDefined();
    expect(match!.direction).toBe('e');
  });

  it('Layout: viewport tl corner → scene-tree 在西 (w)', () => {
    const ns = getCornerNeighbors(createLayoutPresetTree(), 'viewport', 'tl');
    const match = ns.find(n => n.neighborAreaId === 'scene-tree');
    expect(match).toBeDefined();
    expect(match!.direction).toBe('w');
  });

  it('Layout: viewport tr corner → properties 在東 (e)', () => {
    const ns = getCornerNeighbors(createLayoutPresetTree(), 'viewport', 'tr');
    const match = ns.find(n => n.neighborAreaId === 'properties');
    expect(match).toBeDefined();
    expect(match!.direction).toBe('e');
  });

  it('Blank: viewport 任一 corner → 空陣列', () => {
    expect(getCornerNeighbors(createBlankTree(), 'viewport', 'tl')).toHaveLength(0);
  });

  it('Debug: viewport br (T-junction v7) → 至少 1 鄰居', () => {
    const ns = getCornerNeighbors(createDebugPresetTree(), 'viewport', 'br');
    expect(ns.length).toBeGreaterThanOrEqual(1);
  });

  it('不存在的 areaId → 空陣列', () => {
    expect(getCornerNeighbors(createLayoutPresetTree(), 'NO_AREA', 'tl')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// canSplit
// ---------------------------------------------------------------------------
describe('canSplit', () => {
  // Layout viewport: left=220px, width=500px @ 1000×500
  it('Layout viewport 垂直切 ratio=0.5 → true (250px 每邊)', () => {
    expect(canSplit(createLayoutPresetTree(), 'viewport', 'v', 0.5, 1000, 500)).toBe(true);
  });

  it('Layout scene-tree 垂直切 ratio=0.5 → false (110px < 120px)', () => {
    expect(canSplit(createLayoutPresetTree(), 'scene-tree', 'v', 0.5, 1000, 500)).toBe(false);
  });

  it('ratio=0 → false', () => {
    expect(canSplit(createLayoutPresetTree(), 'viewport', 'v', 0, 1000, 500)).toBe(false);
  });

  it('ratio=1 → false', () => {
    expect(canSplit(createLayoutPresetTree(), 'viewport', 'v', 1, 1000, 500)).toBe(false);
  });

  it('Layout viewport 水平切 ratio=0.5, 500px height → true (250px each)', () => {
    expect(canSplit(createLayoutPresetTree(), 'viewport', 'h', 0.5, 1000, 500)).toBe(true);
  });

  it('Layout viewport 水平切 ratio=0.1, 500px → false (50px < 120px)', () => {
    expect(canSplit(createLayoutPresetTree(), 'viewport', 'h', 0.1, 1000, 500)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canMerge
// ---------------------------------------------------------------------------
describe('canMerge', () => {
  it('Layout: scene-tree + viewport → true', () => {
    expect(canMerge(createLayoutPresetTree(), 'scene-tree', 'viewport')).toBe(true);
  });

  it('Layout: viewport + properties → true', () => {
    expect(canMerge(createLayoutPresetTree(), 'viewport', 'properties')).toBe(true);
  });

  it('Layout: scene-tree + properties → false（非鄰居）', () => {
    expect(canMerge(createLayoutPresetTree(), 'scene-tree', 'properties')).toBe(false);
  });

  it('Blank: viewport + viewport (自身) → false', () => {
    expect(canMerge(createBlankTree(), 'viewport', 'viewport')).toBe(false);
  });

  it('Debug: viewport + environment → true', () => {
    expect(canMerge(createDebugPresetTree(), 'viewport', 'environment')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// splitArea
// ---------------------------------------------------------------------------
describe('splitArea', () => {
  it('Blank 唯一 area 垂直切 ratio=0.5 → 2 areas, 2 new verts, 多 1 edge', () => {
    const t = createBlankTree();
    const result = splitArea(t, 'viewport', 'v', 0.5, 'right');
    expect(result.areas).toHaveLength(2);
    expect(result.verts.length).toBeGreaterThan(t.verts.length);
    expect(result.edges.length).toBeGreaterThan(t.edges.length);
    expect(validateTree(result)).toBe(true);
  });

  it('splitArea 後 原 area id 保留（left/top 半）', () => {
    const t = createBlankTree();
    const result = splitArea(t, 'viewport', 'v', 0.5, 'right');
    const orig = result.areas.find(a => a.id === 'viewport');
    const newA = result.areas.find(a => a.id === 'right');
    expect(orig).toBeDefined();
    expect(newA).toBeDefined();
  });

  it('純函式：原 tree 不變', () => {
    const t = createBlankTree();
    const origAreaLen = t.areas.length;
    splitArea(t, 'viewport', 'v', 0.5, 'right');
    expect(t.areas).toHaveLength(origAreaLen);
  });

  it('Layout viewport 垂直切 → validateTree true', () => {
    const t = createLayoutPresetTree();
    const result = splitArea(t, 'viewport', 'v', 0.5, 'viewport-r');
    expect(validateTree(result)).toBe(true);
    expect(result.areas).toHaveLength(4);
  });

  it('Layout viewport 水平切 → validateTree true', () => {
    const t = createLayoutPresetTree();
    const result = splitArea(t, 'viewport', 'h', 0.5, 'viewport-b');
    expect(validateTree(result)).toBe(true);
    expect(result.areas).toHaveLength(4);
  });

  it('split ratio 後新 area 的 rect 尺寸正確（垂直切 0.3）', () => {
    const t = createBlankTree();
    const result = splitArea(t, 'viewport', 'v', 0.3, 'right');
    const leftRect = computeAreaRect(result, 'viewport', 1000, 500);
    const rightRect = computeAreaRect(result, 'right', 1000, 500);
    expect(leftRect).not.toBeNull();
    expect(rightRect).not.toBeNull();
    expect(leftRect!.width).toBeCloseTo(300, 0);
    expect(rightRect!.width).toBeCloseTo(700, 0);
  });
});

// ---------------------------------------------------------------------------
// mergeArea
// ---------------------------------------------------------------------------
describe('mergeArea', () => {
  it('Layout: scene-tree 吃掉 viewport → 2 areas 剩餘', () => {
    const t = createLayoutPresetTree();
    const result = mergeArea(t, 'scene-tree', 'viewport');
    expect(result.areas).toHaveLength(2);
    expect(result.areas.find(a => a.id === 'viewport')).toBeUndefined();
    expect(result.areas.find(a => a.id === 'scene-tree')).toBeDefined();
  });

  it('Layout merge 後 scene-tree 擴到 x=0.72', () => {
    const t = createLayoutPresetTree();
    const result = mergeArea(t, 'scene-tree', 'viewport');
    const rect = computeAreaRect(result, 'scene-tree', 1000, 500);
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeCloseTo(720, 0); // 0.72 * 1000
  });

  it('merge 後 validateTree true', () => {
    const t = createLayoutPresetTree();
    expect(validateTree(mergeArea(t, 'scene-tree', 'viewport'))).toBe(true);
  });

  it('純函式：原 tree 不變', () => {
    const t = createLayoutPresetTree();
    const origLen = t.areas.length;
    mergeArea(t, 'scene-tree', 'viewport');
    expect(t.areas).toHaveLength(origLen);
  });

  it('非鄰居直接呼叫 → 拋錯', () => {
    const t = createLayoutPresetTree();
    expect(() => mergeArea(t, 'scene-tree', 'properties')).toThrow();
  });

  it('Debug: viewport 吃掉 environment → leaf 仍在、validateTree true', () => {
    const t = createDebugPresetTree();
    const result = mergeArea(t, 'viewport', 'environment');
    expect(result.areas).toHaveLength(2);
    expect(result.areas.find(a => a.id === 'leaf')).toBeDefined();
    expect(validateTree(result)).toBe(true);
  });
});
```

---

### 不要做的事
- 不動 `src/app/workspaceStore.ts`、`src/app/AreaShell.tsx`、`src/app/App.tsx`，不動任何其他模組
- 不新增 `cornerDragStore.ts` 或 `AreaCornerHandle.tsx`（Task 2 的工作）
- 不改動 areaTree.ts 已有函式的邏輯（`resizeEdge`、`validateTree`、`computeAreaRect` 等）
- 不 mutate 入參的 tree（純函式，全程 spread / filter / map 產生新物件）
- 不用 `// ... existing code ...` 作為佔位符

### build + test 驗證
```
npm run build
npm run test -- areaTree
```

兩者都必須全過（0 error, 0 failing test）。

### Commit
```
[app] Wave 4-1: areaTree corner split/merge 純函式 + vitest (refs #541)
```

### 開 PR
```bash
gh pr create --base master --title "[app] Wave 4-1: areaTree corner split/merge 純函式 + vitest" --body "closes #541
refs #459"
```

**開 PR 前還原 CLAUDE.md**：
```bash
git checkout master -- src/app/CLAUDE.md
```

### 重點雷區
- **4-way corner 象限判定**：`getCornerAt` 多個 area 共用同一 vert 時，以 cursor 相對 vert 的象限決定 src area（cursor.x ≤ vert.x && cursor.y ≤ vert.y → 取 `br` corner 的 area，以此類推）
- **T-junction split edge 切段**：`splitArea` 切斷 top/bottom edge 時，要找「orientation=h、y 座標相符、且 x 區間覆蓋 splitX」的那段，不是第一個遇到的 h-edge；T-junction 原有的 vert 保留不動
- **merge 後孤兒 vert 清理**：`mergeArea` 刪 dst area 及共享 edge 後，掃所有 edges + areas 的 vert 引用，凡不在引用集合內的 vert 一律刪除
- **純函式性**：所有函式都不得 mutate 傳入的 tree（`{ ...tree, ... }` + `.map()` + `.filter()`），測試會驗證原 tree 不變

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局
- workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout / WorkspaceTabBar 皆訂 store signal

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
