import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoSave } from '../AutoSave';

// mock editor
function makeEditor() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    sceneDocument: {
      events: {
        on: vi.fn((evt: string, fn: () => void) => {
          listeners[evt] ??= [];
          listeners[evt].push(fn);
        }),
        off: vi.fn(),
        emit: vi.fn((evt: string) => listeners[evt]?.forEach(fn => fn())),
      },
      serialize: vi.fn(() => ({ version: 1, nodes: [] })),
    },
    projectManager: {
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    events: {
      emit: vi.fn(),
    },
    _listeners: listeners,
  } as any;
}

describe('AutoSave', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('schedules writeFile after debounce', async () => {
    const editor = makeEditor();
    const autosave = new AutoSave(editor);
    editor.sceneDocument.events.emit('nodeAdded');
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();
    expect(editor.projectManager.writeFile).toHaveBeenCalledWith(
      'scenes/scene.erythos',
      expect.any(String),
    );
    autosave.dispose();
  });

  it('flushNow writes immediately without waiting for debounce', async () => {
    const editor = makeEditor();
    const autosave = new AutoSave(editor);
    await autosave.flushNow();
    expect(editor.projectManager.writeFile).toHaveBeenCalledTimes(1);
    autosave.dispose();
  });

  it('emits error status when writeFile throws', async () => {
    const editor = makeEditor();
    editor.projectManager.writeFile = vi.fn().mockRejectedValue(new Error('disk full'));
    const autosave = new AutoSave(editor);
    await autosave.flushNow();
    expect(editor.events.emit).toHaveBeenCalledWith('autosaveStatusChanged', 'error');
    autosave.dispose();
  });

  it('dispose clears timer and removes listeners', () => {
    const editor = makeEditor();
    const autosave = new AutoSave(editor);
    editor.sceneDocument.events.emit('nodeAdded');
    autosave.dispose();
    vi.advanceTimersByTime(2000);
    expect(editor.projectManager.writeFile).not.toHaveBeenCalled();
    expect(editor.sceneDocument.events.off).toHaveBeenCalledTimes(4);
  });
});
