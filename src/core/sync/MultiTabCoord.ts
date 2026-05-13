/**
 * MultiTabCoord — same-device multi-tab synchronization for AutoSave.
 *
 * Problem: two tabs editing the same scene both run AutoSave's debounced PUT.
 * Tab A writes v1→v2 (success). Tab B still holds base_version=v1 and its next
 * PUT gets 409. That's not a real conflict — the tabs just haven't shared the
 * updated version number.
 *
 * Solution:
 *   1. Web Locks API: serializes PUT calls per sceneId across tabs on the same
 *      device. Only one tab can hold the exclusive lock at a time.
 *   2. BroadcastChannel: after a successful PUT, the winning tab broadcasts the
 *      new version so other tabs can update their baseVersion before they attempt
 *      their own PUT.
 *
 * Fallback strategy:
 *   - No BroadcastChannel (Safari < 15.4): no-op broadcast / subscription. Tabs
 *     won't share version updates, but the lock still serializes writes.
 *   - No Web Locks (Safari < 16.4): in-process mutex per sceneId. Protects
 *     within-tab re-entrancy only; cross-tab 409s may still occur. A console.warn
 *     is emitted once per createMultiTabCoord call.
 *   - Neither API: in-process mutex + no-op broadcast (best effort, same behaviour
 *     as pre-feature code).
 */

/** Shape of messages broadcast over the BroadcastChannel. */
interface VersionMessage {
  type: 'version';
  version: number;
}

/** Dependencies injected by callers — production uses globals, tests inject mocks. */
export interface MultiTabCoordDeps {
  /** `navigator.locks` or equivalent. null/undefined → in-process mutex fallback. */
  locks?: LockManager | null;
  /** BroadcastChannel constructor. null/undefined → no-op broadcast. */
  BroadcastChannelCtor?: (typeof BroadcastChannel) | null;
}

export interface MultiTabCoord {
  /**
   * Acquires an exclusive write lock for sceneId, runs fn(), then releases.
   * Calls to withWriteLock for the same sceneId across tabs are serialized.
   */
  withWriteLock<T>(sceneId: string, fn: () => Promise<T>): Promise<T>;
  /** Broadcasts a successful PUT version to other tabs. */
  broadcastVersion(sceneId: string, version: number): void;
  /**
   * Subscribes to version updates from other tabs.
   * Returns an unsubscribe function.
   */
  onVersionChanged(sceneId: string, cb: (version: number) => void): () => void;
  /** Closes all BroadcastChannels (call on AutoSave dispose). */
  dispose(): void;
}

// ── In-process mutex fallback ─────────────────────────────────────────────────

/**
 * Simple per-key mutex using promise chaining.
 * Serializes calls within the same JavaScript context; does NOT protect cross-tab.
 */
class InProcessMutex {
  private readonly queues = new Map<string, Promise<void>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    this.queues.set(key, prev.then(() => next));

    await prev;
    try {
      return await fn();
    } finally {
      release();
      // Clean up entry if no more waiters (next is the last promise).
      if (this.queues.get(key) === prev.then(() => next)) {
        this.queues.delete(key);
      }
    }
  }
}

// ── BroadcastChannel helpers ──────────────────────────────────────────────────

/** Lazily creates one BroadcastChannel per sceneId, keyed by the channel name. */
function channelName(sceneId: string): string {
  return `erythos:scene:${sceneId}`;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createMultiTabCoord(deps?: MultiTabCoordDeps): MultiTabCoord {
  const locks: LockManager | null | undefined = deps?.locks;
  const BroadcastChannelCtor: (typeof BroadcastChannel) | null | undefined =
    deps?.BroadcastChannelCtor;

  // Resolve effective lock mechanism.
  const effectiveLocks: LockManager | null =
    locks !== undefined ? locks :
    (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null);

  if (effectiveLocks === null) {
    console.warn(
      '[MultiTabCoord] Web Locks API unavailable — falling back to in-process mutex. ' +
      'Cross-tab 409 conflicts may still occur on older browsers.',
    );
  }

  // Resolve effective BroadcastChannel constructor.
  const EffectiveBroadcastChannel: (typeof BroadcastChannel) | null =
    BroadcastChannelCtor !== undefined ? BroadcastChannelCtor :
    (typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null);

  const mutex = new InProcessMutex();

  // Lazily-opened channels for broadcasting (one per sceneId this tab writes to).
  const writeChannels = new Map<string, BroadcastChannel>();
  // Channels opened for subscribing (onVersionChanged).
  const subChannels = new Map<string, BroadcastChannel>();

  function getWriteChannel(sceneId: string): BroadcastChannel | null {
    if (!EffectiveBroadcastChannel) return null;
    let ch = writeChannels.get(sceneId);
    if (!ch) {
      ch = new EffectiveBroadcastChannel(channelName(sceneId));
      writeChannels.set(sceneId, ch);
    }
    return ch;
  }

  function getSubChannel(sceneId: string): BroadcastChannel | null {
    if (!EffectiveBroadcastChannel) return null;
    let ch = subChannels.get(sceneId);
    if (!ch) {
      ch = new EffectiveBroadcastChannel(channelName(sceneId));
      subChannels.set(sceneId, ch);
    }
    return ch;
  }

  const withWriteLock = async <T>(sceneId: string, fn: () => Promise<T>): Promise<T> => {
    if (effectiveLocks) {
      return effectiveLocks.request(`erythos:scene:${sceneId}`, { mode: 'exclusive' }, fn);
    }
    return mutex.run(sceneId, fn);
  };

  const broadcastVersion = (sceneId: string, version: number): void => {
    const ch = getWriteChannel(sceneId);
    if (!ch) return;
    const msg: VersionMessage = { type: 'version', version };
    ch.postMessage(msg);
  };

  const onVersionChanged = (sceneId: string, cb: (version: number) => void): () => void => {
    const ch = getSubChannel(sceneId);
    if (!ch) return () => {};

    const handler = (event: MessageEvent<VersionMessage>): void => {
      if (event.data?.type === 'version' && typeof event.data.version === 'number') {
        cb(event.data.version);
      }
    };
    ch.addEventListener('message', handler);

    return () => {
      ch.removeEventListener('message', handler);
    };
  };

  const dispose = (): void => {
    for (const ch of writeChannels.values()) ch.close();
    for (const ch of subChannels.values()) ch.close();
    writeChannels.clear();
    subChannels.clear();
  };

  return { withWriteLock, broadcastVersion, onVersionChanged, dispose };
}
