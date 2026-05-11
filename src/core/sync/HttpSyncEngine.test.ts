import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { SceneDocument } from '../scene/SceneDocument';
import { ConflictError, NotFoundError, PreconditionRequiredError } from './SyncEngine';
import { HttpSyncEngine } from './HttpSyncEngine';
import { AuthError } from '../auth/AuthClient';
import { MockAssetServer } from './asset/MockAssetServer';
import type { ProjectManagerLike } from './asset/uploadSceneBinaries';
import { asAssetPath } from '../../utils/branded';

// ── Helpers ────────────────────────────────────────────────────────────────────

const BASE = 'https://test.example.com/api';

function makeEngine(): HttpSyncEngine {
  return new HttpSyncEngine(BASE);
}

/** Minimal valid ErythosSceneV2 JSON the server would return as `body`. */
function minimalSceneJson() {
  return { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] };
}

/**
 * Build a Response-like object that globalThis.fetch will resolve to.
 * `ok` is inferred from status (2xx = true).
 */
function mockResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  const jsonBody = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    json: () => Promise.resolve(JSON.parse(jsonBody)),
    text: () => Promise.resolve(jsonBody),
  } as unknown as Response;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let fetchSpy: Mock<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.fn<typeof fetch>();
  globalThis.fetch = fetchSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── fetch() ────────────────────────────────────────────────────────────────────

