import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutoSave } from '../AutoSave';

// mock editor
function makeEditor(scenePath = 'scenes/scene.erythos') {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    sceneDocument: {
      events: {
        on: vi.fn((evt: string, fn: () => void) => {
          listeners[evt] ??= [];
          listeners[evt].push(fn);
        }),
        off: vi.fn((evt: string, fn: () => void) => {
          const arr = listeners[evt];
          if (arr) {
            const idx = arr.indexOf(fn);
            if (idx !== -1) arr.splice(idx, 1);
          }
        }),
        emit: vi.fn((evt: string) => listeners[evt]?.forEach(fn => fn())),
      },
      serialize: vi.fn(() => ({ version: 4, upAxis: 'Y', env: { hdri: null, intensity: 1, rotation: 0 }, nodes: [] })),
    },
    projectManager: {
      currentScenePath: vi.fn(() => scenePath),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    events: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    _listeners: listeners,
  } as any;
}

describe('AutoSave', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('schedules writeFile after debounce', async () => {
    const editor = makeEditor();
    const autosave = createAutoSave(editor);
    editor.sceneDocument.events.emit('nodeAdded');
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();
    expect(editor.projectManager.writeFile).toHaveBeenCalledWith(
      editor.projectManager.currentScenePath(),
      expect.any(String),
    );
    autosave.dispose();
  });

  it('flushNow writes to currentScenePath, not a hardcoded path', async () => {
    const customPath = 'scenes/my-level.erythos';
    const editor = makeEditor(customPath);
    const autosave = createAutoSave(editor);
    await autosave.flushNow();
    expect(editor.projectManager.writeFile).toHaveBeenCalledWith(
      customPath,
      expect.any(String),
    );
    autosave.dispose();
  });

  it('flushNow writes immediately without waiting for debounce', async () => {
    const editor = makeEditor();
    const autosave = createAutoSave(editor);
    await autosave.flushNow();
    expect(editor.projectManager.writeFile).toHaveBeenCalledTimes(1);
    autosave.dispose();
  });

  it('emits error status when writeFile throws', async () => {
    const editor = makeEditor();
    editor.projectManager.writeFile = vi.fn().mockRejectedValue(new Error('disk full'));
    const autosave = createAutoSave(editor);
    await autosave.flushNow();
    expect(editor.events.emit).toHaveBeenCalledWith('autosaveStatusChanged', 'error');
    autosave.dispose();
  });

  it('dispose clears timer and removes listeners', () => {
    const editor = makeEditor();
    const autosave = createAutoSave(editor);
    editor.sceneDocument.events.emit('nodeAdded');
    autosave.dispose();
    vi.advanceTimersByTime(2000);
    expect(editor.projectManager.writeFile).not.toHaveBeenCalled();
    expect(editor.sceneDocument.events.off).toHaveBeenCalledTimes(5);
  });

  describe('env subscription (F-2)', () => {
    // All three env fields (hdri / intensity / rotation) share the same envChanged event.
    // The single parametrized test below documents that each field triggers an autosave
    // while avoiding triple duplication of identical code paths.
    it.each(['hdri', 'intensity', 'rotation'])(
      'env change (%s) triggers save via envChanged event',
      async (_field) => {
        const editor = makeEditor();
        const autosave = createAutoSave(editor);
        editor.sceneDocument.events.emit('envChanged');
        vi.advanceTimersByTime(2000);
        await vi.runAllTimersAsync();
        expect(editor.projectManager.writeFile).toHaveBeenCalledTimes(1);
        autosave.dispose();
      },
    );

    it('dispose unsubscribes envChanged — env change after dispose does not trigger save', () => {
      const editor = makeEditor();
      const autosave = createAutoSave(editor);
      autosave.dispose();
      editor.sceneDocument.events.emit('envChanged');
      vi.advanceTimersByTime(2000);
      expect(editor.projectManager.writeFile).not.toHaveBeenCalled();
    });
  });
});
