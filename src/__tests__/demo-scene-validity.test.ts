/**
 * Demo scene validity — regression guard
 *
 * Imports shared/onboarding/demo-scene.json (the single source used by the server
 * to provision Demo scenes for new users) and asserts that it passes the SAME
 * client-side validation pipeline that cloud-scene-load runs on real user data.
 *
 * This prevents the T2-class bug: server authors a malformed Demo blob → every
 * new user's first scene load throws SceneInvariantError on the client.
 *
 * Validation path exercised (mirrors SceneDocument.deserialize):
 *   1. checkRawVersion   — rejects invalid / future version
 *   2. checkRawUpAxis    — rejects v3 with upAxis !== 'Y'
 *   3. v0_to_v1 + v1_to_v2 + v2_to_v3 migration chain
 *   4. validateScene     — structural invariants (Zod + bespoke checks)
 *   5. SceneDocument.deserialize — full round-trip, confirms no throw
 */

import { describe, it, expect } from 'vitest';
import demoScene from '../../shared/onboarding/demo-scene.json';
import { SceneDocument } from '../core/scene/SceneDocument';

describe('shared/onboarding/demo-scene.json validity', () => {
  it('passes SceneDocument.deserialize without throwing', () => {
    const doc = new SceneDocument();
    // If the blob is malformed in any way that the client validation catches,
    // this throws SceneInvariantError or UnsupportedVersionError.
    expect(() => doc.deserialize(demoScene)).not.toThrow();
  });

  it('deserializes to exactly 2 nodes (Cube + Sun)', () => {
    const doc = new SceneDocument();
    doc.deserialize(demoScene);
    const nodes = doc.getAllNodes();
    expect(nodes).toHaveLength(2);
    const names = nodes.map(n => n.name).sort();
    expect(names).toEqual(['Cube', 'Sun']);
  });

  it('Cube node is a mesh with primitives://box asset', () => {
    const doc = new SceneDocument();
    doc.deserialize(demoScene);
    const cube = doc.getAllNodes().find(n => n.name === 'Cube');
    expect(cube).toBeDefined();
    expect(cube!.nodeType).toBe('mesh');
    expect(cube!.asset).toBe('primitives://box');
  });

  it('Sun node is a directional light', () => {
    const doc = new SceneDocument();
    doc.deserialize(demoScene);
    const sun = doc.getAllNodes().find(n => n.name === 'Sun');
    expect(sun).toBeDefined();
    expect(sun!.nodeType).toBe('light');
    expect(sun!.light).toBeDefined();
    expect(sun!.light!.type).toBe('directional');
  });
});
