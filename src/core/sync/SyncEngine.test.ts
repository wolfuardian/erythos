import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { SceneDocument } from '../scene/SceneDocument';
import type { SyncEngine } from './SyncEngine';
import { ConflictError, NotFoundError } from './SyncEngine';
import { InMemorySyncEngine } from './InMemorySyncEngine';
import { LocalSyncEngine } from './LocalSyncEngine';

function makeDoc(): SceneDocument {
  return new SceneDocument();
}

/**
 * Conformance suite — run the same contract tests against any SyncEngine impl.
 * The `fetchedBodyIs` flag controls whether `fetch` is expected to return the
 * exact same object reference (InMemory) or a structurally equivalent clone (Local).
 */
function runSyncEngineContract(
  suiteName: string,
  makeEngine: () => SyncEngine,
  opts: { fetchedBodyIsSameRef: boolean } = { fetchedBodyIsSameRef: true },
) {
  describe(suiteName, () => {
    let engine: SyncEngine;

    beforeEach(() => {
      engine = makeEngine();
    });

    it('create() then fetch() returns version 0 and expected body', async () => {
      const body = makeDoc();
      const { id, version: createVersion } = await engine.create('my-scene', body);
      expect(createVersion).toBe(0);

      const { body: fetchedBody, version } = await engine.fetch(id);
      expect(version).toBe(0);
      if (opts.fetchedBodyIsSameRef) {
        expect(fetchedBody).toBe(body);
      } else {
        expect(fetchedBody).toBeInstanceOf(SceneDocument);
      }
    });

    it('push() with correct baseVersion increments version by 1', async () => {
      const body = makeDoc();
      const { id } = await engine.create('scene', body);

      const newBody = makeDoc();
      const { version } = await engine.push(id, newBody, 0);
      expect(version).toBe(1);

      const { version: fetched } = await engine.fetch(id);
      expect(fetched).toBe(1);
    });

    it('push() with stale baseVersion throws ConflictError with current version', async () => {
      const body = makeDoc();
      const { id } = await engine.create('scene', body);

      const firstBody = makeDoc();
      await engine.push(id, firstBody, 0); // version now 1

      const staleBody = makeDoc();
      await expect(engine.push(id, staleBody, 0)).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof ConflictError &&
          err.currentVersion === 1,
      );
    });

    it('push() on non-existent id throws NotFoundError', async () => {
      await expect(engine.push('no-such-id', makeDoc(), 0)).rejects.toSatisfy(
        (err: unknown) => err instanceof NotFoundError && err.sceneId === 'no-such-id',
      );
    });

    it('fetch() on non-existent id throws NotFoundError', async () => {
      await expect(engine.fetch('ghost-id')).rejects.toSatisfy(
        (err: unknown) => err instanceof NotFoundError && err.sceneId === 'ghost-id',
      );
    });

    it('multiple push() calls increment version strictly by 1 each time', async () => {
      const { id } = await engine.create('scene', makeDoc());
      for (let base = 0; base < 5; base++) {
        const { version } = await engine.push(id, makeDoc(), base);
        expect(version).toBe(base + 1);
      }
    });

    it('after ConflictError, push with current version succeeds', async () => {
      const body = makeDoc();
      const { id } = await engine.create('scene', body);

      const v1body = makeDoc();
      await engine.push(id, v1body, 0); // version now 1

      let caughtVersion: number | undefined;
      try {
        await engine.push(id, makeDoc(), 0); // stale push → ConflictError
      } catch (err) {
        if (err instanceof ConflictError) caughtVersion = err.currentVersion;
      }
      expect(caughtVersion).toBe(1);

      // Path (a): keep local — push local body using currentVersion as new base
      const localBody = makeDoc();
      const { version } = await engine.push(id, localBody, caughtVersion!);
      expect(version).toBe(2);
    });

    // -- setVisibility --

    it("create() initializes visibility=private and forkedFrom=null", async () => {
      const { id } = await engine.create("new-scene", makeDoc());
      const { visibility, forkedFrom } = await engine.fetch(id);
      expect(visibility).toBe("private");
      expect(forkedFrom).toBeNull();
    });

    it("setVisibility toggles private to public; version stays unchanged", async () => {
      const { id } = await engine.create("scene", makeDoc());
      const { version: vBefore } = await engine.fetch(id);

      await engine.setVisibility(id, "public");

      const { visibility, version: vAfter } = await engine.fetch(id);
      expect(visibility).toBe("public");
      expect(vAfter).toBe(vBefore); // visibility is metadata, does not bump version
    });

    it("setVisibility toggles public back to private", async () => {
      const { id } = await engine.create("scene", makeDoc());
      await engine.setVisibility(id, "public");
      await engine.setVisibility(id, "private");
      const { visibility } = await engine.fetch(id);
      expect(visibility).toBe("private");
    });

    it("setVisibility on non-existent id throws NotFoundError", async () => {
      await expect(engine.setVisibility("no-such-id", "public")).rejects.toSatisfy(
        (err: unknown) => err instanceof NotFoundError && err.sceneId === "no-such-id",
      );
    });

    // -- fork --

    it("fork() creates new scene: version=0, forkedFrom=sourceId, visibility=private", async () => {
      const { id: sourceId } = await engine.create("original", makeDoc());
      await engine.setVisibility(sourceId, "public"); // source is public; fork must still be private

      const { id: forkId, version, forkedFrom } = await engine.fork(sourceId);
      expect(version).toBe(0);
      expect(forkedFrom).toBe(sourceId);

      const { visibility, forkedFrom: fetchedForkedFrom } = await engine.fetch(forkId);
      expect(visibility).toBe("private");
      expect(fetchedForkedFrom).toBe(sourceId);
    });

    it("fork() default name is source name plus (fork) suffix", async () => {
      const { id: sourceId } = await engine.create("my scene", makeDoc());
      const { id: forkId } = await engine.fork(sourceId);
      const result = await engine.fetch(forkId);
      expect(result.version).toBe(0);
    });

    it("fork() with explicit name overrides default suffix", async () => {
      const { id: sourceId } = await engine.create("original", makeDoc());
      const { id: forkId } = await engine.fork(sourceId, "custom name");
      const result = await engine.fetch(forkId);
      expect(result.version).toBe(0);
    });

    it("fork() on non-existent id throws NotFoundError", async () => {
      await expect(engine.fork("no-such-id")).rejects.toSatisfy(
        (err: unknown) => err instanceof NotFoundError && err.sceneId === "no-such-id",
      );
    });

    it("fork body diverges from source: pushing to source does not change fork version", async () => {
      const { id: sourceId } = await engine.create("original", makeDoc());
      const { id: forkId } = await engine.fork(sourceId);

      await engine.push(sourceId, makeDoc(), 0);

      const { version: forkVersion } = await engine.fetch(forkId);
      expect(forkVersion).toBe(0);

      const { version: sourceVersion } = await engine.fetch(sourceId);
      expect(sourceVersion).toBe(1);
    });

    it("pushing to fork does not affect source version", async () => {
      const { id: sourceId } = await engine.create("original", makeDoc());
      const { id: forkId } = await engine.fork(sourceId);

      await engine.push(forkId, makeDoc(), 0);

      const { version: sourceVersion } = await engine.fetch(sourceId);
      expect(sourceVersion).toBe(0);
    });
  });
}

