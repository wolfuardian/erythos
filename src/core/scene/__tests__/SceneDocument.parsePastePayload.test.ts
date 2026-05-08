/**
 * SceneDocument.parsePastePayload — unit tests
 *
 * Covers the 4 required acceptance paths:
 *   1. Valid v2 JSON → returns runtime SceneNode[] with fresh ids
 *   2. Invalid JSON shape (structural) → throws SceneInvariantError
 *   3. Version mismatch (future version) → throws UnsupportedVersionError
 *   4. Id-conflict scenario → paste same JSON twice; both succeed with distinct ids
 *
 * Plus:
 *   5. v1 fixture → migrated to v2, passes (migration coverage)
 *   6. Parent-child relationship preserved within pasted batch
 *   7. targetParentId wired to root nodes
 */
import { describe, it, expect } from 'vitest';
import { SceneDocument, SceneInvariantError, UnsupportedVersionError } from '../SceneDocument';
import { asNodeUUID } from '../../../utils/branded';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Minimal valid v2 scene with one group node at scene root. */
const V2_SINGLE_NODE = {
  version: 2,
  env: { hdri: null, intensity: 1, rotation: 0 },
  nodes: [
    {
      id: 'node-a',
      name: 'Group A',
      parent: null,
      order: 0,
      nodeType: 'group',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      userData: {},
    },
  ],
};

/** v2 scene with parent-child pair. */
const V2_PARENT_CHILD = {
  version: 2,
  env: { hdri: null, intensity: 1, rotation: 0 },
  nodes: [
    {
      id: 'parent-id',
      name: 'Parent',
      parent: null,
      order: 0,
      nodeType: 'group',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      userData: {},
    },
    {
      id: 'child-id',
      name: 'Child',
      parent: 'parent-id',
      order: 0,
      nodeType: 'group',
      position: [1, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      userData: {},
    },
  ],
};

/** Minimal valid v1 scene (assets:// scheme) to test migration path. */
const V1_SINGLE_NODE = {
  version: 1,
  env: { hdri: null, intensity: 1, rotation: 0 },
  nodes: [
    {
      id: 'v1-node',
      name: 'V1 Group',
      parent: null,
      order: 0,
      nodeType: 'group',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      userData: {},
    },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SceneDocument.parsePastePayload', () => {
  // 1. Valid v2 → returns SceneNode[] with fresh ids
  it('valid v2 JSON returns runtime nodes with fresh ids', () => {
    const doc = new SceneDocument();
    const result = doc.parsePastePayload(V2_SINGLE_NODE, null);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Group A');
    // id must be re-minted (not the original 'node-a')
    expect(result[0].id).not.toBe('node-a');
    expect(result[0].parent).toBeNull();
  });

  // 2. Invalid JSON shape → SceneInvariantError
  it('scene with invalid shape throws SceneInvariantError', () => {
    const doc = new SceneDocument();
    const badScene = {
      version: 2,
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [
        {
          id: '',           // violates id min-length
          name: 'Bad',
          parent: null,
          order: 0,
          nodeType: 'group',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          userData: {},
        },
      ],
    };
    expect(() => doc.parsePastePayload(badScene, null)).toThrow(SceneInvariantError);
  });

  // 3. Version mismatch → UnsupportedVersionError
  it('future version throws UnsupportedVersionError', () => {
    const doc = new SceneDocument();
    const futureScene = { version: 9999, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
    expect(() => doc.parsePastePayload(futureScene, null)).toThrow(UnsupportedVersionError);
  });

  // 4. Id-conflict scenario — paste same JSON twice; both should succeed with distinct ids
  it('pasting the same JSON twice mints distinct ids (no collision)', () => {
    const doc = new SceneDocument();
    const first = doc.parsePastePayload(V2_SINGLE_NODE, null);
    const second = doc.parsePastePayload(V2_SINGLE_NODE, null);

    expect(first[0].id).not.toBe('node-a');
    expect(second[0].id).not.toBe('node-a');
    expect(first[0].id).not.toBe(second[0].id);
  });

  // 5. v1 fixture → migrated, passes
  it('v1 fixture is migrated to v2 and returns nodes', () => {
    const doc = new SceneDocument();
    const result = doc.parsePastePayload(V1_SINGLE_NODE, null);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('V1 Group');
    expect(result[0].id).not.toBe('v1-node');
  });

  // 6. Parent-child relationship preserved within batch
  it('parent-child ids are rewritten consistently within the pasted batch', () => {
    const doc = new SceneDocument();
    const result = doc.parsePastePayload(V2_PARENT_CHILD, null);

    expect(result).toHaveLength(2);
    const parent = result.find(n => n.name === 'Parent')!;
    const child  = result.find(n => n.name === 'Child')!;

    // Both ids must be re-minted
    expect(parent.id).not.toBe('parent-id');
    expect(child.id).not.toBe('child-id');

    // Child must point to the new parent id
    expect(child.parent).toBe(parent.id);
  });

  // 7. targetParentId wired to root nodes
  it('root nodes receive the provided targetParentId', () => {
    const doc = new SceneDocument();
    const target = asNodeUUID('target-uuid');
    const result = doc.parsePastePayload(V2_SINGLE_NODE, target);

    expect(result[0].parent).toBe(target);
  });

  // 7b. targetParentId=null produces scene-root nodes
  it('targetParentId=null leaves root nodes at scene root', () => {
    const doc = new SceneDocument();
    const result = doc.parsePastePayload(V2_SINGLE_NODE, null);

    expect(result[0].parent).toBeNull();
  });

  // 8. Non-root nodes of the pasted batch keep their intra-batch parent (not targetParentId)
  it('non-root nodes use intra-batch parent, not targetParentId', () => {
    const doc = new SceneDocument();
    const target = asNodeUUID('target-uuid');
    const result = doc.parsePastePayload(V2_PARENT_CHILD, target);

    const parent = result.find(n => n.name === 'Parent')!;
    const child  = result.find(n => n.name === 'Child')!;

    // Parent should be placed under targetParentId
    expect(parent.parent).toBe(target);
    // Child should point to the new parent id, not targetParentId
    expect(child.parent).toBe(parent.id);
  });
});
