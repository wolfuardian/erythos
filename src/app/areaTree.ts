// src/app/areaTree.ts

export interface ScreenVert {
  id: string;
  x: number; // normalized [0, 1]
  y: number; // normalized [0, 1]，0 在頂、1 在底（與 CSS top 一致）
}

export interface ScreenEdge {
  id: string;
  vertA: string;          // vert id
  vertB: string;          // vert id
  orientation: 'h' | 'v'; // h = 水平（兩 vert 同 y）；v = 垂直（兩 vert 同 x）
}

export interface ScreenArea {
  id: string;
  verts: { bl: string; br: string; tl: string; tr: string };
}

export interface AreaTree {
  version: 2;
  verts: ScreenVert[];
  edges: ScreenEdge[];
  areas: ScreenArea[];
}

export const MIN_AREA_PX = 120;

// ---------------------------------------------------------------------------
// Preset: Layout（三欄，純垂直分割）
// ---------------------------------------------------------------------------
// Vert index → coordinate:
//   v0=(0,0)  v1=(1,0)  v2=(0,1)  v3=(1,1)   ← 外框四角
//   v4=(0.22,0) v5=(0.22,1)                   ← 左內部垂直線
//   v6=(0.72,0) v7=(0.72,1)                   ← 右內部垂直線
//
// Edge index → endpoint verts:
//   e0 h (v0-v4)   e1 h (v4-v6)   e2 h (v6-v1)  ← 頂邊三段
//   e3 h (v2-v5)   e4 h (v5-v7)   e5 h (v7-v3)  ← 底邊三段
//   e6 v (v0-v2)   e7 v (v1-v3)                  ← 左/右外框
//   e8 v (v4-v5)   e9 v (v6-v7)                  ← 兩條垂直內部邊
//
// Areas: scene-tree (v2,v4 bl→tr=v4,v0), viewport (v5,v6 bl→tr=v6,v4), properties (v7,v1 bl→tr=v1,v6)
// ---------------------------------------------------------------------------
export function createLayoutPresetTree(): AreaTree {
  const verts: ScreenVert[] = [
    { id: 'v0', x: 0,    y: 0 },
    { id: 'v1', x: 1,    y: 0 },
    { id: 'v2', x: 0,    y: 1 },
    { id: 'v3', x: 1,    y: 1 },
    { id: 'v4', x: 0.22, y: 0 },
    { id: 'v5', x: 0.22, y: 1 },
    { id: 'v6', x: 0.72, y: 0 },
    { id: 'v7', x: 0.72, y: 1 },
  ];
  const edges: ScreenEdge[] = [
    { id: 'e0', vertA: 'v0', vertB: 'v4', orientation: 'h' },
    { id: 'e1', vertA: 'v4', vertB: 'v6', orientation: 'h' },
    { id: 'e2', vertA: 'v6', vertB: 'v1', orientation: 'h' },
    { id: 'e3', vertA: 'v2', vertB: 'v5', orientation: 'h' },
    { id: 'e4', vertA: 'v5', vertB: 'v7', orientation: 'h' },
    { id: 'e5', vertA: 'v7', vertB: 'v3', orientation: 'h' },
    { id: 'e6', vertA: 'v0', vertB: 'v2', orientation: 'v' },
    { id: 'e7', vertA: 'v1', vertB: 'v3', orientation: 'v' },
    { id: 'e8', vertA: 'v4', vertB: 'v5', orientation: 'v' }, // 垂直內部 x=0.22
    { id: 'e9', vertA: 'v6', vertB: 'v7', orientation: 'v' }, // 垂直內部 x=0.72
  ];
  const areas: ScreenArea[] = [
    { id: 'scene-tree', verts: { bl: 'v2', br: 'v5', tl: 'v0', tr: 'v4' } },
    { id: 'viewport',   verts: { bl: 'v5', br: 'v7', tl: 'v4', tr: 'v6' } },
    { id: 'properties', verts: { bl: 'v7', br: 'v3', tl: 'v6', tr: 'v1' } },
  ];
  return { version: 2, verts, edges, areas };
}

