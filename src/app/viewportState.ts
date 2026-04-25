// src/app/viewportState.ts

import { store, mutate } from './workspaceStore';

export interface ViewportSnapshot {
  position: [number, number, number];
  target: [number, number, number];
}

export function getSnapshot(workspaceId: string, areaId: string): ViewportSnapshot | undefined {
  const ws = store().workspaces.find(w => w.id === workspaceId);
  return ws?.viewportState?.[areaId];
}

export function setSnapshot(workspaceId: string, areaId: string, snap: ViewportSnapshot): void {
  mutate(s => ({
    ...s,
    workspaces: s.workspaces.map(w =>
      w.id === workspaceId
        ? { ...w, viewportState: { ...(w.viewportState ?? {}), [areaId]: snap } }
        : w
    ),
  }));
}
