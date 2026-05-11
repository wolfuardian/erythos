/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { v0_to_v1 } from '../migrations/v0_to_v1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../../../../../');

const v0sample = JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/v0_sample.erythos'), 'utf-8'));
const v1expected = JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/v1_sample.erythos'), 'utf-8'));

describe('v0_to_v1', () => {
  it('migrates sample fixture to expected v1 shape', () => {
    expect(v0_to_v1(v0sample)).toEqual(v1expected);
  });

  it('node with empty components bag becomes group', () => {
    const v0 = {
      version: 1,
      nodes: [
        {
          id: 'aaaa-0000',
          name: 'Empty',
          parent: null,
          order: 0,
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          components: {},
          userData: {},
        },
      ],
    };
    const result = v0_to_v1(v0);
    expect(result.nodes[0].nodeType).toBe('group');
    expect(result.nodes[0].asset).toBeUndefined();
    expect(result.nodes[0].light).toBeUndefined();
    expect(result.nodes[0].camera).toBeUndefined();
  });

  it('numberToHex zero-pads correctly: 0x00ff00 → "#00ff00"', () => {
    const v0 = {
      version: 1,
      nodes: [
        {
          id: 'bbbb-0001',
          name: 'Green Light',
          parent: null,
          order: 0,
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          components: {
            light: { type: 'directional', color: 0x00ff00, intensity: 1 },
          },
          userData: {},
        },
      ],
    };
    const result = v0_to_v1(v0);
    expect(result.nodes[0].light?.color).toBe('#00ff00');
  });

  it('nested parent/child relation is preserved', () => {
    const v0 = {
      version: 1,
      nodes: [
        {
          id: 'parent-001',
          name: 'Parent Group',
          parent: null,
          order: 0,
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          components: {},
          userData: {},
        },
        {
          id: 'child-001',
          name: 'Child Mesh',
          parent: 'parent-001',
          order: 0,
          position: [1, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          components: {
            mesh: { path: 'models/box.glb' },
          },
          userData: {},
        },
      ],
    };
    const result = v0_to_v1(v0);
    expect(result.nodes[0].id).toBe('parent-001');
    expect(result.nodes[0].parent).toBeNull();
    expect(result.nodes[1].id).toBe('child-001');
    expect(result.nodes[1].parent).toBe('parent-001');
    expect(result.nodes[1].nodeType).toBe('mesh');
    expect(result.nodes[1].asset).toBe('assets://models/box.glb');
  });

  it('userData from v0 is discarded — output always has empty {}', () => {
    const v0 = {
      version: 1,
      nodes: [
        {
          id: 'cccc-0001',
          name: 'Node With UserData',
          parent: null,
          order: 0,
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          components: {},
          userData: { secret: 'should be dropped', count: 42 },
        },
      ],
    };
    const result = v0_to_v1(v0);
    expect(result.nodes[0].userData).toEqual({});
  });

  it('top-level env defaults are always injected', () => {
    const v0 = { version: 1, nodes: [] };
    const result = v0_to_v1(v0);
    expect(result.env).toEqual({ hdri: null, intensity: 1, rotation: 0 });
  });

  it('prefab path is stripped of prefabs/ prefix and .prefab suffix', () => {
    const v0 = {
      version: 1,
      nodes: [
        {
          id: 'dddd-0001',
          name: 'Prefab Node',
          parent: null,
          order: 0,
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          components: {
            prefab: { path: 'prefabs/chair.prefab' },
          },
          userData: {},
        },
      ],
    };
    const result = v0_to_v1(v0);
    expect(result.nodes[0].nodeType).toBe('prefab');
    expect(result.nodes[0].asset).toBe('prefabs://chair');
  });
});
