// Persisted UI/session state across page reloads.
// localStorage by design — survives reload, cleared on explicit user action
// (Close Project for project id, deletion fallback for scene path).

const LAST_PROJECT_KEY = 'erythos-last-project-id';
const LAST_SCENE_KEY_PREFIX = 'erythos-last-scene-';

export const DEFAULT_SCENE_PATH = 'scenes/scene.erythos';

export function getLastProjectId(): string | null {
  try { return localStorage.getItem(LAST_PROJECT_KEY); }
  catch { return null; }
}

export function setLastProjectId(id: string): void {
  try { localStorage.setItem(LAST_PROJECT_KEY, id); }
  catch { /* localStorage may be disabled — auto-restore disabled silently */ }
}

export function clearLastProjectId(): void {
  try { localStorage.removeItem(LAST_PROJECT_KEY); }
  catch { /* ignore */ }
}

export function getLastScenePath(projectId: string): string | null {
  try { return localStorage.getItem(`${LAST_SCENE_KEY_PREFIX}${projectId}`); }
  catch { return null; }
}

export function setLastScenePath(projectId: string, path: string): void {
  try { localStorage.setItem(`${LAST_SCENE_KEY_PREFIX}${projectId}`, path); }
  catch { /* localStorage may be disabled */ }
}

export function clearLastScenePath(projectId: string): void {
  try { localStorage.removeItem(`${LAST_SCENE_KEY_PREFIX}${projectId}`); }
  catch { /* ignore */ }
}
