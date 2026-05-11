import { createSignal } from 'solid-js';
import { generateUUID } from '../utils/uuid';
import { createLayoutPresetTree, createDebugPresetTree, validateTree } from './areaTree';

// ── Viewport Panel State ────────────────────────────────────────────────
export interface ViewportSnapshot {
  position: [number, number, number];
  target: [number, number, number];
}

/** Per-mode scene lights override。undefined = 使用 mode default（不 override）。*/
export type SceneLightsOverrides = Partial<Record<import('../viewport/ShadingManager').ShadingMode, boolean>>;

export interface ViewportPanelState {
  camera?: ViewportSnapshot;
  sceneLightsOverrides?: SceneLightsOverrides;
  lookdevPreset?: import('../viewport/ShadingManager').LookdevPreset;
  hdrIntensity?: number;
  hdrRotation?: number;
}

export interface Workspace {
  id: string;
  name: string;
  grid: unknown;                       // AreaTree（序列化為 JSON）
  editorTypes: Record<string, string>; // panelId → editorType
  viewportState: Record<string, ViewportPanelState>;
  panelStates?: Record<string, Record<string, Record<string, unknown>>>;
  //             ^areaId   ^editorType  ^hook key
}

export interface WorkspaceStore {
  version: 1;
  currentWorkspaceId: string;
  workspaces: Workspace[];
}

export const STORAGE_KEY = 'erythos-workspaces-v1';
export const LEGACY_KEY  = 'erythos-layout-v2';

export const LAYOUT_PRESET_ID = 'layout-preset';
export const DEBUG_PRESET_ID  = 'debug-preset';

// ── Presets ────────────────────────────────────────────────────────────
export function createLayoutPreset(): Workspace {
  return {
    id: LAYOUT_PRESET_ID,
    name: 'Layout',
    grid: createLayoutPresetTree(),
    editorTypes: {
      'scene-tree': 'scene-tree',
      'viewport': 'viewport',
      'properties': 'properties',
    },
    viewportState: {},
    panelStates: {},
  };
}
export function createDebugPreset(): Workspace {
  return {
    id: DEBUG_PRESET_ID,
    name: 'Debug',
    grid: createDebugPresetTree(),
    editorTypes: {
      'viewport': 'viewport',
      'environment': 'properties',
    },
    viewportState: {},
    panelStates: {},
  };
}
export function isPresetId(id: string): boolean {
  return id === LAYOUT_PRESET_ID || id === DEBUG_PRESET_ID;
}

