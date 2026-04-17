import { createSignal, createResource, onMount, onCleanup, Show, For, type Component } from 'solid-js';
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
  const [closing, setClosing] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [parentHandle, setParentHandle] = createSignal<FileSystemDirectoryHandle | null>(null);

  // ── Duplicate folder check ──
  // 用 createResource 自動處理 race condition（舊的 async 結果被 SolidJS 丟棄）
  // 回傳值：true = 有衝突，false = 無衝突，undefined = 正在檢查中
  // 決策說明：
  //   - case-insensitive 比對（符合 OS 可觀察行為，Windows 下 Demo 與 demo 視同衝突）
  //   - 只檢查 kind === 'directory'（根據 issue 錯誤文案 "folder named..."）
  //   - permission error / AbortError 等例外一律視為無衝突（fallback false），不崩潰
  const [nameConflict] = createResource(
    () => ({ n: newName().trim(), p: parentHandle() }),
    async ({ n, p }: { n: string; p: FileSystemDirectoryHandle | null }): Promise<boolean> => {
      if (!n || !p) return false;
      try {
        for await (const [, handle] of (p as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
          if (
            handle.kind === 'directory' &&
            handle.name.toLowerCase() === n.toLowerCase()
          ) {
            return true;
          }
        }
        return false;
      } catch {
        return false; // permission error / AbortError — fallback to no conflict
      }
    },
  );

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
      closeOverlay();
    } catch (e: any) {
      setErrorTitle('Create Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const closeOverlay = () => {
    setClosing(true);
    setTimeout(() => {
      setShowCreate(false);
      setClosing(false);
      setNewName('');
      setParentHandle(null);
    }, 200);
  };

  const handleCancelCreate = () => {
    closeOverlay();
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
          {/* Hub header — 永遠顯示 */}
          <div style={{
            padding: '6px 10px',
            'border-bottom': '1px solid var(--border-subtle)',
            display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
            height: '30px', 'box-sizing': 'border-box',
          }}>
            <span style={{
              color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)',
              'text-transform': 'uppercase', 'letter-spacing': '0.5px',
            }}>Projects</span>
            <Show when={!showCreate()}>
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
            </Show>
          </div>

          {/* Content area — relative 容器，overlay 以此為基準 */}
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
            {/* 專案清單（永遠渲染） */}
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

            {/* ── Create overlay ── */}
            <Show when={showCreate()}>
              <div style={{
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                background: 'rgba(20,20,20,0.95)',
                'z-index': '10',
                display: 'flex',
                'flex-direction': 'column',
                overflow: 'auto',
                animation: closing()
                  ? 'overlaySlideOut 200ms ease forwards'
                  : 'overlaySlideIn 200ms ease forwards',
              }}>
                {/* Overlay header */}
                <div style={{
                  padding: '8px 10px',
                  'border-bottom': '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', 'align-items': 'center', gap: '6px',
                  'flex-shrink': '0',
                  height: '30px', 'box-sizing': 'border-box',
                }}>
                  <button
                    onClick={handleCancelCreate}
                    title="Back"
                    aria-label="Back"
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)',
                      cursor: 'pointer', 'font-size': '14px', padding: '0 2px',
                    }}
                  >{'\u2190'}</button>
                  <span style={{
                    color: 'var(--text-primary, #fff)', 'font-size': 'var(--font-size-sm)',
                    'font-weight': '600',
                  }}>New Project</span>
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
                        border: nameConflict() === true
                          ? '1px solid var(--accent-red)'
                          : '1px solid rgba(255,255,255,0.15)',
                        'border-radius': 'var(--radius-sm)',
                        color: 'var(--text-primary, #fff)',
                        'font-size': 'var(--font-size-sm)',
                        'box-sizing': 'border-box',
                      }}
                    />
                    <Show when={nameConflict() === true}>
                      <div style={{
                        'margin-top': '4px',
                        'font-size': 'var(--font-size-xs)',
                        color: 'var(--accent-red)',
                      }}>
                        A folder named '{newName().trim()}' already exists in this location
                      </div>
                    </Show>
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
                  {/* Preview */}
                  <div>
                    <div style={{ 'font-size': 'var(--font-size-xs)', color: 'var(--text-muted)', 'margin-bottom': '4px' }}>
                      Preview
                    </div>
                    {/* Path preview */}
                    <div style={{
                      padding: '8px',
                      background: 'rgba(0,0,0,0.2)',
                      'border-radius': 'var(--radius-sm)',
                      'font-family': 'monospace',
                      'font-size': '10px',
                      color: 'var(--text-muted)',
                      'line-height': '1.6',
                      'white-space': 'pre',
                    }}>
                      {(newName().trim() && parentHandle())
                        ? `${parentHandle()!.name}/${newName().trim()}/\n├── scenes/\n├── models/\n└── textures/`
                        : null}
                    </div>
                  </div>
                  {/* Create button */}
                  <button
                    onClick={() => void handleCreate()}
                    disabled={!newName().trim() || !parentHandle() || nameConflict() === true}
                    style={{
                      width: '100%', padding: '6px',
                      background: (!newName().trim() || !parentHandle() || nameConflict() === true) ? 'rgba(255,255,255,0.05)' : 'var(--accent-blue)',
                      color: (!newName().trim() || !parentHandle() || nameConflict() === true) ? 'var(--text-muted)' : '#fff',
                      border: 'none', 'border-radius': 'var(--radius-sm)',
                      cursor: (!newName().trim() || !parentHandle() || nameConflict() === true) ? 'default' : 'pointer',
                      'font-size': 'var(--font-size-sm)', 'font-weight': 'bold',
                    }}
                  >+ Create Project</button>
                </div>
              </div>
            </Show>
          </div>
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
