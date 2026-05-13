/**
 * CloudSceneCache tests — unit coverage for IndexedDB cache layer.
 *
 * Uses fake-indexeddb to avoid browser-only IDB dependency in Node/Vitest.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { getScene, setScene, deleteScene } from '../CloudSceneCache';

const SCENE_ID = 'cache-test-scene-id';
const DATA = JSON.stringify({ version: 1, nodes: [] });
const VERSION = 7;

// Reset IDB between tests by clearing the module's cached db promise.
// fake-indexeddb resets per import; for isolation we rely on deleteScene.

describe('CloudSceneCache', () => {
  beforeEach(async () => {
    // Clean up before each test
    await deleteScene(SCENE_ID).catch(() => {/* ignore if not present */});
  });

  it('returns null on cache miss', async () => {
    const result = await getScene('nonexistent-id');
    expect(result).toBeNull();
  });

  it('stores and retrieves a scene entry', async () => {
    await setScene(SCENE_ID, DATA, VERSION);

    const entry = await getScene(SCENE_ID);
    expect(entry).not.toBeNull();
    expect(entry!.data).toBe(DATA);
    expect(entry!.version).toBe(VERSION);
    expect(entry!.key).toBe(`project-cache-${SCENE_ID}`);
    expect(entry!.cachedAt).toBeGreaterThan(0);
  });

  it('overwrites existing entry on setScene', async () => {
    await setScene(SCENE_ID, DATA, VERSION);
    const updatedData = JSON.stringify({ version: 1, nodes: [{ id: 'x' }] });
    await setScene(SCENE_ID, updatedData, VERSION + 1);

    const entry = await getScene(SCENE_ID);
    expect(entry!.data).toBe(updatedData);
    expect(entry!.version).toBe(VERSION + 1);
  });

  it('deletes a scene entry', async () => {
    await setScene(SCENE_ID, DATA, VERSION);
    await deleteScene(SCENE_ID);

    const result = await getScene(SCENE_ID);
    expect(result).toBeNull();
  });

  it('deleteScene is a no-op for nonexistent id', async () => {
    await expect(deleteScene('nonexistent-scene')).resolves.toBeUndefined();
  });
});
