# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #529 — areaTree 純函式 + preset + vitest

**Branch**: `feat/529-area-tree`
**Files to create**:
- `src/app/areaTree.ts`
- `src/app/__tests__/areaTree.test.ts`

**不碰**: AreaShell / App / DockLayout / workspaceStore 等 UI 檔案。

---

#### 新檔 `src/app/areaTree.ts`（完整程式碼）

```ts
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
```

---

#### 新檔 `src/app/__tests__/areaTree.test.ts`（完整程式碼）

**注意**：純函式，不需 `vi.stubGlobal` / localStorage mock，直接 import 函式即可。

```ts
// src/app/__tests__/areaTree.test.ts
import { describe, it, expect } from 'vitest';
import {
  createLayoutPresetTree,
  createDebugPresetTree,
  createBlankTree,
  validateTree,
  computeAreaRect,
  getAllInternalEdges,
  getEdgeDragGroup,
  resizeEdge,
  MIN_AREA_PX,
} from '../areaTree';

// ---------------------------------------------------------------------------
// Preset shape tests
// ---------------------------------------------------------------------------
describe('createLayoutPresetTree', () => {
  it('8 verts / 10 edges / 3 areas', () => {
    const t = createLayoutPresetTree();
    expect(t.version).toBe(2);
    expect(t.verts).toHaveLength(8);
    expect(t.edges).toHaveLength(10);
    expect(t.areas).toHaveLength(3);
  });

  it('validateTree = true', () => {
    expect(validateTree(createLayoutPresetTree())).toBe(true);
  });

  it('所有 vert 座標 ∈ [0,1]', () => {
    for (const v of createLayoutPresetTree().verts) {
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.x).toBeLessThanOrEqual(1);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeLessThanOrEqual(1);
    }
  });

  it('含 area ids: scene-tree / viewport / properties', () => {
    const ids = createLayoutPresetTree().areas.map(a => a.id);
    expect(ids).toContain('scene-tree');
    expect(ids).toContain('viewport');
    expect(ids).toContain('properties');
  });
});

describe('createDebugPresetTree', () => {
  it('8 verts / 10 edges / 3 areas', () => {
    const t = createDebugPresetTree();
    expect(t.verts).toHaveLength(8);
    expect(t.edges).toHaveLength(10);
    expect(t.areas).toHaveLength(3);
  });

  it('validateTree = true', () => {
    expect(validateTree(createDebugPresetTree())).toBe(true);
  });

  it('含 T-junction vert (0.7, 0.6)', () => {
    const t = createDebugPresetTree();
    const tjunc = t.verts.find(v => v.x === 0.7 && v.y === 0.6);
    expect(tjunc).toBeDefined();
  });

  it('含 area ids: viewport / environment / leaf', () => {
    const ids = createDebugPresetTree().areas.map(a => a.id);
    expect(ids).toContain('viewport');
    expect(ids).toContain('environment');
    expect(ids).toContain('leaf');
  });
});

describe('createBlankTree', () => {
  it('4 verts / 4 edges / 1 area', () => {
    const t = createBlankTree();
    expect(t.verts).toHaveLength(4);
    expect(t.edges).toHaveLength(4);
    expect(t.areas).toHaveLength(1);
  });

  it('area id = viewport', () => {
    expect(createBlankTree().areas[0].id).toBe('viewport');
  });

  it('validateTree = true', () => {
    expect(validateTree(createBlankTree())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTree false cases
// ---------------------------------------------------------------------------
describe('validateTree', () => {
  it('空物件 → false', () => {
    expect(validateTree({})).toBe(false);
  });

  it('version:1 → false', () => {
    expect(validateTree({ version: 1, verts: [], edges: [], areas: [] })).toBe(false);
  });

  it('vert x=1.5 → false', () => {
    expect(validateTree({
      version: 2,
      verts: [{ id: 'x', x: 1.5, y: 0 }],
      edges: [],
      areas: [],
    })).toBe(false);
  });

  it('edge 引用不存在 vert → false', () => {
    expect(validateTree({
      version: 2,
      verts: [{ id: 'v0', x: 0, y: 0 }],
      edges: [{ id: 'e0', vertA: 'v0', vertB: 'NONEXIST', orientation: 'h' }],
      areas: [],
    })).toBe(false);
  });

  it('null → false', () => {
    expect(validateTree(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeAreaRect
// ---------------------------------------------------------------------------
describe('computeAreaRect', () => {
  it('Layout viewport @ 1000x500 → {left:220, top:0, width:500, height:500}', () => {
    const t = createLayoutPresetTree();
    const rect = computeAreaRect(t, 'viewport', 1000, 500);
    expect(rect).not.toBeNull();
    // x=0.22 → left=220; x=0.72 → right=720 → width=500; y=0→y=1 → height=500
    expect(rect!.left).toBeCloseTo(220);
    expect(rect!.top).toBeCloseTo(0);
    expect(rect!.width).toBeCloseTo(500);
    expect(rect!.height).toBeCloseTo(500);
  });

  it('Layout scene-tree @ 1000x500 → {left:0, top:0, width:220, height:500}', () => {
    const t = createLayoutPresetTree();
    const rect = computeAreaRect(t, 'scene-tree', 1000, 500);
    expect(rect).not.toBeNull();
    expect(rect!.left).toBeCloseTo(0);
    expect(rect!.top).toBeCloseTo(0);
    expect(rect!.width).toBeCloseTo(220);
    expect(rect!.height).toBeCloseTo(500);
  });

  it('未知 areaId → null', () => {
    expect(computeAreaRect(createLayoutPresetTree(), 'NO_SUCH_AREA', 1000, 500)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAllInternalEdges
// ---------------------------------------------------------------------------
describe('getAllInternalEdges', () => {
  it('Layout → 2 internal edges（兩條垂直內部）', () => {
    expect(getAllInternalEdges(createLayoutPresetTree())).toHaveLength(2);
  });

  it('Debug → 3 internal edges（2 水平內部 + 1 垂直內部）', () => {
    expect(getAllInternalEdges(createDebugPresetTree())).toHaveLength(3);
  });

  it('Blank → 0 internal edges（純外框）', () => {
    expect(getAllInternalEdges(createBlankTree())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getEdgeDragGroup
// ---------------------------------------------------------------------------
describe('getEdgeDragGroup', () => {
  it('Layout: 拖垂直內部 e8（x=0.22）→ 2 verts', () => {
    const group = getEdgeDragGroup(createLayoutPresetTree(), 'e8');
    expect(group).toHaveLength(2);
  });

  it('Layout: 拖垂直內部 e9（x=0.72）→ 2 verts', () => {
    const group = getEdgeDragGroup(createLayoutPresetTree(), 'e9');
    expect(group).toHaveLength(2);
  });

  it('Debug: 拖水平內部左段 e7（y=0.6）→ 3 verts（含 T-junction）', () => {
    const t = createDebugPresetTree();
    const group = getEdgeDragGroup(t, 'e7');
    expect(group).toHaveLength(3);
    // T-junction vert (0.7, 0.6) 必須在 group 中
    const tjuncVert = t.verts.find(v => v.x === 0.7 && v.y === 0.6)!;
    expect(group).toContain(tjuncVert.id);
  });

  it('Debug: 拖水平內部右段 e8（y=0.6）→ 同樣 3 verts', () => {
    const t = createDebugPresetTree();
    const group = getEdgeDragGroup(t, 'e8');
    expect(group).toHaveLength(3);
  });

  it('Debug: 拖垂直內部 e9（x=0.7，上半）→ 2 verts', () => {
    const group = getEdgeDragGroup(createDebugPresetTree(), 'e9');
    expect(group).toHaveLength(2);
  });

  it('未知 edgeId → 空陣列', () => {
    expect(getEdgeDragGroup(createLayoutPresetTree(), 'NO_EDGE')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resizeEdge
// ---------------------------------------------------------------------------
describe('resizeEdge', () => {
  it('Layout: 拖 e8（x=0.22）到 0.3 → 相關 vert x 變 0.3', () => {
    const t = createLayoutPresetTree();
    const result = resizeEdge(t, 'e8', 0.3, 1000);
    const group = getEdgeDragGroup(t, 'e8');
    for (const vid of group) {
      const v = result.verts.find(v => v.id === vid)!;
      expect(v.x).toBeCloseTo(0.3);
    }
  });

  it('min-size clamp: ratio=0.05 containerSize=1000 → clamp 到 0.12', () => {
    const t = createLayoutPresetTree();
    const result = resizeEdge(t, 'e8', 0.05, 1000);
    const group = getEdgeDragGroup(t, 'e8');
    const expected = MIN_AREA_PX / 1000; // 0.12
    for (const vid of group) {
      const v = result.verts.find(v => v.id === vid)!;
      expect(v.x).toBeGreaterThanOrEqual(expected - 0.001);
    }
  });

  it('純函式：原 tree 不變', () => {
    const t = createLayoutPresetTree();
    // 先紀錄原 tree 中所有 v4/v5 的 x
    const origV4x = t.verts.find(v => v.id === 'v4')!.x;
    const origV5x = t.verts.find(v => v.id === 'v5')!.x;
    resizeEdge(t, 'e8', 0.3, 1000);
    // 原 tree 不應改變
    expect(t.verts.find(v => v.id === 'v4')!.x).toBe(origV4x);
    expect(t.verts.find(v => v.id === 'v5')!.x).toBe(origV5x);
  });

  it('未知 edgeId → 回原 tree（同一物件）', () => {
    const t = createLayoutPresetTree();
    expect(resizeEdge(t, 'NO_EDGE', 0.5, 1000)).toBe(t);
  });
});
```

---

#### 驗收命令

```bash
# 型別檢查 + build
npm run build

# 只跑 areaTree 測試
npm run test -- areaTree
```

---

#### 還原命令（開 PR 前執行）

```bash
git checkout master -- src/app/CLAUDE.md
```

---

#### Commit + PR

```bash
# Commit
git add src/app/areaTree.ts src/app/__tests__/areaTree.test.ts
git commit -m "[app] areaTree 純函式 + preset + vitest (refs #529)"

# PR
gh pr create \
  --title "[app] Wave 3-1: areaTree 純函式 + preset + vitest (refs #529)" \
  --body "$(cat <<'EOF'
## 變更摘要

- 新增 `src/app/areaTree.ts`：AreaTree 型別 + 三個 preset + validateTree / computeAreaRect / getAllInternalEdges / getEdgeDragGroup / resizeEdge 純函式
- 新增 `src/app/__tests__/areaTree.test.ts`：vitest 全覆蓋（含 N=3 T-junction case）

## 測試方式

- \`npm run build\` 通過
- \`npm run test -- areaTree\` 全過

refs #529
EOF
)"
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局
- workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout / WorkspaceTabBar 皆訂 store signal

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
