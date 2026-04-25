// src/app/viewportState.ts

import { store, mutate } from './workspaceStore';
import type { ViewportSnapshot, ViewportPanelState } from './workspaceStore';

export type { ViewportSnapshot, ViewportPanelState };

// ── Camera snapshot（向後相容，只處理 camera 欄位）──────────────────────

export function getSnapshot(workspaceId: string, areaId: string): ViewportSnapshot | undefined {
  const ws = store().workspaces.find(w => w.id === workspaceId);
  return ws?.viewportState?.[areaId]?.camera;
}

export function setSnapshot(workspaceId: string, areaId: string, snap: ViewportSnapshot): void {
  mutate(s => ({
    ...s,
    workspaces: s.workspaces.map(w =>
      w.id === workspaceId
        ? {
            ...w,
            viewportState: {
              ...(w.viewportState ?? {}),
              [areaId]: {
                ...(w.viewportState?.[areaId] ?? {}),
                camera: snap,
              },
            },
          }
        : w
    ),
  }));
}

// ── Full panel state（patch 模式）────────────────────────────────────────

export function getPanelState(workspaceId: string, areaId: string): ViewportPanelState | undefined {
  const ws = store().workspaces.find(w => w.id === workspaceId);
  return ws?.viewportState?.[areaId];
}

export function setPanelState(
  workspaceId: string,
  areaId: string,
  patch: Partial<ViewportPanelState>,
): void {
  mutate(s => ({
    ...s,
    workspaces: s.workspaces.map(w =>
      w.id === workspaceId
        ? {
            ...w,
            viewportState: {
              ...(w.viewportState ?? {}),
              [areaId]: {
                ...(w.viewportState?.[areaId] ?? {}),
                ...patch,
              },
            },
          }
        : w
    ),
  }));
}
