import type { Editor } from '../Editor';
import { validateScene } from './io/SceneInvariants';
import { ConflictError, NotFoundError } from '../sync/SyncEngine';

const DEBOUNCE_DELAY = 2000;

export interface AutoSaveHandle {
  flushNow(): Promise<void>;
  dispose(): void;
}

export function createAutoSave(editor: Editor): AutoSaveHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSnapshot = (): void => {
    editor.events.emit('autosaveStatusChanged', 'pending');
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { void flushNow(); }, DEBOUNCE_DELAY);
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

    // Sync engine push (parallel to legacy file write — kept for persistence continuity
    // until LocalSyncEngine lands in step 3).
    if (editor.syncEngine && editor.syncSceneId !== null && editor.syncBaseVersion !== null) {
      try {
        const { version } = await editor.syncEngine.push(
          editor.syncSceneId,
          editor.sceneDocument,
          editor.syncBaseVersion,
        );
        editor.syncBaseVersion = version;
      } catch (err) {
        if (err instanceof ConflictError) {
          console.warn(
            `[AutoSave] SyncEngine conflict on scene "${editor.syncSceneId}" — ` +
            `remote version ${err.currentVersion}, local base ${editor.syncBaseVersion}. ` +
            'Conflict UI is a future issue.',
            err,
          );
        } else if (err instanceof NotFoundError) {
          console.warn(`[AutoSave] SyncEngine scene not found: "${editor.syncSceneId}"`, err);
        } else {
          console.warn('[AutoSave] syncEngine.push failed:', err);
        }
      }
    }

    editor.events.emit('autosaveStatusChanged', 'saved');
  };

  const dispose = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
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

  return { flushNow, dispose };
}
