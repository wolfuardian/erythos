/**
 * upgradeLocalToCloud — Local → Cloud project upgrade flow.
 *
 * Uploads the current local project to the cloud and switches the editor to
 * CloudProjectManager. The local file is preserved on disk (D-7).
 *
 * Flow:
 *   1. syncEngine.create(name, sceneDocument)
 *      — internally calls uploadSceneBinaries (project:// → assets://) then
 *        POST /api/scenes. All asset upload + scene creation is one atomic call.
 *   2. markEntryMigrated(entryId, sceneId) — record the mapping so the batch dialog
 *      can detect already-migrated entries and avoid cloud duplicates (#1082).
 *   3. closeProject() — tears down local editor state.
 *   4. openCloudProject(sceneId) — mounts CloudProjectManager + new Editor.
 *
 * Error strategy (mirrors dispatch spec):
 *   - upload / POST fails → throw, caller surfaces via ErrorDialog.
 *   - Already-uploaded assets are content-addressed (no-op on retry).
 *   - openCloudProject fail → throw, scene is already created on server;
 *     user can access it from cloud list.
 *
 * Spec ref: docs/cloud-project-spec.md § Local → Cloud 升級
 * Design decision D-7: upgrade does not delete local file.
 * Refs: #1053, #1082
 */

import type { Editor } from '../core/Editor';
import type { HttpSyncEngine } from '../core/sync/HttpSyncEngine';
import type { User } from '../core/auth/AuthClient';
import { markEntryMigrated } from './anonMigrateState';

export interface UpgradeLocalToCloudDeps {
  editor: Editor;
  syncEngine: HttpSyncEngine;
  closeProject: () => Promise<void>;
  openCloudProject: (sceneId: string, resolvedUser?: User | null) => Promise<void>;
  /** Current auth state. undefined = unresolved, null = guest, User = signed in. */
  currentUser: User | null | undefined;
}

/**
 * Upgrade the currently open LocalProject to a CloudProject.
 *
 * @throws if asset upload, POST /api/scenes, or openCloudProject fails.
 *   The caller is responsible for catching and displaying the error.
 */
export async function upgradeLocalToCloud(deps: UpgradeLocalToCloudDeps): Promise<void> {
  const { editor, syncEngine, closeProject, openCloudProject, currentUser } = deps;

  // Capture scene name, document, and entry ID before tearing down the project.
  const sceneName = editor.projectManager.name ?? 'Untitled';
  const sceneDocument = editor.sceneDocument;
  // currentId is null when no project is open (should not happen here — guard by no-op).
  const entryId = editor.projectManager.currentId;

  // Step 1: upload all project:// assets + POST /api/scenes in one call.
  // syncEngine.create() internally calls uploadSceneBinaries() when projectManager
  // and assetClient are wired (they are — App.tsx injects both at construction time).
  const { id: sceneId } = await syncEngine.create(sceneName, sceneDocument);

  // Step 1b: record the local→cloud mapping so the batch dialog can detect entries
  // that were already uploaded via the Toolbar button and avoid creating duplicates.
  // No-op when entryId is null (no project was open — should not reach this path).
  // Refs: #1082
  if (entryId !== null) {
    markEntryMigrated(entryId, sceneId);
  }

  // Step 2: tear down the local editor (flushes autosave, destroys bridge, etc.)
  await closeProject();

  // Step 3: mount CloudProjectManager and new Editor for the created scene.
  // Pass currentUser as resolvedUser to avoid a race where the signal would still be
  // undefined when openCloudProject runs (mirrors cold-start pattern in App.tsx).
  // If currentUser is undefined here (should not happen — button is auth-gated), fall
  // back to undefined and let openCloudProject read the signal itself.
  await openCloudProject(sceneId, currentUser ?? undefined);
}
