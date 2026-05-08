import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { v1_to_v2 } from '../migrations/v1_to_v2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../../../../../');

const v1sample = JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/v1_sample.erythos'), 'utf-8'));
const v2expected = JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/v2_sample.erythos'), 'utf-8'));

describe('v1_to_v2', () => {
  it('migrates v1 sample fixture to expected v2 shape', () => {
    expect(v1_to_v2(v1sample)).toEqual(v2expected);
  });

  it('rewrites node.asset assets:// → project://', () => {
    const v1 = {
      version: 1,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-1',
          name: 'Mesh',
          parent: null,
          order: 0,
          nodeType: 'mesh',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          asset: 'assets://models/chair.glb',
          userData: {},
        },
      ],
    };
    const result = v1_to_v2(v1);
    expect(result.version).toBe(2);
    expect(result.nodes[0].asset).toBe('project://models/chair.glb');
  });

  it('rewrites env.hdri assets:// → project://', () => {
    const v1 = {
      version: 1,
      env: { hdri: 'assets://studio.hdr', intensity: 1.5, rotation: 0.3 },
      nodes: [],
    };
    const result = v1_to_v2(v1);
    expect(result.env.hdri).toBe('project://studio.hdr');
    expect(result.env.intensity).toBe(1.5);
    expect(result.env.rotation).toBe(0.3);
  });

  it('does not rewrite prefabs:// scheme', () => {
    const v1 = {
      version: 1,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-2',
          name: 'Prefab',
          parent: null,
          order: 0,
          nodeType: 'prefab',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          asset: 'prefabs://tree-pine',
          userData: {},
        },
      ],
    };
    const result = v1_to_v2(v1);
    expect(result.nodes[0].asset).toBe('prefabs://tree-pine');
  });

  it('does not rewrite materials:// scheme', () => {
    const v1 = {
      version: 1,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-3',
          name: 'Material Node',
          parent: null,
          order: 0,
          nodeType: 'mesh',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          asset: 'materials://gold',
          userData: {},
        },
      ],
    };
    const result = v1_to_v2(v1);
    expect(result.nodes[0].asset).toBe('materials://gold');
  });

  it('does not rewrite blob:// scheme', () => {
    const v1 = {
      version: 1,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-4',
          name: 'Blob Node',
          parent: null,
          order: 0,
          nodeType: 'mesh',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          asset: 'blob://abc123',
          userData: {},
        },
      ],
    };
    const result = v1_to_v2(v1);
    expect(result.nodes[0].asset).toBe('blob://abc123');
  });

  it('env.hdri null is preserved as null', () => {
    const v1 = {
      version: 1,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [],
    };
    const result = v1_to_v2(v1);
    expect(result.env.hdri).toBeNull();
  });

  it('output version is 2', () => {
    const v1 = { version: 1, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
    expect(v1_to_v2(v1).version).toBe(2);
  });

  it('throws TypeError on non-object input', () => {
    expect(() => v1_to_v2(null)).toThrow(TypeError);
    expect(() => v1_to_v2('string')).toThrow(TypeError);
    expect(() => v1_to_v2(42)).toThrow(TypeError);
  });
});
