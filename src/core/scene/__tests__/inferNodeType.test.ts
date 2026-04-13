import { describe, it, expect } from 'vitest';
import { inferNodeType } from '../inferNodeType';
import type { SceneNode } from '../SceneFormat';

const makeNode = (components: Record<string, unknown>): SceneNode => ({
  id: 'test-id',
  name: 'test',
  parent: null,
  order: 0,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  components,
  userData: {},
});

describe('inferNodeType', () => {
  it('returns Mesh when mesh component is present', () => {
    const node = makeNode({ mesh: { source: 'model.glb' } });
    expect(inferNodeType(node)).toBe('Mesh');
  });

  it('returns Box for geometry type box', () => {
    const node = makeNode({ geometry: { type: 'box' } });
    expect(inferNodeType(node)).toBe('Box');
  });

  it('returns Sphere for geometry type sphere', () => {
    const node = makeNode({ geometry: { type: 'sphere' } });
    expect(inferNodeType(node)).toBe('Sphere');
  });

  it('returns Plane for geometry type plane', () => {
    const node = makeNode({ geometry: { type: 'plane' } });
    expect(inferNodeType(node)).toBe('Plane');
  });

  it('returns Cylinder for geometry type cylinder', () => {
    const node = makeNode({ geometry: { type: 'cylinder' } });
    expect(inferNodeType(node)).toBe('Cylinder');
  });

  it('returns DirectionalLight for light type directional', () => {
    const node = makeNode({ light: { type: 'directional', color: 0xffffff, intensity: 1 } });
    expect(inferNodeType(node)).toBe('DirectionalLight');
  });

  it('returns AmbientLight for light type ambient', () => {
    const node = makeNode({ light: { type: 'ambient', color: 0xffffff, intensity: 0.5 } });
    expect(inferNodeType(node)).toBe('AmbientLight');
  });

  it('returns PerspectiveCamera when camera component is present', () => {
    const node = makeNode({ camera: { type: 'perspective', fov: 75, near: 0.1, far: 1000 } });
    expect(inferNodeType(node)).toBe('PerspectiveCamera');
  });

  it('returns Group when no components are present', () => {
    const node = makeNode({});
    expect(inferNodeType(node)).toBe('Group');
  });

  it('prioritises mesh over geometry when both are present', () => {
    const node = makeNode({
      mesh: { source: 'model.glb' },
      geometry: { type: 'box' },
    });
    expect(inferNodeType(node)).toBe('Mesh');
  });
});
