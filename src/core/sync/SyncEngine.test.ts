import { describe, it, expect, beforeEach } from 'vitest';
import { SceneDocument } from '../scene/SceneDocument';
import { InMemorySyncEngine } from './InMemorySyncEngine';
import { ConflictError, NotFoundError } from './SyncEngine';

function makeDoc(): SceneDocument {
  return new SceneDocument();
}

describe('InMemorySyncEngine', () => {
  let engine: InMemorySyncEngine;

  beforeEach(() => {
    engine = new InMemorySyncEngine();
  });

  it('create() then fetch() returns version 0 and same body', async () => {
    const body = makeDoc();
    const { id, version: createVersion } = await engine.create('my-scene', body);
    expect(createVersion).toBe(0);

    const { body: fetchedBody, version } = await engine.fetch(id);
    expect(version).toBe(0);
    expect(fetchedBody).toBe(body);
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

  it('push() with stale baseVersion throws ConflictError with current version and body', async () => {
    const body = makeDoc();
    const { id } = await engine.create('scene', body);

    const firstBody = makeDoc();
    await engine.push(id, firstBody, 0); // version now 1

    const staleBody = makeDoc();
    await expect(engine.push(id, staleBody, 0)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ConflictError &&
        err.currentVersion === 1 &&
        err.currentBody === firstBody,
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

  it('after ConflictError, push with current version (path-a keep-local) succeeds', async () => {
    const body = makeDoc();
    const { id } = await engine.create('scene', body);

    const v1body = makeDoc();
    await engine.push(id, v1body, 0); // version now 1

    // Simulate ConflictError caught; client retries with currentVersion from error
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