describe('HttpSyncEngine.fetch()', () => {
  it('happy path: deserializes body, returns version, visibility, forkedFrom', async () => {
    const engine = makeEngine();
    const sceneJson = minimalSceneJson();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        id: 'scene-1',
        owner_id: 'owner-1',
        name: 'My Scene',
        version: 5,
        body: sceneJson,
        visibility: 'public',
        forked_from: null,
      }),
    );

    const result = await engine.fetch('scene-1');

    expect(result.version).toBe(5);
    expect(result.visibility).toBe('public');
    expect(result.forkedFrom).toBeNull();
    expect(result.body).toBeInstanceOf(SceneDocument);

    // Verify round-trip: serialize the deserialized doc and compare structure
    // Note: input is v2 (legacy); deserialize migrates to v3, so re-serialize is v3
    const serialized = result.body.serialize();
    expect(serialized.version).toBe(3);
    expect(serialized.nodes).toEqual(sceneJson.nodes);

    // Verify request shape
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/scenes/scene-1`);
    expect(init.method).toBe('GET');
    expect((init as RequestInit & { credentials: string }).credentials).toBe('include');
  });

  it('throws NotFoundError on 404', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(404, {}));

    await expect(engine.fetch('missing')).rejects.toSatisfy(
      (err: unknown) => err instanceof NotFoundError && err.sceneId === 'missing',
    );
  });

  it('throws AuthError on 401', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { message: 'Not authenticated' }));

    await expect(engine.fetch('scene-1')).rejects.toSatisfy(
      (err: unknown) => err instanceof AuthError && err.message === 'Not authenticated',
    );
  });

  it('throws AuthError on 403', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(403, { message: 'Forbidden' }));

    await expect(engine.fetch('scene-1')).rejects.toSatisfy(
      (err: unknown) => err instanceof AuthError && err.message === 'Forbidden',
    );
  });

  it('throws generic Error on 500', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(500, {}));

    await expect(engine.fetch('scene-1')).rejects.toThrow(/Server error 500/);
  });

  it('throws generic Error on network failure', async () => {
    const engine = makeEngine();
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(engine.fetch('scene-1')).rejects.toThrow(/Network error/);
  });
});

// ── push() ─────────────────────────────────────────────────────────────────────

describe('HttpSyncEngine.push()', () => {
  it('happy path: sends PUT with If-Match, returns new version', async () => {
    const engine = makeEngine();
    const doc = new SceneDocument();

    fetchSpy.mockResolvedValueOnce(mockResponse(200, { version: 6 }));

    const result = await engine.push('scene-1', doc, 5);
    expect(result.version).toBe(6);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>, credentials: string }];
    expect(url).toBe(`${BASE}/scenes/scene-1`);
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(init.headers['If-Match']).toBe('"5"'); // RFC 7232 quoted
    expect(init.headers['Content-Type']).toBe('application/json');

    // Verify body is the raw serialized ErythosSceneV3, not wrapped
    const sentBody = JSON.parse(init.body as string) as { version: number };
    expect(sentBody.version).toBe(3);
  });

  it('throws ConflictError on 409 with server current_version and current_body', async () => {
    const engine = makeEngine();
    const doc = new SceneDocument();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(409, {
        current_version: 7,
        current_body: minimalSceneJson(),
      }),
    );

    await expect(engine.push('scene-1', doc, 5)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConflictError &&
        err.sceneId === 'scene-1' &&
        err.currentVersion === 7 &&
        err.currentBody instanceof SceneDocument,
    );
  });

  it('throws ConflictError on 412 (client-bug path) with fallback fields', async () => {
    const engine = makeEngine();
    const doc = new SceneDocument();

    fetchSpy.mockResolvedValueOnce(mockResponse(412, {}));

    await expect(engine.push('scene-1', doc, 3)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConflictError &&
        err.sceneId === 'scene-1' &&
        err.currentVersion === 3, // falls back to baseVersion
    );
  });

  it('throws PreconditionRequiredError on 428 (server requires If-Match)', async () => {
    const engine = makeEngine();
    const doc = new SceneDocument();

    fetchSpy.mockResolvedValueOnce(mockResponse(428, { error: 'If-Match header required' }));

    await expect(engine.push('scene-1', doc, 5)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof PreconditionRequiredError && err.sceneId === 'scene-1',
    );
  });

  it('throws NotFoundError on 404', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(404, {}));

    await expect(engine.push('missing', new SceneDocument(), 0)).rejects.toSatisfy(
      (err: unknown) => err instanceof NotFoundError && err.sceneId === 'missing',
    );
  });

  it('throws AuthError on 401', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { message: 'Unauthorized' }));

    await expect(engine.push('scene-1', new SceneDocument(), 0)).rejects.toBeInstanceOf(AuthError);
  });
});

// ── create() ───────────────────────────────────────────────────────────────────

describe('HttpSyncEngine.create()', () => {
  it('happy path: sends POST with {name, body} wrapper, returns id and version=0', async () => {
    const engine = makeEngine();
    const doc = new SceneDocument();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(201, { id: 'new-scene-id', version: 0 }),
    );

    const result = await engine.create('My Scene', doc);
    expect(result.id).toBe('new-scene-id');
    expect(result.version).toBe(0);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>, credentials: string }];
    expect(url).toBe(`${BASE}/scenes`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['Content-Type']).toBe('application/json');

    // POST /scenes wraps with {name, body: <erythos JSON>}
    const sentBody = JSON.parse(init.body as string) as { name: string; body: { version: number } };
    expect(sentBody.name).toBe('My Scene');
    expect(sentBody.body.version).toBe(3);
  });

  it('throws AuthError on 401 (anonymous user trying to create)', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { message: 'Login required' }));

    await expect(engine.create('scene', new SceneDocument())).rejects.toBeInstanceOf(AuthError);
  });
});

// ── setVisibility() ─────────────────────────────────────────────────────────────

describe('HttpSyncEngine.setVisibility()', () => {
  it('happy path: sends PATCH with {visibility}', async () => {
    const engine = makeEngine();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { id: 'scene-1', visibility: 'public' }),
    );

    await engine.setVisibility('scene-1', 'public');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string>, credentials: string }];
    expect(url).toBe(`${BASE}/scenes/scene-1/visibility`);
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');

    const sentBody = JSON.parse(init.body as string) as { visibility: string };
    expect(sentBody.visibility).toBe('public');
  });

  it('throws NotFoundError on 404 (non-owner or not found)', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(404, {}));

    await expect(engine.setVisibility('scene-1', 'public')).rejects.toSatisfy(
      (err: unknown) => err instanceof NotFoundError && err.sceneId === 'scene-1',
    );
  });

  it('throws AuthError on 401', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { message: 'Login required' }));

    await expect(engine.setVisibility('scene-1', 'public')).rejects.toBeInstanceOf(AuthError);
  });
});

// ── fork() ─────────────────────────────────────────────────────────────────────

describe('HttpSyncEngine.fork()', () => {
  it('happy path without name: sends POST, returns id/version/forkedFrom', async () => {
    const engine = makeEngine();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(201, {
        id: 'fork-id',
        version: 0,
        forked_from: 'source-id',
      }),
    );

    const result = await engine.fork('source-id');
    expect(result.id).toBe('fork-id');
    expect(result.version).toBe(0);
    expect(result.forkedFrom).toBe('source-id'); // snake_case → camelCase

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { credentials: string }];
    expect(url).toBe(`${BASE}/scenes/source-id/fork`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('includes name in body when provided', async () => {
    const engine = makeEngine();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(201, { id: 'fork-id', version: 0, forked_from: 'source-id' }),
    );

    await engine.fork('source-id', 'Custom Name');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as { name?: string };
    expect(sentBody.name).toBe('Custom Name');
  });

  it('omits name from body when not provided', async () => {
    const engine = makeEngine();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(201, { id: 'fork-id', version: 0, forked_from: 'source-id' }),
    );

    await engine.fork('source-id');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as { name?: string };
    expect('name' in sentBody).toBe(false);
  });

  it('throws NotFoundError on 404', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(404, {}));

    await expect(engine.fork('missing')).rejects.toSatisfy(
      (err: unknown) => err instanceof NotFoundError && err.sceneId === 'missing',
    );
  });

  it('throws AuthError on 401 (anonymous cannot fork)', async () => {
    const engine = makeEngine();
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { message: 'Login required' }));

    await expect(engine.fork('scene-1')).rejects.toBeInstanceOf(AuthError);
  });
});

// ── Serialization round-trip ───────────────────────────────────────────────────

describe('Serialization round-trip', () => {
  it('deserializes server JSON into SceneDocument with correct node count and env', async () => {
    const engine = makeEngine();

    // Build a doc with one node, custom env
    const originalDoc = new SceneDocument();
    originalDoc.setEnv({ intensity: 2.5, rotation: 0.5 });
    const node = originalDoc.createNode('Cube');
    originalDoc.addNode(node);

    const serialized = originalDoc.serialize();

    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        id: 'scene-rt',
        owner_id: 'owner',
        name: 'RT Scene',
        version: 1,
        body: serialized,
        visibility: 'private',
        forked_from: null,
      }),
    );

    const result = await engine.fetch('scene-rt');
    const roundTripped = result.body.serialize();

    expect(roundTripped.nodes).toHaveLength(1);
    expect(roundTripped.nodes[0].name).toBe('Cube');
    expect(roundTripped.env.intensity).toBe(2.5);
    expect(roundTripped.env.rotation).toBe(0.5);
    expect(result.visibility).toBe('private');
    expect(result.forkedFrom).toBeNull();
  });
});

// ── Binary upload integration (F-1d-2b, refs #957) ────────────────────────────

/**
 * Build an in-memory ProjectManagerLike for tests.
 * Files keyed by project-relative path (e.g. "models/cube.glb").
 */
function makeMockPm(files: Record<string, Uint8Array>): ProjectManagerLike {
  return {
    readFile: vi.fn(async (path: ReturnType<typeof asAssetPath>) => {
      const key = path as string;
      const data = files[key];
      if (!data) throw new Error(`MockPM: file not found: ${path}`);
      const name = key.split('/').pop() ?? key;
      return new File([data], name);
    }),
  };
}

describe('HttpSyncEngine.push() — binary upload hook (F-1d-2b)', () => {
  it('rewrites project:// to assets:// in server push body when projectManager + assetClient are injected', async () => {
    const fileData = new Uint8Array([1, 2, 3]);
    const pm = makeMockPm({ 'models/cube.glb': fileData });
    const assetClient = new MockAssetServer();

    const engine = new HttpSyncEngine(BASE, pm, assetClient);

    // Build a scene with a mesh node using project://
    const doc = new SceneDocument();
    const node = doc.createNode('Cube');
    (node as any).nodeType = 'mesh';
    (node as any).asset = 'project://models/cube.glb';
    doc.addNode(node);

    fetchSpy.mockResolvedValueOnce(mockResponse(200, { version: 6 }));

    await engine.push('scene-1', doc, 5);

    // Capture the serialized body sent to the server
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as {
      version: number;
      nodes: Array<{ asset?: string }>;
    };

    // The asset URL sent to the server must be assets://, not project://
    expect(sentBody.nodes[0].asset).toMatch(/^assets:\/\//);
    expect(sentBody.nodes[0].asset).not.toContain('project://');

    // Original doc is NOT mutated
    const originalNodes = doc.getAllNodes();
    expect(originalNodes[0].asset).toBe('project://models/cube.glb');
  });

  it('anonymous mode (no client): sends original project:// URL unchanged', async () => {
    // Engine created without projectManager / assetClient
    const engine = new HttpSyncEngine(BASE);

    const doc = new SceneDocument();
    const node = doc.createNode('Cube');
    (node as any).nodeType = 'mesh';
    (node as any).asset = 'project://models/cube.glb';
    doc.addNode(node);

    fetchSpy.mockResolvedValueOnce(mockResponse(200, { version: 2 }));

    await engine.push('scene-anon', doc, 1);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as {
      nodes: Array<{ asset?: string }>;
    };

    // project:// passed through unchanged (no upload hook)
    expect(sentBody.nodes[0].asset).toBe('project://models/cube.glb');
  });
});

describe('HttpSyncEngine.create() — binary upload hook (F-1d-2b)', () => {
  it('rewrites project:// to assets:// in server create body when assetClient injected', async () => {
    const fileData = new Uint8Array([7, 8, 9]);
    const pm = makeMockPm({ 'models/box.glb': fileData });
    const assetClient = new MockAssetServer();

    const engine = new HttpSyncEngine(BASE, pm, assetClient);

    const doc = new SceneDocument();
    const node = doc.createNode('Box');
    (node as any).nodeType = 'mesh';
    (node as any).asset = 'project://models/box.glb';
    doc.addNode(node);

    fetchSpy.mockResolvedValueOnce(mockResponse(201, { id: 'new-scene', version: 0 }));

    await engine.create('My Scene', doc);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as {
      name: string;
      body: { nodes: Array<{ asset?: string }> };
    };

    expect(sentBody.body.nodes[0].asset).toMatch(/^assets:\/\//);
    expect(sentBody.body.nodes[0].asset).not.toContain('project://');
  });

  it('anonymous mode (no client): sends original project:// URL unchanged in create', async () => {
    const engine = new HttpSyncEngine(BASE);

    const doc = new SceneDocument();
    const node = doc.createNode('Box');
    (node as any).nodeType = 'mesh';
    (node as any).asset = 'project://models/box.glb';
    doc.addNode(node);

    fetchSpy.mockResolvedValueOnce(mockResponse(201, { id: 'new-scene', version: 0 }));

    await engine.create('My Scene', doc);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as {
      body: { nodes: Array<{ asset?: string }> };
    };

    expect(sentBody.body.nodes[0].asset).toBe('project://models/box.glb');
  });
});
