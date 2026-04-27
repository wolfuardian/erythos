import { type Component, createSignal, onMount, Show, For } from 'solid-js';
import { ProjectManager } from '../core/project/ProjectManager';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';

interface Props {
  projectManager: ProjectManager;
  onOpenProject: (handle: FileSystemDirectoryHandle) => Promise<void>;
}

export const Welcome: Component<Props> = (props) => {
  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [parentHandle, setParentHandle] = createSignal<FileSystemDirectoryHandle | null>(null);
  const [errorMsg, setErrorMsg] = createSignal('');

  const refresh = async () => setRecentProjects(await props.projectManager.getRecentProjects());

  onMount(() => {
    void refresh();
    const unsub = props.projectManager.onChange(() => void refresh());
    return unsub;
  });

  // 地雷 1 已修：openRecent 改回傳 handle，不在內部 collectFiles
  const handleOpenRecent = async (id: string) => {
    const handle = await props.projectManager.openRecent(id);
    if (!handle) { setErrorMsg('Failed to open project (permission?)'); return; }
    await props.onOpenProject(handle);
  };

  const handleAdd = async () => {
    try {
      await props.projectManager.addFromDisk();
      await refresh();
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || String(e));
    }
  };

  const handlePickLocation = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setParentHandle(handle);
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || String(e));
    }
  };

  const handleCreate = async () => {
    const parent = parentHandle();
    if (!parent || !newName().trim()) return;
    try {
      await props.projectManager.createProject(newName().trim(), parent);
      await refresh();
      const list = await props.projectManager.getRecentProjects();
      const fresh = list.find(e => e.name === newName().trim());
      if (fresh?.handle) await props.onOpenProject(fresh.handle);
      setShowCreate(false);
      setNewName('');
      setParentHandle(null);
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', 'align-items': 'center', 'justify-content': 'center',
      background: 'var(--bg-app)',
    }}>
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        'border-radius': 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        'min-width': '360px',
      }}>
        <h2 style={{ color: 'var(--text-primary)', 'margin-bottom': 'var(--space-md)' }}>Erythos</h2>
        <Show when={!showCreate()} fallback={
          <div>
            <div style={{ 'margin-bottom': 'var(--space-sm)' }}>
              <input
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
                placeholder="Project name"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ 'margin-bottom': 'var(--space-sm)' }}>
              <button onClick={() => void handlePickLocation()}>
                {parentHandle() ? parentHandle()!.name : 'Pick location…'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button onClick={() => void handleCreate()} disabled={!parentHandle() || !newName().trim()}>
                Create
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(''); setParentHandle(null); }}>
                Cancel
              </button>
            </div>
          </div>
        }>
          <For each={recentProjects()} fallback={
            <div style={{ color: 'var(--text-muted)', 'margin-bottom': 'var(--space-md)' }}>
              No recent projects
            </div>
          }>
            {(entry) => (
              <div
                style={{ cursor: 'pointer', padding: 'var(--space-xs) 0', color: 'var(--text-primary)' }}
                onClick={() => void handleOpenRecent(entry.id)}
              >
                {entry.name}
              </div>
            )}
          </For>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', 'margin-top': 'var(--space-md)' }}>
            <button onClick={() => setShowCreate(true)}>+ New Project</button>
            <button onClick={() => void handleAdd()}>Open Folder…</button>
          </div>
        </Show>
        <Show when={errorMsg()}>
          <div style={{ color: 'var(--accent-red)', 'margin-top': 'var(--space-sm)' }}>{errorMsg()}</div>
        </Show>
      </div>
    </div>
  );
};
