import type { DockviewApi } from 'dockview-core';

const STORAGE_KEY = 'erythos-layout-v1';

export function applyDefaultLayout(api: DockviewApi): void {
  // Try to restore saved layout
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      api.fromJSON(JSON.parse(saved));
      return;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // Default layout: viewport (center), scene-tree (left), properties (right)
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

  api.addPanel({
    id: 'project',
    component: 'project',
    title: 'Project',
    position: { referencePanel: 'scene-tree', direction: 'within' },
  });

  api.addPanel({
    id: 'settings',
    component: 'settings',
    title: 'Settings',
    position: { referencePanel: 'properties', direction: 'within' },
  });
}

export function saveLayout(api: DockviewApi): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
  } catch { /* quota exceeded — silently ignore */ }
}

export function clearSavedLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
}
