/**
 * Unit tests for uploadSceneBinaries helper.
 *
 * Uses MockAssetServer as the AssetSyncClient and an in-memory mock for
 * ProjectManagerLike (avoiding real ProjectManager / FileSystemAPI / solid-js signals).
 *
 * Test matrix:
 *   - all project:// URLs in nodes → rewritten to assets://
 *   - env.hdri project:// → rewritten to assets://
 *   - pre-existing assets:// URLs are passed through unchanged (idempotent)
 *   - duplicate project:// URL in same scene → only uploaded once (dedup cache)
 *   - upload failure propagates as-thrown
 *   - ProjectManager read failure propagates as-thrown
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneDocument } from '../../scene/SceneDocument';
import { MockAssetServer } from './MockAssetServer';
import { uploadSceneBinaries, type ProjectManagerLike } from './uploadSceneBinaries';
import type { AssetPath } from '../../../utils/branded';
import { asAssetPath } from '../../../utils/branded';
import { AssetHashMismatchError } from './AssetSyncClient';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build an in-memory ProjectManagerLike backed by a string→File map.
 * `File` is created from a Uint8Array with the given filename (name matters
 * for assets:// URL construction via MockAssetServer).
 */
function makeMockPm(files: Record<string, Uint8Array>): ProjectManagerLike {
  return {
    readFile: vi.fn(async (path: AssetPath) => {
      const key = path as string;
      const data = files[key];
      if (!data) throw new Error(`MockPM: file not found: ${path}`);
      // Derive filename from the last path segment (mirrors FileSystemFileHandle.getFile())
      const name = key.split('/').pop() ?? key;
      return new File([data], name);
    }),
  };
}

/**
 * Build a minimal SceneDocument with one mesh node at `project://models/cube.glb`.
 */
function makeSceneWithNode(assetUrl: string): SceneDocument {
  const doc = new SceneDocument();
  const node = doc.createNode('Cube');
  // Set the node to mesh type with an asset
  (node as any).nodeType = 'mesh';
  (node as any).asset = assetUrl;
  doc.addNode(node);
  return doc;
}

/**
 * Build a minimal SceneDocument with env.hdri set.
 */
