import type { Editor } from '../Editor';
import type { SceneFile } from './SceneFormat';

// ── Constants ──────────────────────────────────────────

/**
 * Storage key for the current autosave format.
 * Exported so Editor.ts can read from the same key without duplication.
 * Bump this whenever the stored format changes incompatibly.
 */
export const STORAGE_KEY = 'erythos-autosave-v3';
const DEBOUNCE_DELAY = 2000; // ms of idle before writing to localStorage

// ── Snapshot utilities ─────────────────────────────────

/** Check whether a saved snapshot exists in localStorage. */
export function hasSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Serialize the current scene to a JSON string via SceneDocument.
 * SceneFile carries its own `version: 1` — no extra envelope needed.
 * Does NOT write to storage — the AutoSave class owns that responsibility.
 */
export function saveSnapshot(editor: Editor): string {
  return JSON.stringify(editor.sceneDocument.serialize());
}

/**
 * Restore a previously saved snapshot into the editor.
 * Delegates version validation and deserialization to editor.loadScene().
 *
 * @param editor  The live Editor instance.
 * @param data    JSON string produced by saveSnapshot().
 */
export function restoreSnapshot(editor: Editor, data: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Invalid snapshot JSON');
  }
  editor.loadScene(parsed as SceneFile);
}

// ── AutoSave class ─────────────────────────────────────

/**
 * Attaches to an Editor's SceneDocument and debounces scene changes into localStorage.
 * Call dispose() when the editor tears down.
 */
export class AutoSave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onNodeAdded:     () => void;
  private readonly onNodeRemoved:   () => void;
  private readonly onNodeChanged:   () => void;
  private readonly onSceneReplaced: () => void;

  constructor(private readonly editor: Editor) {
    this.onNodeAdded = () => this.scheduleSnapshot();
    this.onNodeRemoved = () => this.scheduleSnapshot();
    this.onNodeChanged = () => this.scheduleSnapshot();
    this.onSceneReplaced = () => this.scheduleSnapshot();

    editor.sceneDocument.events.on('nodeAdded', this.onNodeAdded);
    editor.sceneDocument.events.on('nodeRemoved', this.onNodeRemoved);
    editor.sceneDocument.events.on('nodeChanged', this.onNodeChanged);
    editor.sceneDocument.events.on('sceneReplaced', this.onSceneReplaced);
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
      try {
        localStorage.setItem(STORAGE_KEY, data);
        this.editor.events.emit('autosaveStatusChanged', 'saved');
      } catch (err) {
        console.warn(
          `[AutoSave] setItem failed for key=${STORAGE_KEY} size=${data.length} :`,
          err,
        );
      }
    }, DEBOUNCE_DELAY);
  }

  /** Cancel pending save and detach all event listeners. */
  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.editor.sceneDocument.events.off('nodeAdded', this.onNodeAdded);
    this.editor.sceneDocument.events.off('nodeRemoved', this.onNodeRemoved);
    this.editor.sceneDocument.events.off('nodeChanged', this.onNodeChanged);
    this.editor.sceneDocument.events.off('sceneReplaced', this.onSceneReplaced);
  }
}
