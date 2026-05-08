import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { v2_to_v3 } from '../migrations/v2_to_v3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../../../../../');

const v2sample = JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/v2_sample.erythos'), 'utf-8'));
const v3expected = JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/v3_sample.erythos'), 'utf-8'));

describe('v2_to_v3', () => {
  it('migrates v2 sample fixture to expected v3 shape', () => {
    expect(v2_to_v3(v2sample)).toEqual(v3expected);
  });

  it('output version is 3', () => {
    const v2 = { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
    expect(v2_to_v3(v2).version).toBe(3);
  });

  it('output upAxis is "Y"', () => {
    const v2 = { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
    expect(v2_to_v3(v2).upAxis).toBe('Y');
  });

  it('preserves env fields unchanged', () => {
    const v2 = {
      version: 2,
      env: { hdri: 'project://studio.hdr', intensity: 2.5, rotation: 1.2 },
      nodes: [],
    };
    const result = v2_to_v3(v2);
    expect(result.env.hdri).toBe('project://studio.hdr');
    expect(result.env.intensity).toBe(2.5);
    expect(result.env.rotation).toBe(1.2);
  });

  it('preserves nodes unchanged', () => {
    const v2 = {
      version: 2,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: 'node-1',
          name: 'Mesh',
          parent: null,
          order: 0,
          nodeType: 'mesh',
          position: [0, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [1, 1, 1] as [number, number, number],
          asset: 'project://models/chair.glb',
          userData: {},
        },
      ],
    };
    const result = v2_to_v3(v2);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('node-1');
    expect(result.nodes[0].asset).toBe('project://models/chair.glb');
  });

  it('env.hdri null is preserved as null', () => {
    const v2 = { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
    const result = v2_to_v3(v2);
    expect(result.env.hdri).toBeNull();
  });

  it('throws TypeError on non-object input', () => {
    expect(() => v2_to_v3(null)).toThrow(TypeError);
    expect(() => v2_to_v3('string')).toThrow(TypeError);
    expect(() => v2_to_v3(42)).toThrow(TypeError);
  });
});
