import { describe, it, expect } from 'vitest';
import { inferNodeType } from '../inferNodeType';
import type { SceneNode } from '../SceneFormat';

const makeNode = (nodeType: SceneNode['nodeType']): SceneNode => ({
  id: 'test-id',
  name: 'test',
  parent: null,
  order: 0,
  nodeType,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  userData: {},
});

describe('inferNodeType', () => {
  it('returns mesh for mesh nodeType', () => {
    expect(inferNodeType(makeNode('mesh'))).toBe('mesh');
  });

  it('returns light for light nodeType', () => {
    expect(inferNodeType(makeNode('light'))).toBe('light');
  });

  it('returns camera for camera nodeType', () => {
    expect(inferNodeType(makeNode('camera'))).toBe('camera');
  });

  it('returns prefab for prefab nodeType', () => {
    expect(inferNodeType(makeNode('prefab'))).toBe('prefab');
  });

  it('returns group for group nodeType', () => {
    expect(inferNodeType(makeNode('group'))).toBe('group');
  });
});