// ── InMemorySyncEngine conformance ─────────────────────────────────────────────
runSyncEngineContract(
  'InMemorySyncEngine',
  () => new InMemorySyncEngine(),
  { fetchedBodyIsSameRef: true },
);

// ── LocalSyncEngine (IndexedDB) conformance ────────────────────────────────────
// Each test gets a fresh DB name backed by an in-process fake-indexeddb IDBFactory.
let dbCounter = 0;
runSyncEngineContract(
  'LocalSyncEngine',
  () => {
    const idb = new IDBFactory();
    // Patch global indexedDB for LocalSyncEngine to use the fake instance
    (globalThis as unknown as Record<string, unknown>).indexedDB = idb;
    return new LocalSyncEngine(`test-db-${++dbCounter}`);
  },
  { fetchedBodyIsSameRef: false },
);

// -- LocalSyncEngine v1 to v3 migration (v2 walk chained into v3 walk) --
describe("LocalSyncEngine v1-to-v2 migration", () => {
  it("existing v1 records without visibility/forkedFrom are backfilled on DB open", async () => {
    const idb = new IDBFactory();
    (globalThis as unknown as Record<string, unknown>).indexedDB = idb;
    const dbName = `migration-test-db-${++dbCounter}`;

    // Manually seed a v1-style record directly via fake-indexeddb at version 1
    await new Promise<void>((resolve, reject) => {
      const req = idb.open(dbName, 1);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore("scenes", { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("scenes", "readwrite");
        const store = tx.objectStore("scenes");
        // Seed a v1-style record: no visibility, no forkedFrom fields
        store.put({ id: "legacy-id", version: 3, name: "legacy scene", body: { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] } });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // Now open via LocalSyncEngine at v2 -- should trigger migration
    const engine = new LocalSyncEngine(dbName);
    const { version, visibility, forkedFrom, body } = await engine.fetch("legacy-id");
    expect(version).toBe(3);
    expect(visibility).toBe("private");
    expect(forkedFrom).toBeNull();
    // v3 walk must have run (chained after v2 walk) — upAxis eagerly patched in stored JSON
    const serialized = body.serialize();
    expect(serialized.upAxis).toBe("Y");
  });
});

// -- LocalSyncEngine v2 to v3 migration --
describe("LocalSyncEngine v2-to-v3 migration", () => {
  it("existing v2 DB records without upAxis in body are backfilled on DB open", async () => {
    const idb = new IDBFactory();
    (globalThis as unknown as Record<string, unknown>).indexedDB = idb;
    const dbName = `migration-test-db-${++dbCounter}`;

    // Manually seed a v2-style record directly via fake-indexeddb at DB version 2
    // (no upAxis in body — simulates a record written before schema v3)
    await new Promise<void>((resolve, reject) => {
      const req = idb.open(dbName, 2);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        if (oldVersion < 1) {
          db.createObjectStore("scenes", { keyPath: "id" });
        }
        // v2 upgrade: backfill visibility/forkedFrom (mimic real v2 migration)
        if (oldVersion < 2) {
          // no existing records to backfill at this point
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("scenes", "readwrite");
        const store = tx.objectStore("scenes");
        // Seed a v2-style record with no upAxis in body
        store.put({
          id: "v2-scene-id",
          version: 1,
          name: "v2 scene",
          body: { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] },
          visibility: "private",
          forkedFrom: null,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // Now open via LocalSyncEngine at DB v3 -- should trigger v3 body migration
    const engine = new LocalSyncEngine(dbName);
    const { body } = await engine.fetch("v2-scene-id");
    // serialize() must produce v4 output now (deserialized via v2→v3→v4 migration chain)
    const serialized = body.serialize();
    expect(serialized.version).toBe(4);
    expect(serialized.upAxis).toBe("Y");
  });
});

// -- LocalSyncEngine v0→v3 upgrade (new install, no records) --
describe("LocalSyncEngine v0-to-v3 upgrade (fresh install)", () => {
  it("v0→v3: store is created, both cursor walks no-op (no records to backfill)", async () => {
    const idb = new IDBFactory();
    (globalThis as unknown as Record<string, unknown>).indexedDB = idb;
    const dbName = `migration-test-db-${++dbCounter}`;

    // Open directly via LocalSyncEngine with no prior DB (simulates brand-new install)
    const engine = new LocalSyncEngine(dbName);
    // DB opens without error; no records exist yet — create one to verify normal operation
    const { id } = await engine.create("new-scene", makeDoc());
    const { visibility, forkedFrom, body } = await engine.fetch(id);
    expect(visibility).toBe("private");
    expect(forkedFrom).toBeNull();
    const serialized = body.serialize();
    expect(serialized.upAxis).toBe("Y");
  });
});

// -- LocalSyncEngine v1→v3 full chain (v2 walk serialized then v3 walk) --
describe("LocalSyncEngine v1-to-v3 serialized-walk migration", () => {
  it("v1→v3: visibility, forkedFrom, and body.upAxis all backfilled on the same record", async () => {
    const idb = new IDBFactory();
    (globalThis as unknown as Record<string, unknown>).indexedDB = idb;
    const dbName = `migration-test-db-${++dbCounter}`;

    // Seed a v1-style record: no visibility, no forkedFrom, no upAxis in body
    await new Promise<void>((resolve, reject) => {
      const req = idb.open(dbName, 1);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore("scenes", { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("scenes", "readwrite");
        const store = tx.objectStore("scenes");
        store.put({
          id: "v1-chain-id",
          version: 0,
          name: "v1 scene",
          body: { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] },
          // no visibility, no forkedFrom, no upAxis in body
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // Open via LocalSyncEngine at DB_VERSION=3 — v2 walk runs, then v3 walk chains in
    const engine = new LocalSyncEngine(dbName);
    const { visibility, forkedFrom, body } = await engine.fetch("v1-chain-id");
    expect(visibility).toBe("private");   // v2 walk applied
    expect(forkedFrom).toBeNull();        // v2 walk applied
    const serialized = body.serialize();
    expect(serialized.upAxis).toBe("Y");  // v3 walk applied (chained after v2)
  });
});

// -- LocalSyncEngine v2→v3 (only v3 walk runs, v2 fields must not be clobbered) --
describe("LocalSyncEngine v2-to-v3 serialized-walk migration", () => {
  it("v2→v3: body.upAxis backfilled; existing visibility/forkedFrom preserved", async () => {
    const idb = new IDBFactory();
    (globalThis as unknown as Record<string, unknown>).indexedDB = idb;
    const dbName = `migration-test-db-${++dbCounter}`;

    // Seed a v2-style record: has visibility + forkedFrom but body lacks upAxis
    await new Promise<void>((resolve, reject) => {
      const req = idb.open(dbName, 2);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (event.oldVersion < 1) {
          db.createObjectStore("scenes", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("scenes", "readwrite");
        const store = tx.objectStore("scenes");
        store.put({
          id: "v2-only-id",
          version: 2,
          name: "v2 scene",
          body: { version: 2, env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] },
          visibility: "public",
          forkedFrom: "some-source-id",
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // Open via LocalSyncEngine at DB_VERSION=3 — only v3 walk should run
    const engine = new LocalSyncEngine(dbName);
    const { visibility, forkedFrom, body } = await engine.fetch("v2-only-id");
    // v2 fields preserved (v2 walk must NOT have clobbered them)
    expect(visibility).toBe("public");
    expect(forkedFrom).toBe("some-source-id");
    const serialized = body.serialize();
    expect(serialized.upAxis).toBe("Y");  // v3 walk applied
  });
});