// ---------------------------------------------------------------------------
// Preset: Debug（頂兩欄 + 底全寬，含 T-junction）
// ---------------------------------------------------------------------------
// Vert index → coordinate:
//   v0=(0,0)   v1=(1,0)   v2=(0,1)   v3=(1,1)  ← 外框四角
//   v4=(0.7,0)                                  ← 頂部垂直分割與上邊交界
//   v5=(0,0.6) v6=(1,0.6)                       ← 中間水平線左右端點
//   v7=(0.7,0.6)                                ← T-junction（關鍵點）
//
// Edge index → endpoint verts:
//   e0 h (v0-v4)   e1 h (v4-v1)                ← 頂邊兩段
//   e2 h (v2-v3)                                ← 底邊一段
//   e3 v (v0-v5)   e4 v (v5-v2)                ← 左外框兩段
//   e5 v (v1-v6)   e6 v (v6-v3)                ← 右外框兩段
//   e7 h (v5-v7)   e8 h (v7-v6)                ← 水平內部兩段（y=0.6）
//   e9 v (v4-v7)                                ← 垂直內部一段（x=0.7，僅上半）
//
// Areas: viewport (tl=v0 bl=v5 tr=v4 br=v7)
//        environment (tl=v4 bl=v7 tr=v1 br=v6)
//        leaf (tl=v5 bl=v2 tr=v6 br=v3)
// ---------------------------------------------------------------------------
export function createDebugPresetTree(): AreaTree {
  const verts: ScreenVert[] = [
    { id: 'v0', x: 0,   y: 0   },
    { id: 'v1', x: 1,   y: 0   },
    { id: 'v2', x: 0,   y: 1   },
    { id: 'v3', x: 1,   y: 1   },
    { id: 'v4', x: 0.7, y: 0   },
    { id: 'v5', x: 0,   y: 0.6 },
    { id: 'v6', x: 1,   y: 0.6 },
    { id: 'v7', x: 0.7, y: 0.6 }, // T-junction
  ];
  const edges: ScreenEdge[] = [
    { id: 'e0', vertA: 'v0', vertB: 'v4', orientation: 'h' },
    { id: 'e1', vertA: 'v4', vertB: 'v1', orientation: 'h' },
    { id: 'e2', vertA: 'v2', vertB: 'v3', orientation: 'h' },
    { id: 'e3', vertA: 'v0', vertB: 'v5', orientation: 'v' },
    { id: 'e4', vertA: 'v5', vertB: 'v2', orientation: 'v' },
    { id: 'e5', vertA: 'v1', vertB: 'v6', orientation: 'v' },
    { id: 'e6', vertA: 'v6', vertB: 'v3', orientation: 'v' },
    { id: 'e7', vertA: 'v5', vertB: 'v7', orientation: 'h' }, // 水平內部左段
    { id: 'e8', vertA: 'v7', vertB: 'v6', orientation: 'h' }, // 水平內部右段
    { id: 'e9', vertA: 'v4', vertB: 'v7', orientation: 'v' }, // 垂直內部（僅上半）
  ];
  const areas: ScreenArea[] = [
    { id: 'viewport',     verts: { bl: 'v5', br: 'v7', tl: 'v0', tr: 'v4' } },
    { id: 'environment',  verts: { bl: 'v7', br: 'v6', tl: 'v4', tr: 'v1' } },
    { id: 'leaf',         verts: { bl: 'v2', br: 'v3', tl: 'v5', tr: 'v6' } },
  ];
  return { version: 2, verts, edges, areas };
}

