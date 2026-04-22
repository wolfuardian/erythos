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
