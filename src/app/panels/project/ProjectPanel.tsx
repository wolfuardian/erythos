import { createSignal, onMount, onCleanup, Show, For, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';
import { ErrorDialog } from '../../../components/ErrorDialog';
import type { ProjectEntry } from '../../../core/project/ProjectHandleStore';
import type { ProjectFile } from '../../../core/project/ProjectFile';
import { loadGLTFFromFile } from '../../../utils/gltfLoader';

const ProjectPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [errorMsg, setErrorMsg] = createSignal('');
  const [errorTitle, setErrorTitle] = createSignal('');
  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [parentHandle, setParentHandle] = createSignal<FileSystemDirectoryHandle | null>(null);

  const refreshRecent = async () => {
    setRecentProjects(await editor.projectManager.getRecentProjects());
  };

  onMount(() => {
    void refreshRecent();
    const unsub = editor.projectManager.onChange(() => void refreshRecent());
    onCleanup(unsub);
  });

  // ── Hub actions ──

  const handleAdd = async () => {
    try {
      await editor.projectManager.addFromDisk();
      await refreshRecent();
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setErrorTitle('Add Failed');
        setErrorMsg(e.message || String(e));
      }
    }
  };

  const handlePickLocation = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setParentHandle(handle);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setErrorTitle('Select Location Failed');
        setErrorMsg(e.message || String(e));
      }
    }
  };

  const handleCreate = async () => {
    const parent = parentHandle();
    const name = newName().trim();
    if (!parent || !name) return;
    try {
      await editor.projectManager.createProject(name, parent);
      setShowCreate(false);
      setNewName('');
      setParentHandle(null);
    } catch (e: any) {
      setErrorTitle('Create Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleCancelCreate = () => {
    setShowCreate(false);
    setNewName('');
    setParentHandle(null);
  };

  const handleOpenRecent = async (id: string) => {
    try {
      const ok = await editor.projectManager.openRecent(id);
      if (!ok) {
        setErrorTitle('Permission Required');
        setErrorMsg('Could not access the project directory. Click again to grant permission.');
      }
    } catch (e: any) {
      setErrorTitle('Open Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleRemove = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    await editor.projectManager.removeRecent(id);
    await refreshRecent();
  };

  const handleClose = () => editor.projectManager.close();

  // ── Browser: categorize files ──

  const sceneFiles = () => bridge.projectFiles().filter(
    (f: ProjectFile) => f.path.startsWith('scenes/') && f.type === 'scene',
  );
  const modelFiles = () => bridge.projectFiles().filter(
    (f: ProjectFile) => f.path.startsWith('models/') && f.type === 'glb',
  );
  const textureFiles = () => bridge.projectFiles().filter(
    (f: ProjectFile) => f.path.startsWith('textures/') && f.type === 'hdr',
  );

  const handleLoadScene = async (path: string) => {
    try {
      const file = await editor.projectManager.readFile(path);
      const parsed = JSON.parse(await file.text());
      editor.loadScene(parsed);
    } catch (e: any) {
      setErrorTitle('Load Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleImportModel = async (path: string) => {
    try {
      const file = await editor.projectManager.readFile(path);
      await loadGLTFFromFile(file, editor);
    } catch (e: any) {
      setErrorTitle('Import Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', 'flex-direction': 'column', overflow: 'hidden',
    }}>
      <Show when={bridge.projectOpen()} fallback={
        /* ── Hub mode ── */
        <>
          <Show when={showCreate()} fallback={
            /* ── Hub: project list ── */
            <>
              <div style={{
                padding: '6px 10px',
                'border-bottom': '1px solid var(--border-subtle)',
                display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
              }}>
                <span style={{
                  color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)',
                  'text-transform': 'uppercase', 'letter-spacing': '0.5px',
                }}>Projects</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => setShowCreate(true)} style={{
                    background: 'var(--accent-blue)', color: '#fff', border: 'none',
                    padding: '2px 8px', 'border-radius': 'var(--radius-sm)',
                    'font-size': 'var(--font-size-xs)', cursor: 'pointer',
                  }}>New</button>
                  <button onClick={() => void handleAdd()} style={{
                    background: 'var(--bg-section)', color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    padding: '2px 8px', 'border-radius': 'var(--radius-sm)',
                    'font-size': 'var(--font-size-xs)', cursor: 'pointer',
                  }}>Add</button>
                </div>
              </div>
              <div style={{ overflow: 'auto', padding: '4px 0' }}>
                <Show when={recentProjects().length > 0} fallback={
                  <div style={{
                    padding: '16px 12px', color: 'var(--text-muted)',
                    'font-size': 'var(--font-size-xs)', 'text-align': 'center', 'line-height': '1.6',
                  }}>
                    No recent projects.<br />
                    Click New to create or<br />Add to open a project.
                  </div>
                }>
                  <For each={recentProjects()}>
                    {(entry) => (
                      <div
                        onClick={() => void handleOpenRecent(entry.id)}
                        style={{
                          display: 'flex', 'align-items': 'center', gap: '8px',
                          padding: '6px 10px', cursor: 'pointer',
                        }}
                      >
                        <span style={{
                          width: '16px', height: '16px', 'border-radius': 'var(--radius-sm)',
                          background: 'var(--badge-mesh, #4a6fa5)', color: 'var(--text-inverse)',
                          'font-size': '9px', 'font-weight': 'bold',
                          display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                          'flex-shrink': '0',
                        }}>P</span>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{
                            'font-size': 'var(--font-size-sm)', color: 'var(--text-secondary)',
                            overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                          }}>{entry.name}</div>
                          <div style={{ 'font-size': '10px', color: 'var(--text-muted)' }}>
                            {formatDate(entry.lastOpened)}
                          </div>
                        </div>
                        {/* Status indicator */}
                        {entry.status?.hasErrorLog && (
                          <span title="Has error log" style={{
                            width: '6px', height: '6px', 'border-radius': '50%',
                            background: '#e55', 'flex-shrink': '0',
                          }} />
                        )}
                        {!entry.status?.hasStructure && !entry.status?.hasErrorLog && (
                          <span style={{ 'font-size': '9px', color: 'var(--text-muted)' }}>empty</span>
                        )}
                        <button
                          onClick={(e: MouseEvent) => void handleRemove(entry.id, e)}
                          title="Remove from list"
                          style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', padding: '2px 4px', 'font-size': '12px',
                          }}
                        >{'\u00D7'}</button>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </>
          }>
            {/* ── Hub: Create form ── */}
            <>
              {/* Header */}
              <div style={{
                padding: '6px 10px',
                'border-bottom': '1px solid var(--border-subtle)',
                display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
              }}>
                <span style={{
                  color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)',
                  'text-transform': 'uppercase', 'letter-spacing': '0.5px',
                }}>New Project</span>
                <button onClick={handleCancelCreate} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', 'font-size': '12px',
                }}>{'\u00D7'}</button>
              </div>
              {/* Form */}
              <div style={{ padding: '12px 10px', display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
                {/* Project name */}
                <div>
                  <div style={{ 'font-size': 'var(--font-size-xs)', color: 'var(--text-muted)', 'margin-bottom': '4px' }}>
                    Project name
                  </div>
                  <input
                    type="text"
                    value={newName()}
                    onInput={(e) => setNewName(e.target.value)}
                    placeholder="My project"
                    style={{
                      width: '100%', padding: '4px 8px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      'border-radius': 'var(--radius-sm)',
                      color: 'var(--text-primary, #fff)',
                      'font-size': 'var(--font-size-sm)',
                      'box-sizing': 'border-box',
                    }}
                  />
                </div>
                {/* Location */}
                <div>
                  <div style={{ 'font-size': 'var(--font-size-xs)', color: 'var(--text-muted)', 'margin-bottom': '4px' }}>
                    Location
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <div style={{
                      flex: 1, padding: '4px 8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      'border-radius': 'var(--radius-sm)',
                      color: parentHandle() ? 'var(--text-secondary)' : 'var(--text-muted)',
                      'font-size': 'var(--font-size-sm)',
                      overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                    }}>
                      {parentHandle()?.name ?? 'Select location...'}
                    </div>
                    <button onClick={() => void handlePickLocation()} title="Browse" style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      'border-radius': 'var(--radius-sm)',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                      padding: '4px 8px', 'font-size': 'var(--font-size-sm)',
                    }}>{'\uD83D\uDCC2'}</button>
                  </div>
                </div>
                {/* Create button */}
                <button
                  onClick={() => void handleCreate()}
                  disabled={!newName().trim() || !parentHandle()}
                  style={{
                    width: '100%', padding: '6px',
                    background: (!newName().trim() || !parentHandle()) ? 'rgba(255,255,255,0.05)' : 'var(--accent-blue)',
                    color: (!newName().trim() || !parentHandle()) ? 'var(--text-muted)' : '#fff',
                    border: 'none', 'border-radius': 'var(--radius-sm)',
                    cursor: (!newName().trim() || !parentHandle()) ? 'default' : 'pointer',
                    'font-size': 'var(--font-size-sm)', 'font-weight': 'bold',
                  }}
                >+ Create Project</button>
              </div>
            </>
          </Show>
          {/* Imported Models (GlbStore) — draggable to viewport, always visible in Hub */}
          <Show when={bridge.glbKeys().length > 0}>
            <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{
                padding: '6px 10px', color: 'var(--text-muted)',
                'font-size': 'var(--font-size-xs)', 'text-transform': 'uppercase', 'letter-spacing': '0.5px',
              }}>
                Imported ({bridge.glbKeys().length})
              </div>
              <For each={bridge.glbKeys()}>
                {(filename) => (
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer!.setData('application/erythos-glb', filename);
                      e.dataTransfer!.effectAllowed = 'copy';
                    }}
                    style={{
                      display: 'flex', 'align-items': 'center', gap: '6px',
                      padding: '5px 10px', cursor: 'grab',
                    }}
                  >
                    <span style={{
                      width: '16px', height: '16px', 'border-radius': 'var(--radius-sm)',
                      background: 'var(--badge-mesh, #4a6fa5)', color: 'var(--text-inverse)',
                      'font-size': '9px', 'font-weight': 'bold',
                      display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                      'flex-shrink': '0',
                    }}>G</span>
                    <span style={{
                      'font-size': 'var(--font-size-sm)', color: 'var(--text-secondary)',
                      overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', flex: 1,
                    }}>{filename}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </>
      }>
        {/* ── Browser mode ── */}
        <>
          <div style={{
            padding: '6px 10px',
            'border-bottom': '1px solid var(--border-subtle)',
            display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
          }}>
            <span style={{
              color: 'var(--text-secondary)', 'font-size': 'var(--font-size-sm)',
              'font-weight': 'bold', overflow: 'hidden', 'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
            }}>{bridge.projectName()}</span>
            <button onClick={handleClose} style={{
              background: 'var(--bg-section)', color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              padding: '2px 6px', 'border-radius': 'var(--radius-sm)',
              'font-size': 'var(--font-size-xs)', cursor: 'pointer',
            }}>Close</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <FileSection title="Scenes" files={sceneFiles()} badge="S" badgeColor="#5a8a5a"
              onClick={(path: string) => void handleLoadScene(path)} />
            <FileSection title="Models" files={modelFiles()} badge="M" badgeColor="#4a6fa5"
              onClick={(path: string) => void handleImportModel(path)} />
            <FileSection title="Textures" files={textureFiles()} badge="T" badgeColor="#8a6a4a" />
            {/* Imported Models (GlbStore) — draggable to viewport */}
            <Show when={bridge.glbKeys().length > 0}>
              <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{
                  padding: '6px 10px', color: 'var(--text-muted)',
                  'font-size': 'var(--font-size-xs)', 'text-transform': 'uppercase', 'letter-spacing': '0.5px',
                }}>
                  Imported ({bridge.glbKeys().length})
                </div>
                <For each={bridge.glbKeys()}>
                  {(filename) => (
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer!.setData('application/erythos-glb', filename);
                        e.dataTransfer!.effectAllowed = 'copy';
                      }}
                      style={{
                        display: 'flex', 'align-items': 'center', gap: '6px',
                        padding: '5px 10px', cursor: 'grab',
                      }}
                    >
                      <span style={{
                        width: '16px', height: '16px', 'border-radius': 'var(--radius-sm)',
                        background: 'var(--badge-mesh, #4a6fa5)', color: 'var(--text-inverse)',
                        'font-size': '9px', 'font-weight': 'bold',
                        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                        'flex-shrink': '0',
                      }}>G</span>
                      <span style={{
                        'font-size': 'var(--font-size-sm)', color: 'var(--text-secondary)',
                        overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', flex: 1,
                      }}>{filename}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={sceneFiles().length === 0 && modelFiles().length === 0 && textureFiles().length === 0 && bridge.glbKeys().length === 0}>
              <div style={{
                padding: '16px 12px', color: 'var(--text-muted)',
                'font-size': 'var(--font-size-xs)', 'text-align': 'center', 'line-height': '1.6',
              }}>
                No assets found.<br />
                Place files in scenes/, models/,<br />or textures/ folders.
              </div>
            </Show>
          </div>
        </>
      </Show>
      <ErrorDialog open={!!errorMsg()} title={errorTitle()} message={errorMsg()} onClose={() => setErrorMsg('')} />
    </div>
  );
};

