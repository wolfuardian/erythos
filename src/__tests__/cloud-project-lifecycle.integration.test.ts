/**
 * Cloud project lifecycle — integration test
 *
 * Drives the real client wire (CloudProjectManager + Editor + CloudAutoSave +
 * HttpSyncEngine + uploadSceneBinaries) against an in-process fake server that
 * mirrors server/src/routes/scenes.ts. Goal: catch wire-level bugs (T2 empty
 * blob / T3 primitive readFile leak / If-Match version progression) without
 * a real prod deploy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import { CloudProjectManager } from '../core/project/CloudProjectManager';
import { LocalProjectManager } from '../core/project/LocalProjectManager';
import { HttpSyncEngine } from '../core/sync/HttpSyncEngine';
import { HttpAssetClient } from '../core/sync/asset/HttpAssetClient';
import { Editor } from '../core/Editor';
import { createCloudAutoSave } from '../core/scene/AutoSave';
import { createEmptyScene } from '../core/scene/io/types';
import type { SceneNode } from '../core/scene/SceneFormat';
import { asNodeUUID } from '../utils/branded';

const BASE = 'https://test.example.com/api';

// ── In-process fake server state ──────────────────────────────────────────────

interface FakeScene {
  id: string;
  ownerId: string;
  name: string;
  version: number;
  body: unknown;
}

let scenes: Map<string, FakeScene>;
let putCalls: Array<{ id: string; ifMatch: string | null; baseVersion: number | null }>;
let nextSceneSerial: number;

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(JSON.parse(text)),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function readIfMatch(init: RequestInit | undefined): string | null {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get('If-Match');
  if (Array.isArray(h)) {
    const found = h.find(([k]) => k.toLowerCase() === 'if-match');
    return found?.[1] ?? null;
  }
  // Plain object — case-insensitive lookup
  for (const [k, v] of Object.entries(h as Record<string, string>)) {
    if (k.toLowerCase() === 'if-match') return v;
  }
  return null;
}

function fakeFetchImpl(url: string, init?: RequestInit): Response {
  const u = new URL(url);
  const method = (init?.method ?? 'GET').toUpperCase();
  const path = u.pathname;

  const sceneIdMatch = /^\/api\/scenes\/([^/]+)$/.exec(path);

  if (method === 'GET' && sceneIdMatch) {
    const scene = scenes.get(sceneIdMatch[1]!);
    if (!scene) return jsonResponse(404, { error: 'Not Found' });
    return jsonResponse(
      200,
      {
        id: scene.id,
        owner_id: scene.ownerId,
        name: scene.name,
        version: scene.version,
        body: scene.body,
        visibility: 'private',
        forked_from: null,
      },
      { ETag: `"${scene.version}"` },
    );
  }

  if (method === 'POST' && path === '/api/scenes') {
    const body = JSON.parse(init!.body as string) as { name: string; body: unknown };
    const id = `scene-${++nextSceneSerial}`;
    scenes.set(id, {
      id,
      ownerId: 'user-1',
      name: body.name,
      version: 0,
      body: body.body,
    });
    return jsonResponse(201, { id });
  }

  if (method === 'PUT' && sceneIdMatch) {
    const id = sceneIdMatch[1]!;
    const ifMatch = readIfMatch(init);
    const m = /^"(\d+)"$/.exec(ifMatch ?? '');
    const baseVersion = m ? parseInt(m[1]!, 10) : null;
    putCalls.push({ id, ifMatch, baseVersion });

    const scene = scenes.get(id);
    if (!scene) return jsonResponse(404, { error: 'Not Found' });
    if (baseVersion === null) return jsonResponse(412, { error: 'If-Match required' });

    if (scene.version !== baseVersion) {
      return jsonResponse(
        409,
        { current_version: scene.version, current_body: scene.body },
        { ETag: `"${scene.version}"` },
      );
    }

    scene.version += 1;
    scene.body = JSON.parse(init!.body as string);
    return jsonResponse(200, { version: scene.version }, { ETag: `"${scene.version}"` });
  }

  return jsonResponse(404, { error: `unhandled ${method} ${path}` });
}

// ── Test setup / teardown ─────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.fn>;
let origIndexedDB: IDBFactory | undefined;

beforeEach(() => {
  scenes = new Map();
  putCalls = [];
  nextSceneSerial = 0;
  fetchSpy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : 'url' in url ? url.url : url.toString();
    return fakeFetchImpl(urlStr, init);
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;

  origIndexedDB = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (origIndexedDB) {
    (globalThis as { indexedDB: IDBFactory }).indexedDB = origIndexedDB;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function newCloudSession(name: string) {
  // Mirror App.tsx onCreateCloudProject → openCloudProject wire
  const createRes = await fetch(`${BASE}/scenes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, body: createEmptyScene() }),
  });
  const { id } = (await createRes.json()) as { id: string };

  const pm = new LocalProjectManager();
  const assetClient = new HttpAssetClient(BASE);
  const syncEngine = new HttpSyncEngine(BASE, pm, assetClient);
  const cloudMgr = new CloudProjectManager(id, syncEngine, assetClient, BASE);

  const doc = await cloudMgr.loadScene();

  const editor = new Editor(pm, assetClient);
  editor.syncEngine = syncEngine;
  editor.syncSceneId = id;
  editor.syncBaseVersion = cloudMgr.currentVersion ?? 0;
  await editor.loadScene(doc.serialize());

  const autoSave = createCloudAutoSave(editor, cloudMgr);

  return { id, pm, editor, cloudMgr, autoSave };
}

function makeCubeNode(idStr = 'cube-1', name = 'Cube'): SceneNode {
  return {
    id: asNodeUUID(idStr),
    name,
    parent: null,
    order: 0,
    nodeType: 'mesh',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    asset: 'primitives://box',
    mat: { color: 0x808080 },
    userData: {},
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cloud project lifecycle — integration', () => {
  it('T2: empty cloud project loads without SceneInvariantError', async () => {
    const s = await newCloudSession('test');
    expect(s.editor.sceneDocument.getAllNodes()).toEqual([]);
    expect(s.cloudMgr.currentVersion).toBe(0);
    expect(s.editor.syncBaseVersion).toBe(0);
  });

  it('cloudMgr.name reflects server scene name after loadScene (#1036)', async () => {
    const s = await newCloudSession('My Cloud Scene');
    expect(s.cloudMgr.name).toBe('My Cloud Scene');
  });

  it('T3: adding a primitive cube + flushNow pushes without touching LocalProjectManager.readFile', async () => {
    const s = await newCloudSession('test');
    const pmReadSpy = vi.spyOn(s.pm, 'readFile');

    s.editor.sceneDocument.addNode(makeCubeNode());
    await s.autoSave.flushNow();

    expect(pmReadSpy).not.toHaveBeenCalled();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.baseVersion).toBe(0);
    expect(s.cloudMgr.currentVersion).toBe(1);
    expect(s.editor.syncBaseVersion).toBe(1);
  });

  it('two sequential mutates (await between) advance baseVersion 0→1→2 without 409', async () => {
    const s = await newCloudSession('test');

    s.editor.sceneDocument.addNode(makeCubeNode('c1'));
    await s.autoSave.flushNow();

    s.editor.sceneDocument.addNode(makeCubeNode('c2', 'Cube2'));
    await s.autoSave.flushNow();

    expect(putCalls.map(c => c.baseVersion)).toEqual([0, 1]);
    expect(s.cloudMgr.currentVersion).toBe(2);
  });

  it('conflict + use-cloud: scene document replaced with cloud body + baseVersion follows server', async () => {
    const s = await newCloudSession('test');

    // Simulate another tab/device having pushed a different scene state ahead of us.
    // Server now at version 1 with a different node set.
    const serverScene = scenes.get(s.id)!;
    serverScene.version = 1;
    const cloudNodePersist = {
      id: 'cloud-cube',
      name: 'CloudCube',
      parent: null,
      order: 0,
      nodeType: 'mesh',
      position: [5, 5, 5],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      asset: 'primitives://box',
      mat: { color: '#808080' },
      userData: {},
    };
    serverScene.body = {
      version: 3,
      upAxis: 'Y',
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [cloudNodePersist],
    };

    // Client doesn't know yet — still at base 0 with a different local mutation.
    s.editor.sceneDocument.addNode(makeCubeNode('local-cube', 'LocalCube'));

    // Push → 409 with current_body = cloud version
    await s.autoSave.flushNow();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.baseVersion).toBe(0);

    // resolveConflict('use-cloud') should replace the scene with the cloud body
    // and align baseVersion to the cloud version (1).
    await s.autoSave.resolveConflict('use-cloud');

    const nodes = s.editor.sceneDocument.getAllNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.name).toBe('CloudCube');
    expect(s.editor.syncBaseVersion).toBe(1);
  });

  it('conflict + use-cloud + new mutate: subsequent push uses post-resolve baseVersion (no stale 409)', async () => {
    const s = await newCloudSession('test');

    const serverScene = scenes.get(s.id)!;
    serverScene.version = 1;
    serverScene.body = {
      version: 3,
      upAxis: 'Y',
      env: { hdri: null, intensity: 1, rotation: 0 },
      nodes: [],
    };

    s.editor.sceneDocument.addNode(makeCubeNode('local-cube', 'LocalCube'));
    await s.autoSave.flushNow();
    expect(putCalls).toHaveLength(1);

    await s.autoSave.resolveConflict('use-cloud');

    // After use-cloud, baseVersion should be 1. A fresh mutation must push
    // with baseVersion=1, not stale 0.
    s.editor.sceneDocument.addNode(makeCubeNode('post-resolve', 'PostResolve'));
    await s.autoSave.flushNow();

    expect(putCalls).toHaveLength(2);
    expect(putCalls[1]!.baseVersion).toBe(1);
    expect(s.cloudMgr.currentVersion).toBe(2);
  });

  it('suppress: mutations during suppress() do NOT schedule a debounced push (cross-tab reload echo guard)', async () => {
    const s = await newCloudSession('test');
    const suppress = s.autoSave.suppress;
    expect(suppress).toBeDefined();

    vi.useFakeTimers();
    try {
      suppress!(true);
      // Mutate while suppressed — would normally schedule a push.
      s.editor.sceneDocument.addNode(makeCubeNode('reload-1'));
      s.editor.sceneDocument.addNode(makeCubeNode('reload-2'));
      suppress!(false);

      // Advance past the debounce window. No PUT must fire because schedule
      // was skipped while suppressed.
      vi.advanceTimersByTime(5000);
      // Let any pending microtasks settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(putCalls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppress balance: nested suppress(true) + matching suppress(false) re-enables scheduling', async () => {
    const s = await newCloudSession('test');
    const suppress = s.autoSave.suppress!;

    suppress(true);
    suppress(true);
    suppress(false);
    // Still suppressed once.

    vi.useFakeTimers();
    try {
      s.editor.sceneDocument.addNode(makeCubeNode('still-suppressed'));
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      expect(putCalls).toHaveLength(0);

      // Now fully release.
      suppress(false);
      s.editor.sceneDocument.addNode(makeCubeNode('after-release', 'AfterRelease'));
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }

    // After release, a normal flushNow should push without race.
    await s.autoSave.flushNow();
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
    expect(putCalls[0]!.baseVersion).toBe(0);
  });

  it('race: second mutation during in-flight push — second flushNow must use the post-push baseVersion', async () => {
    const s = await newCloudSession('test');

    // Block the first PUT response to widen the race window.
    let releaseFirstPut!: () => void;
    const firstPutBlocked = new Promise<void>(resolve => { releaseFirstPut = resolve; });

    fetchSpy.mockImplementationOnce(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : 'url' in url ? url.url : url.toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PUT') {
        await firstPutBlocked;
      }
      return fakeFetchImpl(urlStr, init);
    });

    s.editor.sceneDocument.addNode(makeCubeNode('c1'));
    const push1 = s.autoSave.flushNow();

    // Yield so push1 enters the awaiting-fetch state, then mutate again.
    await Promise.resolve();
    s.editor.sceneDocument.addNode(makeCubeNode('c2', 'Cube2'));
    const push2 = s.autoSave.flushNow();

    // Release the first PUT; both pushes should complete cleanly.
    releaseFirstPut();
    await Promise.all([push1, push2]);

    // Expectation: no 409. baseVersions must be 0 then 1 (not 0 then 0).
    expect(putCalls.map(c => c.baseVersion)).toEqual([0, 1]);
    expect(s.cloudMgr.currentVersion).toBe(2);
  });
});
