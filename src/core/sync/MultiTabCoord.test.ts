import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMultiTabCoord } from './MultiTabCoord';

// ── Mock BroadcastChannel ─────────────────────────────────────────────────────
//
// A same-process BroadcastChannel that delivers to other instances on the same
// channel name — but NOT to the sender (mirrors the real API).

class MockBroadcastChannel {
  static readonly registry = new Map<string, Set<MockBroadcastChannel>>();

  onmessage: ((event: MessageEvent) => void) | null = null;
  private readonly _handlers = new Set<(event: MessageEvent) => void>();

  constructor(public readonly name: string) {
    let peers = MockBroadcastChannel.registry.get(name);
    if (!peers) {
      peers = new Set();
      MockBroadcastChannel.registry.set(name, peers);
    }
    peers.add(this);
  }

  addEventListener(_type: string, fn: (event: MessageEvent) => void): void {
    this._handlers.add(fn);
  }

  removeEventListener(_type: string, fn: (event: MessageEvent) => void): void {
    this._handlers.delete(fn);
  }

  postMessage(data: unknown): void {
    const peers = MockBroadcastChannel.registry.get(this.name);
    if (!peers) return;
    // Deliver to all OTHER instances (not self).
    for (const peer of peers) {
      if (peer === this) continue;
      const event = { data } as MessageEvent;
      for (const fn of peer._handlers) {
        queueMicrotask(() => fn(event));
      }
      if (peer.onmessage) {
        const e = event;
        queueMicrotask(() => peer.onmessage!(e));
      }
    }
  }

  close(): void {
    MockBroadcastChannel.registry.get(this.name)?.delete(this);
    this._handlers.clear();
  }

  static reset(): void {
    MockBroadcastChannel.registry.clear();
  }
}

// ── Mock LockManager ──────────────────────────────────────────────────────────
//
// Sequential FIFO mutex per name — mirrors the exclusive-mode semantic of the
// real Web Locks API.

type LockRequestCallback<T> = () => Promise<T>;

class MockLockManager {
  private readonly queues = new Map<string, Promise<unknown>>();

  async request<T>(
    name: string,
    _options: { mode: 'exclusive' },
    fn: LockRequestCallback<T>,
  ): Promise<T> {
    const prev = this.queues.get(name) ?? Promise.resolve();
    let settle!: () => void;
    const hold = new Promise<void>((r) => { settle = r; });
    this.queues.set(name, prev.then(() => hold));
    await prev;
    try {
      return await fn();
    } finally {
      settle();
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flush all pending microtasks. */
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MultiTabCoord — BroadcastChannel version sharing', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
  });

  it('broadcasts version to other coord instances on the same sceneId', async () => {
    const BroadcastChannelCtor = MockBroadcastChannel as unknown as typeof BroadcastChannel;

    const coordA = createMultiTabCoord({ locks: null, BroadcastChannelCtor });
    const coordB = createMultiTabCoord({ locks: null, BroadcastChannelCtor });

    const received: number[] = [];
    coordB.onVersionChanged('scene-1', (v) => received.push(v));

    coordA.broadcastVersion('scene-1', 42);

    await flushMicrotasks();
    await flushMicrotasks(); // two rounds to be safe

    expect(received).toEqual([42]);

    coordA.dispose();
    coordB.dispose();
  });

  it('a tab receives its own broadcast (write and sub are separate channel instances)', async () => {
    // A single coord has a write channel and a sub channel on the same name.
    // The write channel sends to all OTHER instances — including the sub channel
    // of the same coord. This is correct: the onVersionChanged callback only
    // bumps baseVersion when v > current, so it is idempotent.
    const BroadcastChannelCtor = MockBroadcastChannel as unknown as typeof BroadcastChannel;

    const coord = createMultiTabCoord({ locks: null, BroadcastChannelCtor });

    const received: number[] = [];
    coord.onVersionChanged('scene-1', (v) => received.push(v));
    coord.broadcastVersion('scene-1', 7);

    await flushMicrotasks();
    await flushMicrotasks();

    // The write and sub channels are different instances on the same name,
    // so the sub channel receives the broadcast.
    expect(received).toEqual([7]);

    coord.dispose();
  });

  it('unsubscribe stops receiving further version updates', async () => {
    const BroadcastChannelCtor = MockBroadcastChannel as unknown as typeof BroadcastChannel;

    const coordA = createMultiTabCoord({ locks: null, BroadcastChannelCtor });
    const coordB = createMultiTabCoord({ locks: null, BroadcastChannelCtor });

    const received: number[] = [];
    const unsub = coordB.onVersionChanged('scene-1', (v) => received.push(v));

    coordA.broadcastVersion('scene-1', 10);
    await flushMicrotasks();
    await flushMicrotasks();
    expect(received).toEqual([10]);

    unsub();

    coordA.broadcastVersion('scene-1', 20);
    await flushMicrotasks();
    await flushMicrotasks();
    // No new entry after unsubscribe.
    expect(received).toEqual([10]);

    coordA.dispose();
    coordB.dispose();
  });

