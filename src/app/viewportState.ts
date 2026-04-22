// src/app/viewportState.ts

export interface ViewportSnapshot {
  position: [number, number, number];
  target: [number, number, number];
}

const SNAPSHOTS = new Map<string, ViewportSnapshot>();

export function getSnapshot(panelId: string): ViewportSnapshot | undefined {
  return SNAPSHOTS.get(panelId);
}

export function setSnapshot(panelId: string, snap: ViewportSnapshot): void {
  SNAPSHOTS.set(panelId, snap);
}

export function clearSnapshot(panelId: string): void {
  SNAPSHOTS.delete(panelId);
}
