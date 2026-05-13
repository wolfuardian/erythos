import type { Editor } from '../Editor';
import { SceneDocument } from './SceneDocument';
import { asAssetPath } from '../../utils/branded';
import { validateScene } from './io/SceneInvariants';
import {
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
  PreconditionError,
  PreconditionRequiredError,
  ServerError,
  NetworkError,
} from '../sync/SyncEngine';
import { createMultiTabCoord } from '../sync/MultiTabCoord';
import type { MultiTabCoord } from '../sync/MultiTabCoord';
import type { CloudProjectManager } from '../project/CloudProjectManager';

const DEBOUNCE_DELAY = 2000;
const RETRY_DELAY_MS = 1000;

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

export function createAutoSave(editor: Editor, coord?: MultiTabCoord): AutoSaveHandle {
  // If no coord is provided, create a default one using browser globals.
  const multiTabCoord: MultiTabCoord = coord ?? createMultiTabCoord();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingConflict: PendingConflict | null = null;

  // Track the current version subscription's unsubscribe fn so it can be
  // re-wired when the scene changes (Editor.loadScene fires syncSceneIdChanged).
  let versionUnsub: (() => void) | null = null;

  const subscribeVersionUpdates = (sceneId: string | null): void => {
    if (versionUnsub) { versionUnsub(); versionUnsub = null; }
    if (!sceneId) return;
    versionUnsub = multiTabCoord.onVersionChanged(sceneId, (v) => {
      // Another tab completed a PUT successfully — advance our baseVersion so
      // our next PUT doesn't collide.
      if (editor.syncBaseVersion !== null && v > editor.syncBaseVersion) {
        editor.syncBaseVersion = v;
      }
    });
  };

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
   * Network / server errors are retried once after RETRY_DELAY_MS. On second failure
   * (or any non-retryable error), emits syncError for the banner.
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
      // Broadcast the new version to other tabs so they update their baseVersion.
      multiTabCoord.broadcastVersion(editor.syncSceneId, version);
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

        // Snapshot the local document at conflict time so the dialog always
        // shows the state at the moment of conflict — not a live reference
        // that could drift if the user continues editing.
        const localSnapshot = new SceneDocument();
        localSnapshot.deserialize(editor.sceneDocument.serialize());

        editor.events.emit('syncConflict', {
          sceneId: err.sceneId,
          scenePath,
          baseVersion: bakBaseVersion,
          currentVersion: err.currentVersion,
          localBody: localSnapshot,
          cloudBody: err.currentBody,
        });
      } else if (err instanceof NotFoundError) {
        console.warn(`[AutoSave] SyncEngine scene not found: "${editor.syncSceneId}"`, err);
      } else if (err instanceof PayloadTooLargeError) {
        // 413 — scene exceeds server size limit. No retry.
        editor.events.emit('syncError', {
          kind: 'payload-too-large',
          message: 'Scene exceeds size limit',
        });
      } else if (err instanceof PreconditionError || err instanceof PreconditionRequiredError) {
        // 412 / 428 — client bug: malformed or missing If-Match header.
        // TODO: replace console.error with telemetry when infra is available.
        console.error('[F-3] If-Match precondition failed — client bug', err);
        editor.events.emit('syncError', {
          kind: 'client-bug',
          message: 'Sync error (client bug) — please reload',
        });
      } else if (err instanceof ServerError || err instanceof NetworkError) {
        // Transient failure — retry once after a short delay.
        const kind = err instanceof NetworkError ? 'network-offline' : 'sync-failed-local-saved';
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

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
          multiTabCoord.broadcastVersion(editor.syncSceneId, version);
        } catch {
          // Second attempt also failed — local is already saved, show banner.
          editor.events.emit('syncError', {
            kind,
            message: 'Sync failed, local is saved',
          });
        }
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
      const sceneId = editor.syncSceneId;
      await multiTabCoord.withWriteLock(sceneId, () => pushOrCaptureConflict(json));
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
      if (editor.syncEngine && editor.syncSceneId !== null) {
        const sceneId = editor.syncSceneId;
        await multiTabCoord.withWriteLock(sceneId, () => pushOrCaptureConflict(json));
      } else {
        await pushOrCaptureConflict(json);
      }
    } else {
      // use-cloud: Lock 5 — round-trip via serialize/deserialize
      editor.sceneDocument.deserialize(pc.remoteBody.serialize());
      editor.syncBaseVersion = pc.currentVersion;
      pendingConflict = null;
    }
  };

  // Re-wire version subscription when the loaded scene changes.
  const onSyncSceneIdChanged = (id: string | null): void => {
    subscribeVersionUpdates(id);
  };

  const dispose = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    // Lock 6: clear pendingConflict on dispose
    pendingConflict = null;
    // Clean up version subscription and coord channels.
    if (versionUnsub) { versionUnsub(); versionUnsub = null; }
    multiTabCoord.dispose();
    editor.sceneDocument.events.off('nodeAdded', scheduleSnapshot);
    editor.sceneDocument.events.off('nodeRemoved', scheduleSnapshot);
    editor.sceneDocument.events.off('nodeChanged', scheduleSnapshot);
    editor.sceneDocument.events.off('sceneReplaced', scheduleSnapshot);
    editor.sceneDocument.events.off('envChanged', scheduleSnapshot);
    editor.events.off('syncSceneIdChanged', onSyncSceneIdChanged);
  };

  // Attach listeners
  editor.sceneDocument.events.on('nodeAdded', scheduleSnapshot);
  editor.sceneDocument.events.on('nodeRemoved', scheduleSnapshot);
  editor.sceneDocument.events.on('nodeChanged', scheduleSnapshot);
  editor.sceneDocument.events.on('sceneReplaced', scheduleSnapshot);
  editor.sceneDocument.events.on('envChanged', scheduleSnapshot);
  editor.events.on('syncSceneIdChanged', onSyncSceneIdChanged);

  // Subscribe to version updates for the currently loaded scene (if any).
  subscribeVersionUpdates(editor.syncSceneId ?? null);

  return { flushNow, resolveConflict, dispose };
}

