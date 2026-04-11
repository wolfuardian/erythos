import type { Object3D } from 'three';

// ── Interaction types ──────────────────────────────────

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type InteractionMode = 'object' | 'edit';

// ── Event map ──────────────────────────────────────────

export interface EditorEventMap {
  objectAdded:            [object: Object3D];
  objectRemoved:          [object: Object3D, previousParent: Object3D];
  selectionChanged:       [objects: Object3D[]];
  /** @deprecated Use selectionChanged — kept for backward compat until app branch migrates */
  objectSelected:         [object: Object3D | null];
  objectHovered:          [object: Object3D | null];
  objectChanged:          [object: Object3D];
  sceneGraphChanged:      [];
  historyChanged:         [];
  interactionModeChanged: [mode: InteractionMode];
  transformModeChanged:   [mode: TransformMode];
  editorCleared:          [];
  autosaveStatusChanged:  [status: 'pending' | 'saved'];
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
