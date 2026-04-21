import type { DockviewApi } from 'dockview-core';
import { hydrate, snapshot, clear as clearStore } from '../editorTypeStore';

const STORAGE_KEY_OLD = 'erythos-layout-v1';
const STORAGE_KEY = 'erythos-layout-v2';

interface SavedLayoutV2 {
  version: 2;
  editorTypes: Record<string, string>; // panelId → editorType
  grid: unknown;                       // Dockview toJSON() 結果
}

export function applyDefaultLayout(api: DockviewApi): void {
  // 清除舊 key
  localStorage.removeItem(STORAGE_KEY_OLD);

  // 嘗試讀新 key
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as SavedLayoutV2;
      if (parsed.version === 2 && parsed.grid) {
        // 重要：hydrate 必須在 fromJSON 之前，AreaShell createSignal 初始化時才讀得到
        hydrate(parsed.editorTypes ?? {});
        api.fromJSON(parsed.grid as never);
        return;
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // Default 3-Area layout
  clearStore();
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
}

export function saveLayout(api: DockviewApi): void {
  try {
    const payload: SavedLayoutV2 = {
      version: 2,
      editorTypes: snapshot(),
      grid: api.toJSON(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* quota exceeded — ignore */ }
}

export function clearSavedLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY_OLD);
  clearStore();
}