// ── Name helper（export 供測試直接呼叫）───────────────────────────────
export function nextDuplicateName(existing: string[], base: string): string {
  const root = base.replace(/\.\d{3}$/, '');
  for (let n = 1; n <= 999; n++) {
    const candidate = `${root}.${String(n).padStart(3, '0')}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `${root}.${generateUUID().slice(0, 8)}`;
}

// ── Pure functions ─────────────────────────────────────────────────────
export function loadStore(): WorkspaceStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceStore;
      if (
        parsed.version === 1 &&
        typeof parsed.currentWorkspaceId === 'string' &&
        Array.isArray(parsed.workspaces) &&
        parsed.workspaces.length > 0
      ) {
        const ids = parsed.workspaces.map(w => w.id);
        if (!ids.includes(parsed.currentWorkspaceId)) {
          parsed.currentWorkspaceId = ids[0];
        }
        const sanitizedWorkspaces = parsed.workspaces.map(w => {
          if (validateTree(w.grid)) return w;
          // validateTree 失敗 → 根據 id 決定 fallback
          if (w.id === LAYOUT_PRESET_ID) return createLayoutPreset();
          if (w.id === DEBUG_PRESET_ID)  return createDebugPreset();
          // 其他 workspace 重建為 blank（保留 id / name，但 grid 換新）
          return { ...createLayoutPreset(), id: w.id, name: w.name };
        });
        const migratedWorkspaces = sanitizedWorkspaces.map(w =>
          w.viewportState ? w : { ...w, viewportState: {} }
        );
        const viewportMigratedWorkspaces = migratedWorkspaces.map(w => {
          if (!w.viewportState) return w;
          const newViewportState: Record<string, ViewportPanelState> = {};
          // OldViewportState: flat shape introduced in #587, before ViewportPanelState wrapper.
          type OldViewportState = { position: [number, number, number]; target: [number, number, number] };
          for (const [areaId, state] of Object.entries(w.viewportState)) {
            // 偵測舊結構：直接含 position 欄位（#587 引入的 ViewportSnapshot 格式）
            const maybeOld = state as unknown;
            if (
              typeof maybeOld === 'object' &&
              maybeOld !== null &&
              'position' in maybeOld &&
              Array.isArray((maybeOld as OldViewportState).position)
            ) {
              // 舊格式 → 包成 ViewportPanelState.camera
              const oldState = maybeOld as OldViewportState;
              newViewportState[areaId] = {
                camera: { position: oldState.position, target: oldState.target },
              };
            } else {
              // 新格式，直接保留
              newViewportState[areaId] = state as ViewportPanelState;
            }
          }
          return { ...w, viewportState: newViewportState };
        });
        const panelStatesMigratedWorkspaces = viewportMigratedWorkspaces.map(w =>
          w.panelStates ? w : { ...w, panelStates: {} }
        );
        // Migration: leaf → prefab (issue #526 PR 2)
        const leafToPrefabMigratedWorkspaces = panelStatesMigratedWorkspaces.map(w => {
          // A. Debug preset workspace 強制重建
          if (w.id === 'debug-preset') {
            const grid = w.grid as { areas?: Array<{ id: string }> };
            const hasLeafAreaId = Array.isArray(grid?.areas) &&
              grid.areas.some((a: { id: string }) => a.id === 'leaf');
            const hasLeafEditorType = 'leaf' in w.editorTypes ||
              Object.values(w.editorTypes).includes('leaf');
            if (hasLeafAreaId || hasLeafEditorType) {
              return createDebugPreset();
            }
            return w;
          }
          // B. 其他 workspace：editorTypes value rename
          const newEditorTypes: Record<string, string> = {};
          for (const [areaId, editorType] of Object.entries(w.editorTypes)) {
            newEditorTypes[areaId] = editorType === 'leaf' ? 'prefab' : editorType;
          }
          return { ...w, editorTypes: newEditorTypes };
        });
        // Migration: prefab → workshop (P4: PrefabPanel decommissioned, replaced by WorkshopPanel)
        const prefabToWorkspaceMigratedWorkspaces = leafToPrefabMigratedWorkspaces.map(w => {
          // A. Debug preset workspace: force-rebuild if editorTypes still references 'prefab' editorType
          if (w.id === 'debug-preset') {
            const hasPrefabEditorType = Object.values(w.editorTypes).includes('prefab');
            if (hasPrefabEditorType) {
              return createDebugPreset();
            }
            return w;
          }
          // B. Other workspaces: rename editorTypes value 'prefab' → 'workshop'
          const newEditorTypes: Record<string, string> = {};
          for (const [areaId, editorType] of Object.entries(w.editorTypes)) {
            newEditorTypes[areaId] = editorType === 'prefab' ? 'workshop' : editorType;
          }
          return { ...w, editorTypes: newEditorTypes };
        });
        // Migration: workshop → drop (R1: WorkshopPanel decommissioned; AreaShell falls back
        // to 'viewport' for missing editorType keys, so dropping is safe).
        const workshopDroppedWorkspaces = prefabToWorkspaceMigratedWorkspaces.map(w => {
          // A. Debug preset workspace: force-rebuild if editorTypes still references 'workshop'
          if (w.id === 'debug-preset') {
            const hasWorkshopEditorType = Object.values(w.editorTypes).includes('workshop');
            if (hasWorkshopEditorType) {
              return createDebugPreset();
            }
            return w;
          }
          // B. Other workspaces: drop editorTypes entries whose value is 'workshop'
          const newEditorTypes: Record<string, string> = {};
          for (const [areaId, editorType] of Object.entries(w.editorTypes)) {
            if (editorType !== 'workshop') {
              newEditorTypes[areaId] = editorType;
            }
          }
          return { ...w, editorTypes: newEditorTypes };
        });
        // Migration: drop orphan selectedAssetPaths key.
        // ProjectPanel switched from useAreaState to createSignal (transient selection),
        // leaving stale entries in panelStates that can't be reached or updated.
        const orphanKeyDroppedWorkspaces = workshopDroppedWorkspaces.map(w => {
          if (!w.panelStates) return w;
          const cleaned: Record<string, Record<string, Record<string, unknown>>> = {};
          for (const [areaId, perEditor] of Object.entries(w.panelStates)) {
            cleaned[areaId] = {};
            for (const [editorType, hooks] of Object.entries(perEditor)) {
              const next = { ...hooks };
              delete next.selectedAssetPaths;
              cleaned[areaId][editorType] = next;
            }
          }
          return { ...w, panelStates: cleaned };
        });
        // Migration: environment → drop (step2 wave2: EnvironmentPanel decommissioned;
        // env is now a selectable entry in Scene Tree + Properties).
        // Debug preset force-rebuild if editorTypes still references 'environment' value.
        // Other workspaces: drop entries whose value is 'environment' (AreaShell falls back
        // to 'viewport' for missing editorType keys, so dropping is safe).
        const envDroppedWorkspaces = orphanKeyDroppedWorkspaces.map(w => {
          if (w.id === 'debug-preset') {
            const hasEnvEditorType = Object.values(w.editorTypes).includes('environment');
            if (hasEnvEditorType) {
              return createDebugPreset();
            }
            return w;
          }
          const newEditorTypes: Record<string, string> = {};
          for (const [areaId, editorType] of Object.entries(w.editorTypes)) {
            if (editorType !== 'environment') {
              newEditorTypes[areaId] = editorType;
            }
          }
          return { ...w, editorTypes: newEditorTypes };
        });
        return { ...parsed, workspaces: envDroppedWorkspaces };
      }
    }
  } catch { /* fall through */ }

  // Migration from legacy key
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      // Dockview JSON 無法轉換為 AreaTree，直接 reset
      localStorage.removeItem(LEGACY_KEY);
      const store: WorkspaceStore = {
        version: 1,
        currentWorkspaceId: LAYOUT_PRESET_ID,
        workspaces: [createLayoutPreset(), createDebugPreset()],
      };
      saveStore(store);
      return store;
    }
  } catch { /* fall through */ }

  // Fresh install
  const fresh: WorkspaceStore = {
    version: 1,
    currentWorkspaceId: LAYOUT_PRESET_ID,
    workspaces: [createLayoutPreset(), createDebugPreset()],
  };
  saveStore(fresh);
  return fresh;
}

export function saveStore(store: WorkspaceStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch { /* quota exceeded — ignore */ }
}

export function setCurrent(s: WorkspaceStore, id: string): WorkspaceStore {
  return { ...s, currentWorkspaceId: id };
}

export function addWorkspace(s: WorkspaceStore, baseId?: string): WorkspaceStore {
  const base = s.workspaces.find(w => w.id === (baseId ?? s.currentWorkspaceId)) ?? s.workspaces[0];
  const names = s.workspaces.map(w => w.name);
  const newW: Workspace = {
    id: generateUUID(),
    name: nextDuplicateName(names, base.name),
    grid: JSON.parse(JSON.stringify(base.grid)),
    editorTypes: JSON.parse(JSON.stringify(base.editorTypes)),
    viewportState: JSON.parse(JSON.stringify(base.viewportState ?? {})),
    panelStates: JSON.parse(JSON.stringify(base.panelStates ?? {})),
  };
  return { ...s, currentWorkspaceId: newW.id, workspaces: [...s.workspaces, newW] };
}

export function deleteWorkspace(s: WorkspaceStore, id: string): WorkspaceStore {
  if (s.workspaces.length === 1) return s;
  const idx = s.workspaces.findIndex(w => w.id === id);
  if (idx === -1) return s;
  const next = s.workspaces.filter(w => w.id !== id);
  let nextCurrent = s.currentWorkspaceId;
  if (nextCurrent === id) {
    nextCurrent = (next[idx - 1] ?? next[idx])!.id;
  }
  return { ...s, currentWorkspaceId: nextCurrent, workspaces: next };
}

export function renameWorkspace(s: WorkspaceStore, id: string, name: string): WorkspaceStore {
  return { ...s, workspaces: s.workspaces.map(w => w.id === id ? { ...w, name } : w) };
}

export function duplicateWorkspace(s: WorkspaceStore, id: string): WorkspaceStore {
  const base = s.workspaces.find(w => w.id === id);
  if (!base) return s;
  const names = s.workspaces.map(w => w.name);
  const newW: Workspace = {
    id: generateUUID(),
    name: nextDuplicateName(names, base.name),
    grid: JSON.parse(JSON.stringify(base.grid)),
    editorTypes: JSON.parse(JSON.stringify(base.editorTypes)),
    viewportState: JSON.parse(JSON.stringify(base.viewportState ?? {})),
    panelStates: JSON.parse(JSON.stringify(base.panelStates ?? {})),
  };
  return { ...s, workspaces: [...s.workspaces, newW] }; // currentId 不變
}

export function reorderWorkspace(s: WorkspaceStore, fromIdx: number, toIdx: number): WorkspaceStore {
  const ws = [...s.workspaces];
  const [moved] = ws.splice(fromIdx, 1);
  ws.splice(toIdx, 0, moved);
  return { ...s, workspaces: ws };
}

export function updateCurrentWorkspace(
  s: WorkspaceStore,
  patch: Partial<Pick<Workspace, 'grid' | 'editorTypes'>>
): WorkspaceStore {
  return {
    ...s,
    workspaces: s.workspaces.map(w => w.id === s.currentWorkspaceId ? { ...w, ...patch } : w),
  };
}

export function resetWorkspaceToPreset(s: WorkspaceStore, id: string): WorkspaceStore {
  if (!isPresetId(id)) return s;
  const preset = id === LAYOUT_PRESET_ID ? createLayoutPreset() : createDebugPreset();
  return {
    ...s,
    workspaces: s.workspaces.map(w => w.id === id ? { ...preset, name: w.name } : w),
  };
}

// ── Signal wrapper ─────────────────────────────────────────────────────
const [store, setStore] = createSignal<WorkspaceStore>(loadStore());
export { store };

export function mutate(fn: (s: WorkspaceStore) => WorkspaceStore): void {
  const next = fn(store());
  setStore(next);
  saveStore(next);
}

export function currentWorkspace(): Workspace {
  const s = store();
  return s.workspaces.find(w => w.id === s.currentWorkspaceId) ?? s.workspaces[0];
}

/** Remove persisted workspace data so next reload starts fresh (Reset Layout button). */
export function clearSavedLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  // also clear old pre-workspaceStore keys
  localStorage.removeItem('erythos-layout-v1');
  localStorage.removeItem('erythos-layout-v2');
}