function makeSceneWithHdri(hdriUrl: string): SceneDocument {
  const doc = new SceneDocument();
  doc.setEnv({ hdri: hdriUrl });
  return doc;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('uploadSceneBinaries', () => {

  it('rewrites a node project:// asset URL to assets://', async () => {
    const fileData = new Uint8Array([1, 2, 3]);
    const pm = makeMockPm({ 'models/cube.glb': fileData });
    const client = new MockAssetServer();

    const scene = makeSceneWithNode('project://models/cube.glb');
    const result = await uploadSceneBinaries(scene, pm, client);

    const nodes = result.getAllNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].asset).toMatch(/^assets:\/\//);
    expect(nodes[0].asset).toContain('cube.glb');
  });

  it('rewrites env.hdri project:// URL to assets://', async () => {
    const fileData = new Uint8Array([10, 20, 30]);
    const pm = makeMockPm({ 'hdris/studio.hdr': fileData });
    const client = new MockAssetServer();

    const scene = makeSceneWithHdri('project://hdris/studio.hdr');
    const result = await uploadSceneBinaries(scene, pm, client);

    expect(result.env.hdri).toMatch(/^assets:\/\//);
    expect(result.env.hdri).toContain('studio.hdr');
  });

  it('passes through pre-existing assets:// URL unchanged (idempotent)', async () => {
    const pm = makeMockPm({}); // no files needed
    const client = new MockAssetServer();
    // Must be a valid 64-hex sha256 so v1_to_v2.rewriteAssetScheme passes it through
    const existingUrl = `assets://${'a'.repeat(64)}/texture.png`;

    const scene = makeSceneWithNode(existingUrl);
    const result = await uploadSceneBinaries(scene, pm, client);

    const nodes = result.getAllNodes();
    expect(nodes[0].asset).toBe(existingUrl);
    // PM readFile should not have been called
    expect(pm.readFile).not.toHaveBeenCalled();
    expect(client.size).toBe(0); // nothing uploaded
  });

  it('passes through null env.hdri unchanged', async () => {
    const pm = makeMockPm({});
    const client = new MockAssetServer();

    const doc = new SceneDocument(); // default env.hdri = null
    const result = await uploadSceneBinaries(doc, pm, client);

    expect(result.env.hdri).toBeNull();
    expect(client.size).toBe(0);
  });

  it('deduplicates: same project:// URL in multiple nodes is uploaded only once', async () => {
    const fileData = new Uint8Array([5, 6, 7]);
    const pm = makeMockPm({ 'models/shared.glb': fileData });
    const client = new MockAssetServer();

    // Build scene with two mesh nodes both referencing the same asset
    const doc = new SceneDocument();
    const n1 = doc.createNode('Mesh1');
    (n1 as any).nodeType = 'mesh';
    (n1 as any).asset = 'project://models/shared.glb';
    const n2 = doc.createNode('Mesh2');
    (n2 as any).nodeType = 'mesh';
    (n2 as any).asset = 'project://models/shared.glb';
    doc.addNode(n1);
    doc.addNode(n2);

    const result = await uploadSceneBinaries(doc, pm, client);

    // Server should have exactly one asset stored
    expect(client.size).toBe(1);

    // PM readFile should have been called only once (dedup cache hit on second node)
    expect(pm.readFile).toHaveBeenCalledTimes(1);

    // Both nodes should have the same assets:// URL
    const nodes = result.getAllNodes();
    expect(nodes[0].asset).toMatch(/^assets:\/\//);
    expect(nodes[1].asset).toBe(nodes[0].asset);
  });

  it('skips upload (headHash hit): asset already on server', async () => {
    const fileData = new Uint8Array([9, 8, 7]);
    const pm = makeMockPm({ 'textures/wall.png': fileData });
    const client = new MockAssetServer();

    // Pre-upload the same file so headHash returns true
    const file = new File([fileData], 'wall.png');
    const buffer = await file.arrayBuffer();
    const { sha256: sha256fn } = await import('./sha256');
    const hash = await sha256fn(buffer);
    await client.upload(file, hash); // pre-seed the server

    expect(client.size).toBe(1);

    const scene = makeSceneWithNode('project://textures/wall.png');

    // Spy on upload to verify it's NOT called again
    const uploadSpy = vi.spyOn(client, 'upload');
    const result = await uploadSceneBinaries(scene, pm, client);

    // upload was not called — dedup path via headHash
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(client.size).toBe(1); // still only one asset

    const nodes = result.getAllNodes();
    expect(nodes[0].asset).toMatch(/^assets:\/\//);
    expect(nodes[0].asset).toContain('wall.png');
  });

  it('propagates upload failure (e.g. AssetHashMismatchError)', async () => {
    const fileData = new Uint8Array([1]);
    const pm = makeMockPm({ 'models/bad.glb': fileData });

    // Mock client that always throws on upload
    const client = new MockAssetServer();
    vi.spyOn(client, 'upload').mockRejectedValueOnce(
      new AssetHashMismatchError('expected', 'actual'),
    );

    const scene = makeSceneWithNode('project://models/bad.glb');
    await expect(uploadSceneBinaries(scene, pm, client)).rejects.toBeInstanceOf(
      AssetHashMismatchError,
    );
  });

  it('propagates ProjectManager read failure', async () => {
    const pm = makeMockPm({}); // empty — will throw on read
    const client = new MockAssetServer();

    const scene = makeSceneWithNode('project://models/missing.glb');
    await expect(uploadSceneBinaries(scene, pm, client)).rejects.toThrow(
      /MockPM: file not found/,
    );
  });

  it('returns a NEW SceneDocument instance (does not mutate original)', async () => {
    const fileData = new Uint8Array([42]);
    const pm = makeMockPm({ 'models/cube.glb': fileData });
    const client = new MockAssetServer();

    const scene = makeSceneWithNode('project://models/cube.glb');
    const result = await uploadSceneBinaries(scene, pm, client);

    // Original scene still has project:// URL
    const originalNodes = scene.getAllNodes();
    expect(originalNodes[0].asset).toBe('project://models/cube.glb');

    // New scene has assets:// URL
    const newNodes = result.getAllNodes();
    expect(newNodes[0].asset).toMatch(/^assets:\/\//);

    // Different instances
    expect(result).not.toBe(scene);
  });

  it('round-trip: assets://<sha256>/<filename> survives serialize → deserialize unchanged (PR #978 guard)', async () => {
    // Simulate a doc that already has a cloud-form URL (e.g. written by a previous push).
    // The v1_to_v2 migration must NOT downgrade it back to project://.
    const pm = makeMockPm({}); // no uploads needed — URL is already hash-form
    const client = new MockAssetServer();

    const hash = 'b'.repeat(64); // 64 lowercase hex chars — valid sha256 form
    const cloudUrl = `assets://${hash}/dragon.glb`;

    const scene = makeSceneWithNode(cloudUrl);
    const result = await uploadSceneBinaries(scene, pm, client);

    const nodes = result.getAllNodes();
    expect(nodes).toHaveLength(1);
    // URL must be identical — v1_to_v2 regex guard must have passed it through
    expect(nodes[0].asset).toBe(cloudUrl);

    // Confirm no files were read or uploaded
    expect(pm.readFile).not.toHaveBeenCalled();
    expect(client.size).toBe(0);
  });

});
