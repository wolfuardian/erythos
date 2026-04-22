import { createSignal } from 'solid-js';
import { generateUUID } from '../utils/uuid';
import { createLayoutPresetTree, createDebugPresetTree, validateTree } from './areaTree';

export interface Workspace {
  id: string;
  name: string;
  grid: unknown;                       // Dockview toJSON()
  editorTypes: Record<string, string>; // panelId → editorType
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
  };
}
export function createDebugPreset(): Workspace {
  return {
    id: DEBUG_PRESET_ID,
    name: 'Debug',
    grid: createDebugPresetTree(),
    editorTypes: {
      'viewport': 'viewport',
      'environment': 'environment',
      'leaf': 'leaf',
    },
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
        return { ...parsed, workspaces: sanitizedWorkspaces };
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
