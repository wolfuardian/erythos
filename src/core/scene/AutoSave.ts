import type { Editor } from '../Editor';

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
    const json = JSON.stringify(editor.sceneDocument.serialize());
    const path = editor.projectManager.currentScenePath();
    try {
      await editor.projectManager.writeFile(path, json);
      editor.events.emit('autosaveStatusChanged', 'saved');
    } catch (err) {
      console.warn('[AutoSave] writeFile failed:', err);
      editor.events.emit('autosaveStatusChanged', 'error');
    }
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