  it('ignores messages with unexpected shape', async () => {
    const BroadcastChannelCtor = MockBroadcastChannel as unknown as typeof BroadcastChannel;

    const coordA = createMultiTabCoord({ locks: null, BroadcastChannelCtor });
    const coordB = createMultiTabCoord({ locks: null, BroadcastChannelCtor });

    const received: number[] = [];
    coordB.onVersionChanged('scene-1', (v) => received.push(v));

    // Manually post a malformed message via a raw MockBroadcastChannel.
    const raw = new MockBroadcastChannel('erythos:scene:scene-1');
    raw.postMessage({ type: 'other', version: 99 });
    raw.postMessage({ version: 5 }); // missing type
    raw.postMessage(null);

    await flushMicrotasks();
    await flushMicrotasks();

    expect(received).toHaveLength(0);

    raw.close();
    coordA.dispose();
    coordB.dispose();
  });
});

describe('MultiTabCoord — withWriteLock serialization', () => {
  it('serializes concurrent lock requests for same sceneId (Web Locks)', async () => {
    const locks = new MockLockManager() as unknown as LockManager;
    const coord = createMultiTabCoord({ locks, BroadcastChannelCtor: null });

    const order: string[] = [];

    const p1 = coord.withWriteLock('scene-1', async () => {
      order.push('A-start');
      await new Promise<void>((r) => queueMicrotask(r));
      order.push('A-end');
    });

    const p2 = coord.withWriteLock('scene-1', async () => {
      order.push('B-start');
      order.push('B-end');
    });

    await Promise.all([p1, p2]);

    // A must fully complete before B starts.
    expect(order).toEqual(['A-start', 'A-end', 'B-start', 'B-end']);

    coord.dispose();
  });

  it('allows concurrent locks for different sceneIds', async () => {
    const locks = new MockLockManager() as unknown as LockManager;
    const coord = createMultiTabCoord({ locks, BroadcastChannelCtor: null });

    const started: string[] = [];

    let resolveA!: () => void;
    const blockA = new Promise<void>((r) => { resolveA = r; });

    const p1 = coord.withWriteLock('scene-A', async () => {
      started.push('A');
      await blockA;
    });

    const p2 = coord.withWriteLock('scene-B', async () => {
      started.push('B');
    });

    // Give microtasks a moment to run
    await flushMicrotasks();
    // B can start without waiting for A.
    expect(started).toContain('B');

    resolveA();
    await Promise.all([p1, p2]);

    coord.dispose();
  });

  it('serializes with in-process mutex fallback when locks=null', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const coord = createMultiTabCoord({ locks: null, BroadcastChannelCtor: null });

    const order: string[] = [];

    const p1 = coord.withWriteLock('scene-1', async () => {
      order.push('A-start');
      await new Promise<void>((r) => queueMicrotask(r));
      order.push('A-end');
    });

    const p2 = coord.withWriteLock('scene-1', async () => {
      order.push('B-start');
      order.push('B-end');
    });

    await Promise.all([p1, p2]);

    expect(order).toEqual(['A-start', 'A-end', 'B-start', 'B-end']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Web Locks API unavailable'));

    warnSpy.mockRestore();
    coord.dispose();
  });

  it('propagates errors thrown inside the lock callback', async () => {
    const locks = new MockLockManager() as unknown as LockManager;
    const coord = createMultiTabCoord({ locks, BroadcastChannelCtor: null });

    await expect(
      coord.withWriteLock('scene-1', async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');

    coord.dispose();
  });
});

describe('MultiTabCoord — no-op fallbacks', () => {
  it('broadcastVersion is a no-op when BroadcastChannel is null', () => {
    const coord = createMultiTabCoord({ locks: null, BroadcastChannelCtor: null });
    // Should not throw.
    expect(() => coord.broadcastVersion('scene-1', 5)).not.toThrow();
    coord.dispose();
  });

  it('onVersionChanged returns a no-op unsubscribe when BroadcastChannel is null', () => {
    const coord = createMultiTabCoord({ locks: null, BroadcastChannelCtor: null });
    const unsub = coord.onVersionChanged('scene-1', () => {});
    expect(() => unsub()).not.toThrow();
    coord.dispose();
  });

  it('dispose is safe to call multiple times', () => {
    const BroadcastChannelCtor = MockBroadcastChannel as unknown as typeof BroadcastChannel;
    const coord = createMultiTabCoord({ locks: null, BroadcastChannelCtor });
    coord.broadcastVersion('scene-1', 1); // open a channel
    expect(() => { coord.dispose(); coord.dispose(); }).not.toThrow();
    MockBroadcastChannel.reset();
  });
});