// ---------------------------------------------------------------------------
// Preset: Blank（新建 workspace 預設）
// ---------------------------------------------------------------------------
// 4 外框角 + 4 外框邊 + 1 area
// ---------------------------------------------------------------------------
export function createBlankTree(): AreaTree {
  const verts: ScreenVert[] = [
    { id: 'v0', x: 0, y: 0 },
    { id: 'v1', x: 1, y: 0 },
    { id: 'v2', x: 0, y: 1 },
    { id: 'v3', x: 1, y: 1 },
  ];
  const edges: ScreenEdge[] = [
    { id: 'e0', vertA: 'v0', vertB: 'v1', orientation: 'h' },
    { id: 'e1', vertA: 'v2', vertB: 'v3', orientation: 'h' },
    { id: 'e2', vertA: 'v0', vertB: 'v2', orientation: 'v' },
    { id: 'e3', vertA: 'v1', vertB: 'v3', orientation: 'v' },
  ];
  const areas: ScreenArea[] = [
    { id: 'viewport', verts: { bl: 'v2', br: 'v3', tl: 'v0', tr: 'v1' } },
  ];
  return { version: 2, verts, edges, areas };
}

// ---------------------------------------------------------------------------
// validateTree: type guard + 不變量檢查
// ---------------------------------------------------------------------------
export function validateTree(tree: unknown): tree is AreaTree {
  if (typeof tree !== 'object' || tree === null) return false;
  const t = tree as Record<string, unknown>;
  if (t['version'] !== 2) return false;
  if (!Array.isArray(t['verts']) || !Array.isArray(t['edges']) || !Array.isArray(t['areas'])) return false;

  const vertIds = new Set<string>();
  for (const v of t['verts'] as unknown[]) {
    if (typeof v !== 'object' || v === null) return false;
    const vv = v as Record<string, unknown>;
    if (typeof vv['id'] !== 'string') return false;
    if (typeof vv['x'] !== 'number' || vv['x'] < 0 || vv['x'] > 1) return false;
    if (typeof vv['y'] !== 'number' || vv['y'] < 0 || vv['y'] > 1) return false;
    vertIds.add(vv['id'] as string);
  }

  for (const e of t['edges'] as unknown[]) {
    if (typeof e !== 'object' || e === null) return false;
    const ee = e as Record<string, unknown>;
    if (typeof ee['id'] !== 'string') return false;
    if (typeof ee['vertA'] !== 'string' || !vertIds.has(ee['vertA'] as string)) return false;
    if (typeof ee['vertB'] !== 'string' || !vertIds.has(ee['vertB'] as string)) return false;
    if (ee['orientation'] !== 'h' && ee['orientation'] !== 'v') return false;
  }

  for (const a of t['areas'] as unknown[]) {
    if (typeof a !== 'object' || a === null) return false;
    const aa = a as Record<string, unknown>;
    if (typeof aa['id'] !== 'string') return false;
    const av = aa['verts'];
    if (typeof av !== 'object' || av === null) return false;
    const avv = av as Record<string, unknown>;
    for (const corner of ['bl', 'br', 'tl', 'tr'] as const) {
      if (typeof avv[corner] !== 'string' || !vertIds.has(avv[corner] as string)) return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// computeAreaRect: 由 area.verts.bl/tl 算出像素 rect
// y=0 在頂、y=1 在底（CSS top 一致）
// left  = bl.x * W
// top   = tl.y * H
// width = (br.x - bl.x) * W
// height= (bl.y - tl.y) * H
// ---------------------------------------------------------------------------
export function computeAreaRect(
  tree: AreaTree,
  areaId: string,
  containerW: number,
  containerH: number,
): { left: number; top: number; width: number; height: number } | null {
  const area = tree.areas.find(a => a.id === areaId);
  if (!area) return null;
  const vertMap = new Map(tree.verts.map(v => [v.id, v]));
  const bl = vertMap.get(area.verts.bl);
  const br = vertMap.get(area.verts.br);
  const tl = vertMap.get(area.verts.tl);
  if (!bl || !br || !tl) return null;
  return {
    left:   bl.x * containerW,
    top:    tl.y * containerH,
    width:  (br.x - bl.x) * containerW,
    height: (bl.y - tl.y) * containerH,
  };
}

// ---------------------------------------------------------------------------
// getAllInternalEdges: 排除兩端都在同一外框邊界線上的 edges
// 外框規則：兩端都在 x=0，或都在 x=1，或都在 y=0，或都在 y=1 → 外框 edge，排除
// 注意：只有「兩端 *同一條* 邊界線」才排除（例如 (0,0.6)-(0.7,0.6) 中 vertA 在 x=0，
// 但 vertB 不在 x=0，兩端不在同一邊界 → 保留為內部 edge）
// ---------------------------------------------------------------------------
export function getAllInternalEdges(tree: AreaTree): ScreenEdge[] {
  const vertMap = new Map(tree.verts.map(v => [v.id, v]));
  return tree.edges.filter(e => {
    const a = vertMap.get(e.vertA);
    const b = vertMap.get(e.vertB);
    if (!a || !b) return false;
    if (a.x === 0   && b.x === 0)   return false; // 左外框
    if (a.x === 1   && b.x === 1)   return false; // 右外框
    if (a.y === 0   && b.y === 0)   return false; // 頂外框
    if (a.y === 1   && b.y === 1)   return false; // 底外框
    return true;
  });
}

// ---------------------------------------------------------------------------
// getEdgeDragGroup: 回傳所有與被拖 edge 共線連通的 vert id（含被拖 edge 兩端）
//
// 演算法（BFS）：
//   1. 取被拖 edge 的 orientation（v → 拖 x 軸；h → 拖 y 軸）
//   2. 從被拖 edge 的兩端 vert 出發（都加入 visited）
//   3. 對每個 vert，找所有以其為端點、orientation = 被拖 edge orientation 的其他 edges
//   4. 若另一端 vert 和當前 vert 在拖曳軸上共同座標（垂直→ 同 x；水平→ 同 y）→ 加入 group，遞迴
//   5. 回傳所有連通 vert 的 id 列表
//
// T-junction 舉例（Debug preset，拖水平內部 edge e7 = v5-v7，y=0.6）：
//   v5(0,0.6) 和 v7(0.7,0.6) 都在 y=0.6
//   從 v7 出發找 orientation=h 的 edges：e8=(v7-v6)；v6.y=0.6 → 加入
//   結果 group = {v5, v7, v6} = N=3
// ---------------------------------------------------------------------------
export function getEdgeDragGroup(tree: AreaTree, edgeId: string): string[] {
  const edge = tree.edges.find(e => e.id === edgeId);
  if (!edge) return [];

  const vertMap = new Map(tree.verts.map(v => [v.id, v]));
  const isVertical = edge.orientation === 'v';

  // 取得拖曳軸上的 coord（垂直 edge 拖 x，水平 edge 拖 y）
  const getCoord = (v: ScreenVert) => isVertical ? v.x : v.y;

  const startA = vertMap.get(edge.vertA);
  const startB = vertMap.get(edge.vertB);
  if (!startA || !startB) return [];

  // 所有端點按 orientation 建索引：edge orientation = 被拖 edge orientation
  const edgesByVert = new Map<string, string[]>();
  for (const e of tree.edges) {
    if (e.orientation !== edge.orientation) continue;
    if (!edgesByVert.has(e.vertA)) edgesByVert.set(e.vertA, []);
    if (!edgesByVert.has(e.vertB)) edgesByVert.set(e.vertB, []);
    edgesByVert.get(e.vertA)!.push(e.vertB);
    edgesByVert.get(e.vertB)!.push(e.vertA);
  }

  const targetCoord = getCoord(startA); // startA 和 startB 應在同拖曳軸座標
  const visited = new Set<string>();
  const queue: string[] = [edge.vertA, edge.vertB];
  visited.add(edge.vertA);
  visited.add(edge.vertB);

  while (queue.length > 0) {
    const vertId = queue.shift()!;
    const neighbors = edgesByVert.get(vertId) ?? [];
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      const neighbor = vertMap.get(neighborId);
      if (!neighbor) continue;
      // 只在拖曳軸同座標的 vert 才連動
      if (getCoord(neighbor) === targetCoord) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  return Array.from(visited);
}

// ---------------------------------------------------------------------------
// resizeEdge: 不可變更新 tree，移動 edge group 到 newRatio
// min-size clamp（兩階段）：
//   1. absolute clamp: [MIN_AREA_PX/containerSize, 1 - MIN_AREA_PX/containerSize]
//   2. per-area check: 每個含 group vert 的相鄰 area 在新 ratio 下 width/height ≥ MIN_AREA_PX
// ---------------------------------------------------------------------------
export function resizeEdge(
  tree: AreaTree,
  edgeId: string,
  newRatio: number,
  containerSize: number,
): AreaTree {
  const edge = tree.edges.find(e => e.id === edgeId);
  if (!edge) return tree;

  const isVertical = edge.orientation === 'v';

  // 第一階段：絕對 clamp
  const minRatio = MIN_AREA_PX / containerSize;
  let clamped = Math.max(minRatio, Math.min(1 - minRatio, newRatio));

  // 取得 group vert ids
  const groupVertIds = new Set(getEdgeDragGroup(tree, edgeId));

  // 第二階段：per-area clamp
  // 找出所有「至少有一個角落 vert 在 group 中」的 areas，測試新 ratio 是否造成 < MIN_AREA_PX
  const containerW = isVertical ? containerSize : 1000; // 水平 edge 只 clamp 高度
  const containerH = isVertical ? 1000 : containerSize;

  for (const area of tree.areas) {
    const areaVerts = [area.verts.bl, area.verts.br, area.verts.tl, area.verts.tr];
    if (!areaVerts.some(vid => groupVertIds.has(vid))) continue;

    // 試算：以 clamped 更新相關 vert 後算 area rect
    const tempVerts = tree.verts.map(v =>
      groupVertIds.has(v.id)
        ? { ...v, ...(isVertical ? { x: clamped } : { y: clamped }) }
        : v,
    );
    const tempTree: AreaTree = { ...tree, verts: tempVerts };
    const rect = computeAreaRect(tempTree, area.id, containerW, containerH);
    if (!rect) continue;

    // 若違反 min-size，找出限制這個 area 的邊界值並 clamp
    if (isVertical && rect.width < MIN_AREA_PX) {
      // 找出此 area 非 group 的邊界 x（另一側）
      const nonGroupVerts = [area.verts.bl, area.verts.br, area.verts.tl, area.verts.tr]
        .filter(vid => !groupVertIds.has(vid))
        .map(vid => tree.verts.find(v => v.id === vid)!)
        .filter(Boolean);
      if (nonGroupVerts.length > 0) {
        const otherX = nonGroupVerts[0].x;
        // 調整 clamped 讓 area width = MIN_AREA_PX
        const minW = MIN_AREA_PX / containerSize;
        if (otherX < clamped) {
          clamped = Math.min(clamped, otherX + minW);
        } else {
          clamped = Math.max(clamped, otherX - minW);
        }
      }
    } else if (!isVertical && rect.height < MIN_AREA_PX) {
      const nonGroupVerts = [area.verts.bl, area.verts.br, area.verts.tl, area.verts.tr]
        .filter(vid => !groupVertIds.has(vid))
        .map(vid => tree.verts.find(v => v.id === vid)!)
        .filter(Boolean);
      if (nonGroupVerts.length > 0) {
        const otherY = nonGroupVerts[0].y;
        const minH = MIN_AREA_PX / containerSize;
        if (otherY < clamped) {
          clamped = Math.min(clamped, otherY + minH);
        } else {
          clamped = Math.max(clamped, otherY - minH);
        }
      }
    }
  }

  // 不可變更新：重建 verts 陣列
  const newVerts = tree.verts.map(v =>
    groupVertIds.has(v.id)
      ? { ...v, ...(isVertical ? { x: clamped } : { y: clamped }) }
      : v,
  );

  return { ...tree, verts: newVerts };
}

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
