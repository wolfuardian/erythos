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