export default ProjectPanel;

/* ── Sub-component ── */

const FileSection: Component<{
  title: string;
  files: ProjectFile[];
  badge: string;
  badgeColor: string;
  onClick?: (path: string) => void;
}> = (props) => (
  <Show when={props.files.length > 0}>
    <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{
        padding: '6px 10px', color: 'var(--text-muted)',
        'font-size': 'var(--font-size-xs)', 'text-transform': 'uppercase', 'letter-spacing': '0.5px',
      }}>
        {props.title} ({props.files.length})
      </div>
      <For each={props.files}>
        {(f) => (
          <div
            onClick={() => props.onClick?.(f.path)}
            style={{
              display: 'flex', 'align-items': 'center', gap: '6px',
              padding: '5px 10px', cursor: props.onClick ? 'pointer' : 'default',
            }}
          >
            <span style={{
              width: '16px', height: '16px', 'border-radius': 'var(--radius-sm)',
              background: props.badgeColor, color: 'var(--text-inverse)',
              'font-size': '9px', 'font-weight': 'bold',
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              'flex-shrink': '0',
            }}>{props.badge}</span>
            <span style={{
              'font-size': 'var(--font-size-sm)', color: 'var(--text-secondary)',
              overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', flex: 1,
            }}>{f.name}</span>
          </div>
        )}
      </For>
    </div>
  </Show>
);