// ── Cloud AutoSave ────────────────────────────────────────────────────────────

/**
 * Cloud-specific AutoSave — replaces the local writeFile + syncEngine.push path
 * with CloudProjectManager.saveScene (which handles PUT /api/scenes/:id internally).
 *
 * Differences from createAutoSave:
 *  - No local file write (cloud is server-canonical; no FileSystemDirectoryHandle)
 *  - No .bak file on conflict (no writable FS surface in CloudProject)
 *  - Uses cloudManager.saveScene → SaveResult discriminated union
 *  - baseVersion is tracked locally (initialised from editor.syncBaseVersion after loadScene)
 *
 * LocalProject path: 100% unchanged — this function is only called from openCloudProject.
 *
 * Spec: docs/cloud-project-spec.md § Phase G2 — AutoSave 切換
 */
export function createCloudAutoSave(
  editor: Editor,
  cloudManager: CloudProjectManager,
): AutoSaveHandle {
  const multiTabCoord: MultiTabCoord = createMultiTabCoord();

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingConflict: PendingConflict | null = null;
  let versionUnsub: (() => void) | null = null;

  // Track base version locally, seeded from editor.syncBaseVersion after loadScene.
  let baseVersion = editor.syncBaseVersion ?? 0;

  const subscribeVersionUpdates = (sceneId: string | null): void => {
    if (versionUnsub) { versionUnsub(); versionUnsub = null; }
    if (!sceneId) return;
    versionUnsub = multiTabCoord.onVersionChanged(sceneId, (v) => {
      if (v > baseVersion) {
        baseVersion = v;
        editor.syncBaseVersion = v;
      }
    });
  };

  const scheduleSnapshot = (): void => {
    editor.events.emit('autosaveStatusChanged', 'pending');
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { void flushNow(); }, DEBOUNCE_DELAY);
  };

  const flushNow = async (): Promise<void> => {
    if (timer !== null) { clearTimeout(timer); timer = null; }

    const scene = editor.sceneDocument.serialize();
    const json = JSON.stringify(scene);

    // Validate before sending: reject invariant-violating scenes
    const violations = validateScene(scene, json);
    if (violations.length > 0) {
      console.error('[CloudAutoSave] Pre-write validation failed:');
      for (const v of violations) {
        console.error(`  [${v.path}] ${v.reason}`);
      }
      editor.events.emit('autosaveStatusChanged', 'error');
      return;
    }

    // Suppress push when conflict dialog is open
    if (pendingConflict !== null) return;

    const sceneId = cloudManager.sceneId;
    const currentBase = baseVersion;

    let saveResult;
    try {
      saveResult = await multiTabCoord.withWriteLock(sceneId, async () => {
        return cloudManager.saveScene(editor.sceneDocument, currentBase);
      });
    } catch (err) {
      // Re-thrown errors from saveScene: PayloadTooLargeError / PreconditionError etc.
      if (err instanceof PayloadTooLargeError) {
        editor.events.emit('syncError', {
          kind: 'payload-too-large',
          message: 'Scene exceeds size limit',
        });
      } else if (err instanceof PreconditionError || err instanceof PreconditionRequiredError) {
        console.error('[CloudAutoSave] If-Match precondition failed — client bug', err);
        editor.events.emit('syncError', {
          kind: 'client-bug',
          message: 'Sync error (client bug) — please reload',
        });
      } else if (err instanceof ServerError || err instanceof NetworkError) {
        // Transient — retry once
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        try {
          const retryResult = await cloudManager.saveScene(editor.sceneDocument, baseVersion);
          if (retryResult.ok) {
            baseVersion = retryResult.version;
            editor.syncBaseVersion = retryResult.version;
            multiTabCoord.broadcastVersion(sceneId, retryResult.version);
            editor.events.emit('autosaveStatusChanged', 'saved');
          } else {
            editor.events.emit('syncError', {
              kind: err instanceof NetworkError ? 'network-offline' : 'sync-failed-local-saved',
              message: 'Sync failed',
            });
          }
        } catch {
          editor.events.emit('syncError', {
            kind: err instanceof NetworkError ? 'network-offline' : 'sync-failed-local-saved',
            message: 'Sync failed',
          });
        }
      } else {
        console.warn('[CloudAutoSave] saveScene threw unexpectedly:', err);
        editor.events.emit('autosaveStatusChanged', 'error');
      }
      return;
    }

    if (!saveResult) return;

    if (saveResult.ok) {
      baseVersion = saveResult.version;
      editor.syncBaseVersion = saveResult.version;
      multiTabCoord.broadcastVersion(sceneId, saveResult.version);
      editor.events.emit('autosaveStatusChanged', 'saved');
    } else if (saveResult.reason === 'conflict') {
      pendingConflict = {
        sceneId,
        currentVersion: saveResult.currentVersion,
        remoteBody: saveResult.currentBody,
      };

      const localSnapshot = new SceneDocument();
      localSnapshot.deserialize(editor.sceneDocument.serialize());

      editor.events.emit('syncConflict', {
        sceneId,
        scenePath: asAssetPath('(cloud)'),
        baseVersion: currentBase,
        currentVersion: saveResult.currentVersion,
        localBody: localSnapshot,
        cloudBody: saveResult.currentBody,
      });
    } else if (saveResult.reason === 'offline') {
      editor.events.emit('syncError', {
        kind: 'network-offline',
        message: 'Offline — changes will sync when reconnected',
      });
    } else if (saveResult.reason === 'unauthorized') {
      editor.events.emit('syncError', {
        kind: 'sync-failed-local-saved',
        message: 'Session expired — please sign in again',
      });
    }
  };

  const resolveConflict = async (choice: 'keep-local' | 'use-cloud'): Promise<void> => {
    const pc = pendingConflict;
    if (!pc) return;

    if (choice === 'keep-local') {
      pendingConflict = null;
      baseVersion = pc.currentVersion;
      editor.syncBaseVersion = pc.currentVersion;

      const sceneId = cloudManager.sceneId;
      try {
        const retryResult = await multiTabCoord.withWriteLock(sceneId, async () =>
          cloudManager.saveScene(editor.sceneDocument, baseVersion),
        );
        if (retryResult.ok) {
          baseVersion = retryResult.version;
          editor.syncBaseVersion = retryResult.version;
          multiTabCoord.broadcastVersion(sceneId, retryResult.version);
        } else if (retryResult.reason === 'conflict') {
          // Double-conflict — set new pendingConflict
          pendingConflict = {
            sceneId,
            currentVersion: retryResult.currentVersion,
            remoteBody: retryResult.currentBody,
          };
          const localSnapshot = new SceneDocument();
          localSnapshot.deserialize(editor.sceneDocument.serialize());
          editor.events.emit('syncConflict', {
            sceneId,
            scenePath: asAssetPath('(cloud)'),
            baseVersion,
            currentVersion: retryResult.currentVersion,
            localBody: localSnapshot,
            cloudBody: retryResult.currentBody,
          });
        }
      } catch (err) {
        console.warn('[CloudAutoSave] resolveConflict keep-local push failed:', err);
      }
    } else {
      // use-cloud: restore remote body
      editor.sceneDocument.deserialize(pc.remoteBody.serialize());
      baseVersion = pc.currentVersion;
      editor.syncBaseVersion = pc.currentVersion;
      pendingConflict = null;
    }
  };

  const onSyncSceneIdChanged = (id: string | null): void => {
    subscribeVersionUpdates(id);
  };

  const dispose = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    pendingConflict = null;
    if (versionUnsub) { versionUnsub(); versionUnsub = null; }
    multiTabCoord.dispose();
    editor.sceneDocument.events.off('nodeAdded', scheduleSnapshot);
    editor.sceneDocument.events.off('nodeRemoved', scheduleSnapshot);
    editor.sceneDocument.events.off('nodeChanged', scheduleSnapshot);
    editor.sceneDocument.events.off('sceneReplaced', scheduleSnapshot);
    editor.sceneDocument.events.off('envChanged', scheduleSnapshot);
    editor.events.off('syncSceneIdChanged', onSyncSceneIdChanged);
  };

  // Attach listeners
  editor.sceneDocument.events.on('nodeAdded', scheduleSnapshot);
  editor.sceneDocument.events.on('nodeRemoved', scheduleSnapshot);
  editor.sceneDocument.events.on('nodeChanged', scheduleSnapshot);
  editor.sceneDocument.events.on('sceneReplaced', scheduleSnapshot);
  editor.sceneDocument.events.on('envChanged', scheduleSnapshot);
  editor.events.on('syncSceneIdChanged', onSyncSceneIdChanged);

  subscribeVersionUpdates(cloudManager.sceneId);

  return { flushNow, resolveConflict, dispose };
}
