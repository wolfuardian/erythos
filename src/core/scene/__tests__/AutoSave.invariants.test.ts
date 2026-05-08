/**
 * AutoSave — pre-write validation integration tests.
 *
 * Verifies that AutoSave calls validateScene before writing to disk and:
 *   - Does NOT call writeFile when validation fails
 *   - Emits 'error' status on validation failure
 *   - DOES call writeFile when scene is valid
 *
 * These tests complement AutoSave.test.ts and focus only on the invariant
 * validation gate introduced in Phase 3-A.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutoSave } from '../AutoSave';
import type { ErythosSceneV2 } from '../io/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEditor(overrideSerialize?: () => ErythosSceneV2) {
  const listeners: Record<string, (() => void)[]> = {};

  const defaultSerialize = (): ErythosSceneV2 => ({
    version: 2,
    env: { hdri: null, intensity: 1, rotation: 0 },
    nodes: [],
  });

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
      serialize: vi.fn(overrideSerialize ?? defaultSerialize),
    },
    projectManager: {
      currentScenePath: vi.fn(() => 'scenes/scene.erythos'),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    events: {
      emit: vi.fn(),
    },
    _listeners: listeners,
  } as any;
}

// A valid scene with a single mesh node
function makeValidScene(): ErythosSceneV2 {
  return {
    version: 2,
    env: { hdri: null, intensity: 1, rotation: 0 },
    nodes: [
      {
        id: 'mesh-001',
        name: 'Mesh',
        parent: null,
        order: 0,
        nodeType: 'mesh',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        asset: 'project://box.glb',
        userData: {},
      },
    ],
  };
}

// An invalid scene: mesh node missing required asset field.
// We cast to bypass TS to simulate a corrupted in-memory state.
function makeInvalidScene(): ErythosSceneV2 {
  return {
    version: 2,
    env: { hdri: null, intensity: 1, rotation: 0 },
    nodes: [
      {
        id: 'mesh-bad',
        name: 'Bad Mesh',
        parent: null,
        order: 0,
        nodeType: 'mesh',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        // asset is missing -- violates invariant 8
        userData: {},
      } as any,
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AutoSave — pre-write validation gate', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('writes to disk when serialized scene is valid', async () => {
    const editor = makeEditor(() => makeValidScene());
    const autosave = createAutoSave(editor);
    await autosave.flushNow();

    expect(editor.projectManager.writeFile).toHaveBeenCalledTimes(1);
    expect(editor.events.emit).toHaveBeenCalledWith('autosaveStatusChanged', 'saved');
    autosave.dispose();
  });

  it('does NOT write to disk when serialized scene fails validation', async () => {
    const editor = makeEditor(() => makeInvalidScene());
    const autosave = createAutoSave(editor);
    await autosave.flushNow();

    expect(editor.projectManager.writeFile).not.toHaveBeenCalled();
    autosave.dispose();
  });

  it('emits error status when validation fails (not saved)', async () => {
    const editor = makeEditor(() => makeInvalidScene());
    const autosave = createAutoSave(editor);
    await autosave.flushNow();

    expect(editor.events.emit).toHaveBeenCalledWith('autosaveStatusChanged', 'error');
    autosave.dispose();
  });

  it('does NOT emit saved status when validation fails', async () => {
    const editor = makeEditor(() => makeInvalidScene());
    const autosave = createAutoSave(editor);
    await autosave.flushNow();

    const calls = (editor.events.emit as ReturnType<typeof vi.fn>).mock.calls;
    const savedCalls = calls.filter(
      ([evt, status]: [string, string]) => evt === 'autosaveStatusChanged' && status === 'saved',
    );
    expect(savedCalls).toHaveLength(0);
    autosave.dispose();
  });

  it('still validates and writes after debounce with valid scene', async () => {
    const editor = makeEditor(() => makeValidScene());
    const autosave = createAutoSave(editor);
    editor.sceneDocument.events.emit('nodeAdded');
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();

    expect(editor.projectManager.writeFile).toHaveBeenCalledTimes(1);
    autosave.dispose();
  });

  it('does not write after debounce when serialized scene is invalid', async () => {
    const editor = makeEditor(() => makeInvalidScene());
    const autosave = createAutoSave(editor);
    editor.sceneDocument.events.emit('nodeAdded');
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();

    expect(editor.projectManager.writeFile).not.toHaveBeenCalled();
    autosave.dispose();
  });
});
