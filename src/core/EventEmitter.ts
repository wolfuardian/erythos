import type { Object3D } from 'three';

// ── Interaction types ──────────────────────────────────

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type InteractionMode = 'object' | 'edit';

// ── Event map ──────────────────────────────────────────

export interface EditorEventMap {
  // ── New UUID-based events (Phase V2-1) ──────────────
  nodeAdded:              [uuid: string];
  nodeRemoved:            [uuid: string];
  nodeChanged:            [uuid: string];
  sceneReplaced:          [];
  hoverChanged:           [uuid: string | null];

  // ── Stable events (no change) ───────────────────────
  selectionChanged:       [objects: Object3D[]];
  historyChanged:         [];
  interactionModeChanged: [mode: InteractionMode];
  transformModeChanged:   [mode: TransformMode];
  editorCleared:          [];
  autosaveStatusChanged:  [status: 'idle' | 'pending' | 'saved'];

  // ── Deprecated legacy events — DO NOT remove until Phase V2 completes ──
  /** @deprecated Use nodeAdded */
  objectAdded:            [object: Object3D];
  /** @deprecated Use nodeRemoved */
  objectRemoved:          [object: Object3D, previousParent: Object3D];
  /** @deprecated Use nodeChanged */
  objectChanged:          [object: Object3D];
  /** @deprecated Use sceneReplaced or nodeAdded/nodeRemoved */
  sceneGraphChanged:      [];
  /** @deprecated Use selectionChanged */
  objectSelected:         [object: Object3D | null];
  /** @deprecated Use hoverChanged */
  objectHovered:          [object: Object3D | null];
}

// ── Typed EventEmitter ─────────────────────────────────

type EventKey = keyof EditorEventMap;
type Listener<K extends EventKey> = (...args: EditorEventMap[K]) => void;

export class EventEmitter {
  private listeners = new Map<EventKey, Set<Listener<any>>>();

  on<K extends EventKey>(event: K, fn: Listener<K>): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn);
  }

  off<K extends EventKey>(event: K, fn: Listener<K>): void {
    this.listeners.get(event)?.delete(fn);
  }

  once<K extends EventKey>(event: K, fn: Listener<K>): void {
    const wrapper = ((...args: EditorEventMap[K]) => {
      this.off(event, wrapper as Listener<K>);
      fn(...args);
    }) as Listener<K>;
    this.on(event, wrapper);
  }

  emit<K extends EventKey>(event: K, ...args: EditorEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      fn(...args);
    }
  }

  removeAllListeners(event?: EventKey): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
