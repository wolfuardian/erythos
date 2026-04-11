import { ObjectLoader, Scene, Object3D } from 'three';
import type { Editor } from '../Editor';

// ── Constants ──────────────────────────────────────────

const STORAGE_KEY = 'erythos-autosave-v1';
const DEBOUNCE_DELAY = 2000; // ms of idle before writing to localStorage

// ── Snapshot utilities ─────────────────────────────────

/** Check whether a saved snapshot exists in localStorage. */
export function hasSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Serialize the current scene to a JSON string via Three.js's native
 * object.toJSON() pipeline and return it. Does NOT write to storage —
 * the AutoSave class owns that responsibility.
 */
export function saveSnapshot(editor: Editor): string {
  return JSON.stringify(editor.scene.toJSON());
}

/**
 * Restore a previously saved snapshot into the editor's live scene.
 *
 * Design choices to consider when implementing:
 *  - `editor.scene` is the live scene; children must be swapped in-place
 *    because other systems hold a reference to this exact object.
 *  - ObjectLoader.parse() on a scene JSON returns a Scene; copy its
 *    .children into editor.scene (Three.js moves nodes, so clone the
 *    array before iterating).
 *  - Selection should be cleared — the restored UUIDs won't match any
 *    live selection state.
 *  - Emit 'sceneGraphChanged' so panels that are already mounted refresh.
 *  - Do NOT clear editor.history — undo history being slightly stale is
 *    less disruptive than wiping it entirely.
 *
 * @param editor  The live Editor instance.
 * @param data    JSON string produced by saveSnapshot().
 */
export function restoreSnapshot(editor: Editor, data: string): void {
  const loader = new ObjectLoader();
  const restored = loader.parse(JSON.parse(data)) as Scene;

  // Clone arrays — add/remove mutate the live children list during iteration
  for (const child of [...editor.scene.children]) {
    editor.scene.remove(child);
  }
  for (const child of [...restored.children]) {
    editor.scene.add(child);
  }

  editor.selection.clear();
  editor.events.emit('sceneGraphChanged');
}

// ── AutoSave class ─────────────────────────────────────

/**
 * Attaches to an Editor and debounces scene changes into localStorage.
 * Call dispose() when the editor tears down.
 */
export class AutoSave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onSceneGraphChanged: () => void;
  private readonly onObjectChanged: (object: Object3D) => void;

  constructor(private readonly editor: Editor) {
    this.onSceneGraphChanged = () => { this.scheduleSnapshot(); };
    this.onObjectChanged = (_object: Object3D) => { this.scheduleSnapshot(); };

    this.editor.events.on('sceneGraphChanged', this.onSceneGraphChanged);
    this.editor.events.on('objectChanged', this.onObjectChanged);
  }

  /** Reset the debounce timer; on expiry, persist the current scene. */
  private scheduleSnapshot(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const data = saveSnapshot(this.editor);
      localStorage.setItem(STORAGE_KEY, data);
    }, DEBOUNCE_DELAY);
  }

  /** Cancel pending save and detach all event listeners. */
  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.editor.events.off('sceneGraphChanged', this.onSceneGraphChanged);
    this.editor.events.off('objectChanged', this.onObjectChanged);
  }
}
