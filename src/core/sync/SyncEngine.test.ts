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
