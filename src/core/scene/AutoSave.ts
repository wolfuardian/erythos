import type { Editor } from '../Editor';
import type { SceneDocument } from './SceneDocument';
import { asAssetPath } from '../../utils/branded';
import { validateScene } from './io/SceneInvariants';
import { ConflictError, NotFoundError } from '../sync/SyncEngine';

const DEBOUNCE_DELAY = 2000;

interface PendingConflict {
  sceneId: string;
  currentVersion: number;
  remoteBody: SceneDocument;
}

export interface AutoSaveHandle {
  flushNow(): Promise<void>;
  resolveConflict(choice: 'keep-local' | 'use-cloud'): Promise<void>;
  dispose(): void;
}

export function createAutoSave(editor: Editor): AutoSaveHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingConflict: PendingConflict | null = null;

  const scheduleSnapshot = (): void => {
    editor.events.emit('autosaveStatusChanged', 'pending');
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { void flushNow(); }, DEBOUNCE_DELAY);
  };

  /**
   * Shared push helper: calls syncEngine.push, updates syncBaseVersion on success,
   * and on ConflictError: writes .bak, sets pendingConflict, emits syncConflict.
   * Does NOT throw ConflictError — caller is responsible for whatever needs to happen
   * after (e.g. suppressing flushNow's legacy path).
   *
   * @param json - The serialized scene JSON string to use for .bak
   */
  const pushOrCaptureConflict = async (json: string): Promise<void> => {
    if (!editor.syncEngine || editor.syncSceneId === null || editor.syncBaseVersion === null) {
      return;
    }
    try {
      const { version } = await editor.syncEngine.push(
        editor.syncSceneId,
        editor.sceneDocument,
        editor.syncBaseVersion,
      );
      editor.syncBaseVersion = version;
    } catch (err) {
      if (err instanceof ConflictError) {
        // Capture base version BEFORE any mutation — this is the stale version
        const bakBaseVersion = editor.syncBaseVersion;
        const scenePath = editor.projectManager.currentScenePath();
        const bakPath = asAssetPath(`${scenePath}.bak.v${bakBaseVersion}`);

        // Write .bak first; failure is non-fatal (warn and continue)
        try {
          await editor.projectManager.writeFile(bakPath, json);
        } catch (bakErr) {
          console.warn('[AutoSave] Failed to write .bak file:', bakErr);
        }

        pendingConflict = {
          sceneId: err.sceneId,
          currentVersion: err.currentVersion,
          remoteBody: err.currentBody,
        };

        editor.events.emit('syncConflict', {
          sceneId: err.sceneId,
          scenePath,
          baseVersion: bakBaseVersion,
          currentVersion: err.currentVersion,
          localBody: editor.sceneDocument,
          cloudBody: err.currentBody,
        });
      } else if (err instanceof NotFoundError) {
        console.warn(`[AutoSave] SyncEngine scene not found: "${editor.syncSceneId}"`, err);
      } else {
        console.warn('[AutoSave] syncEngine.push failed:', err);
      }
    }
  };

  const flushNow = async (): Promise<void> => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    const scene = editor.sceneDocument.serialize();
    const json = JSON.stringify(scene);

    // Validate before writing: if the serialized scene violates invariants,
    // emit error status and do NOT write to disk.
    const violations = validateScene(scene, json);
    if (violations.length > 0) {
      console.error('[AutoSave] Pre-write validation failed:');
      for (const v of violations) {
        console.error(`  [${v.path}] ${v.reason}`);
      }
      editor.events.emit('autosaveStatusChanged', 'error');
      return;
    }

    const path = editor.projectManager.currentScenePath();
    try {
      await editor.projectManager.writeFile(path, json);
    } catch (err) {
      console.warn('[AutoSave] writeFile failed:', err);
      editor.events.emit('autosaveStatusChanged', 'error');
      return;
    }

    // Lock 1: suppress sync push when conflict dialog is open
    if (pendingConflict === null && editor.syncEngine && editor.syncSceneId !== null && editor.syncBaseVersion !== null) {
      await pushOrCaptureConflict(json);
    }

    editor.events.emit('autosaveStatusChanged', 'saved');
  };

  const resolveConflict = async (choice: 'keep-local' | 'use-cloud'): Promise<void> => {
    const pc = pendingConflict;
    if (!pc) return;

    if (choice === 'keep-local') {
      // Lock 7: clear pendingConflict and use currentVersion as new base, then immediately re-push
      pendingConflict = null;
      editor.syncBaseVersion = pc.currentVersion;

      // Serialize current live document for both push and potential new .bak
      const scene = editor.sceneDocument.serialize();
      const json = JSON.stringify(scene);

      // Lock 4: walk the same pushOrCaptureConflict path — if 409 again, new bak + new emit
      await pushOrCaptureConflict(json);
    } else {
      // use-cloud: Lock 5 — round-trip via serialize/deserialize
      editor.sceneDocument.deserialize(pc.remoteBody.serialize());
      editor.syncBaseVersion = pc.currentVersion;
      pendingConflict = null;
    }
  };

  const dispose = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    // Lock 6: clear pendingConflict on dispose
    pendingConflict = null;
    editor.sceneDocument.events.off('nodeAdded', scheduleSnapshot);
    editor.sceneDocument.events.off('nodeRemoved', scheduleSnapshot);
    editor.sceneDocument.events.off('nodeChanged', scheduleSnapshot);
    editor.sceneDocument.events.off('sceneReplaced', scheduleSnapshot);
    editor.sceneDocument.events.off('envChanged', scheduleSnapshot);
  };

  // Attach listeners
  editor.sceneDocument.events.on('nodeAdded', scheduleSnapshot);
  editor.sceneDocument.events.on('nodeRemoved', scheduleSnapshot);
  editor.sceneDocument.events.on('nodeChanged', scheduleSnapshot);
  editor.sceneDocument.events.on('sceneReplaced', scheduleSnapshot);
  editor.sceneDocument.events.on('envChanged', scheduleSnapshot);

  return { flushNow, resolveConflict, dispose };
}
