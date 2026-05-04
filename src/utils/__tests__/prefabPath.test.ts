import { describe, it, expect } from 'vitest';
import { prefabPathForName } from '../prefabPath';

describe('prefabPathForName', () => {
  it('produces prefabs/<name>.prefab for clean names', () => {
    expect(prefabPathForName('Tree')).toBe('prefabs/Tree.prefab');
  });

  it('replaces invalid filename chars with dash', () => {
    expect(prefabPathForName('a/b\\c?d')).toBe('prefabs/a-b-c-d.prefab');
  });

  it('collapses whitespace to underscore', () => {
    expect(prefabPathForName('My Cool Tree')).toBe('prefabs/My_Cool_Tree.prefab');
  });

  it('falls back to "prefab" for empty name', () => {
    expect(prefabPathForName('')).toBe('prefabs/prefab.prefab');
  });

  it('whitespace-only name collapses to underscore (legacy sanitizeName behavior)', () => {
    // Note: matches Editor.sanitizeName pre-extraction. Whitespace → underscore happens
    // before trim, so the result is "_" not the "prefab" fallback. Preserved verbatim.
    expect(prefabPathForName('   ')).toBe('prefabs/_.prefab');
  });
});
