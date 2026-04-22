import type { DockviewApi } from 'dockview-core';
import { LAYOUT_PRESET_ID, DEBUG_PRESET_ID, STORAGE_KEY, LEGACY_KEY } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

/** Remove persisted workspace data so next reload starts fresh (Reset Layout button). */
export function clearSavedLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  // also clear old pre-workspaceStore keys
  localStorage.removeItem('erythos-layout-v1');
  localStorage.removeItem('erythos-layout-v2');
}

export function applyWorkspace(api: DockviewApi, workspace: Workspace): void {
  if (
    workspace.grid &&
    typeof workspace.grid === 'object' &&
    Object.keys(workspace.grid as object).length > 0
  ) {
    try {
      api.fromJSON(workspace.grid as never);
      return;
    } catch {
      // fall through to preset-aware fallback
    }
  }
  applyPresetFallback(api, workspace.id);
}

function applyPresetFallback(api: DockviewApi, workspaceId: string): void {
  if (workspaceId === LAYOUT_PRESET_ID) {
    // Layout preset：3 欄（scene-tree 左 220 / viewport 中 / properties 右 280）
    const viewport = api.addPanel({
      id: 'viewport',
      component: 'viewport',
      title: 'Viewport',
    });
    api.addPanel({
      id: 'scene-tree',
      component: 'scene-tree',
      title: 'Scene',
      position: { referencePanel: viewport, direction: 'left' },
      initialWidth: 220,
    });
    api.addPanel({
      id: 'properties',
      component: 'properties',
      title: 'Properties',
      position: { referencePanel: viewport, direction: 'right' },
      initialWidth: 280,
    });
  } else if (workspaceId === DEBUG_PRESET_ID) {
    // Debug preset：viewport 中 / environment 右 300 / leaf 底 200
    const viewport = api.addPanel({
      id: 'viewport',
      component: 'viewport',
      title: 'Viewport',
    });
    api.addPanel({
      id: 'environment',
      component: 'environment',
      title: 'Environment',
      position: { referencePanel: viewport, direction: 'right' },
      initialWidth: 300,
    });
    api.addPanel({
      id: 'leaf',
      component: 'leaf',
      title: 'Leaf',
      position: { referencePanel: viewport, direction: 'below' },
      initialHeight: 200,
    });
  } else {
    // 使用者自建 workspace，grid 為空或損壞 → 單 viewport
    api.addPanel({
      id: 'viewport',
      component: 'viewport',
      title: 'Viewport',
    });
  }
}
