import { ObjectLoader, Scene, Object3D } from 'three';
import type { Editor } from '../Editor';

// ── Constants ──────────────────────────────────────────

/**
 * Storage key for the current autosave format.
 * Exported so Editor.ts can read from the same key without duplication.
 * Bump both this and AUTOSAVE_VERSION together whenever the stored format changes.
 */
export const STORAGE_KEY = 'erythos-autosave-v2';
const AUTOSAVE_VERSION = 2;
const DEBOUNCE_DELAY = 2000; // ms of idle before writing to localStorage

// ── Snapshot utilities ─────────────────────────────────

/** Check whether a saved snapshot exists in localStorage. */
export function hasSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Serialize the current scene to a versioned JSON string and return it.
 * The envelope `{ _version, data }` lets restoreSnapshot reject snapshots
 * from incompatible format versions. Does NOT write to storage —
 * the AutoSave class owns that responsibility.
 */
export function saveSnapshot(editor: Editor): string {
  return JSON.stringify({ _version: AUTOSAVE_VERSION, data: editor.scene.toJSON() });
}

/**
 * Restore a previously saved snapshot into the editor's live scene.
 *
 * Version gate: if the payload does not carry a matching `_version` marker,
 * a warning is logged and the data is silently discarded. This prevents
 * loading scenes serialised by an older code path whose format is no longer
 * compatible.
 *
 * @param editor  The live Editor instance.
 * @param data    JSON string produced by saveSnapshot().
 */
export function restoreSnapshot(editor: Editor, data: string): void {
  // Parse the outer envelope
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    console.warn('[AutoSave] Failed to parse snapshot JSON — discarding.');
    return;
  }

  // Version gate: reject legacy or unversioned payloads
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('_version' in parsed) ||
    (parsed as Record<string, unknown>)['_version'] !== AUTOSAVE_VERSION
  ) {
    console.warn('[AutoSave] Snapshot missing or mismatched _version — discarding legacy data.');
    return;
  }

  const sceneJSON = (parsed as { _version: number; data: unknown }).data;
  const loader = new ObjectLoader();
  const restored = loader.parse(sceneJSON) as Scene;

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
    this.editor.events.emit('autosaveStatusChanged', 'pending');
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const data = saveSnapshot(this.editor);
      localStorage.setItem(STORAGE_KEY, data);
      this.editor.events.emit('autosaveStatusChanged', 'saved');
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
