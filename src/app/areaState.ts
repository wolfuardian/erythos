import { createSignal, type Accessor, type Setter } from 'solid-js';
import { useArea } from './AreaContext';
import { currentWorkspace, mutate } from './workspaceStore';

/**
 * Area-level persistent signal。切走 Editor 再切回，值從 workspace.panelStates 恢復。
 *
 * @param key  同一 panel 內多個 useAreaState 的識別字串（防互污）
 * @param initial  沒有儲存值時的初始值
 */
export function useAreaState<T>(key: string, initial: T): [Accessor<T>, Setter<T>] {
  const area = useArea();
  // 在 hook 啟動時鎖入 closure，避免 onCleanup 時讀到已切走的值（#588 教訓）
  const areaId = area?.id ?? '';
  const editorType = area?.editorType ?? '';
  const workspaceId = currentWorkspace().id;

  // 讀取已儲存的值（如果有），否則使用 initial
  const savedValue = (() => {
    if (!areaId || !editorType) return initial;
    const ws = currentWorkspace();
    const stored = ws.panelStates?.[areaId]?.[editorType]?.[key];
    return stored !== undefined ? (stored as T) : initial;
  })();

  const [areaState, setAreaState] = createSignal<T>(savedValue);

  // 包裝 setter，每次寫值同時持久化到 workspace.panelStates
  const persistedSetter: Setter<T> = ((valOrFn: T | ((prev: T) => T)) => {
    const next =
      typeof valOrFn === 'function'
        ? (valOrFn as (prev: T) => T)(areaState())
        : valOrFn;
    setAreaState(() => next as T);
    if (!areaId || !editorType) return next;
    mutate(s => ({
      ...s,
      workspaces: s.workspaces.map(w =>
        w.id === workspaceId
          ? {
              ...w,
              panelStates: {
                ...(w.panelStates ?? {}),
                [areaId]: {
                  ...((w.panelStates ?? {})[areaId] ?? {}),
                  [editorType]: {
                    ...(((w.panelStates ?? {})[areaId] ?? {})[editorType] ?? {}),
                    [key]: next,
                  },
                },
              },
            }
          : w
      ),
    }));
    return next;
  }) as Setter<T>;

  return [areaState, persistedSetter];
}
