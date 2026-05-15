import { describe, it, expect } from 'vitest';
import { v3_to_v4 } from '../migrations/v3_to_v4';

describe('v3_to_v4', () => {
  it('output version is 4', () => {
    const v3 = { version: 3, upAxis: 'Y', env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
    expect(v3_to_v4(v3).version).toBe(4);
  });

  it('output upAxis is "Y"', () => {
    const v3 = { version: 3, upAxis: 'Y', env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
    expect(v3_to_v4(v3).upAxis).toBe('Y');
  });

  it('rewrites project://primitives/<type> asset URL to primitives://<type>', () => {
    const v3 = {
      version: 3,
      upAxis: 'Y',
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-1',
          name: 'Cube',
          parent: null,
          order: 0,
          nodeType: 'mesh',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          asset: 'project://primitives/box',
          userData: {},
        },
      ],
    };
    const result = v3_to_v4(v3);
    expect(result.nodes[0].asset).toBe('primitives://box');
  });

  it('leaves non-primitive project:// URLs unchanged', () => {
    const v3 = {
      version: 3,
      upAxis: 'Y',
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-2',
          name: 'Chair',
          parent: null,
          order: 0,
          nodeType: 'mesh',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          asset: 'project://models/chair.glb',
          userData: {},
        },
      ],
    };
    const result = v3_to_v4(v3);
    expect(result.nodes[0].asset).toBe('project://models/chair.glb');
  });

  it('leaves nodes without asset field unchanged', () => {
    const v3 = {
      version: 3,
      upAxis: 'Y',
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-3',
          name: 'Sun',
          parent: null,
          order: 0,
          nodeType: 'light',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          userData: {},
        },
      ],
    };
    const result = v3_to_v4(v3);
    expect('asset' in result.nodes[0]).toBe(false);
  });

  it('handles all primitive types (sphere, plane, cylinder)', () => {
    const types = ['sphere', 'plane', 'cylinder'];
    for (const type of types) {
      const v3 = {
        version: 3,
        upAxis: 'Y',
        env: { hdri: null, intensity: 1, rotation: 0 },
        nodes: [{ id: 'n', name: 'P', parent: null, order: 0, nodeType: 'mesh',
          position: [0,0,0], rotation: [0,0,0], scale: [1,1,1],
          asset: `project://primitives/${type}`, userData: {} }],
      };
      expect(v3_to_v4(v3).nodes[0].asset).toBe(`primitives://${type}`);
    }
  });

  it('preserves env fields unchanged', () => {
    const v3 = {
      version: 3,
      upAxis: 'Y',
      env: { hdri: 'project://studio.hdr', intensity: 2.5, rotation: 1.2 },
      nodes: [],
    };
    const result = v3_to_v4(v3);
    expect(result.env.hdri).toBe('project://studio.hdr');
    expect(result.env.intensity).toBe(2.5);
    expect(result.env.rotation).toBe(1.2);
  });

  it('throws TypeError on non-object input', () => {
    expect(() => v3_to_v4(null)).toThrow(TypeError);
    expect(() => v3_to_v4('string')).toThrow(TypeError);
    expect(() => v3_to_v4(42)).toThrow(TypeError);
  });
});
