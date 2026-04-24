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
  getAreaAt,
  getCornerAt,
  getCornerNeighbors,
  canSplit,
  canMerge,
  splitArea,
  mergeArea,
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
