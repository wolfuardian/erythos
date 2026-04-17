import { createSignal, createResource, onMount, onCleanup, Show, For, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';
import { ErrorDialog } from '../../../components/ErrorDialog';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import type { ProjectEntry } from '../../../core/project/ProjectHandleStore';
import type { ProjectFile } from '../../../core/project/ProjectFile';
import { loadGLTFFromFile } from '../../../utils/gltfLoader';

// ── Type meta ──
const TYPE_META: Record<ProjectFile['type'], { pill: string; label: string; color: string }> = {
  scene:   { pill: 'SCN', label: 'Scene',   color: 'var(--accent-green)'  },
  glb:     { pill: 'GLB', label: 'Model',   color: 'var(--accent-blue)'   },
  texture: { pill: 'TEX', label: 'Texture', color: 'var(--accent-yellow)' },
  hdr:     { pill: 'HDR', label: 'HDRI',    color: 'var(--accent-orange)' },
  leaf:    { pill: 'LEA', label: 'Leaf',    color: 'var(--accent-purple)' },
  other:   { pill: 'OTH', label: 'Other',   color: 'var(--text-muted)'    },
};

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
  const [showCloseConfirm, setShowCloseConfirm] = createSignal(false);

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

  // ── Browser: Assets/ ──
  const assetFiles = () => bridge.projectFiles();

  const ALL_TYPES: ProjectFile['type'][] = ['scene', 'glb', 'texture', 'hdr', 'leaf', 'other'];
  const [activeFilters, setActiveFilters] = createSignal<Set<ProjectFile['type']>>(
    new Set(ALL_TYPES),
  );

  const toggleFilter = (t: ProjectFile['type']) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) { next.delete(t); } else { next.add(t); }
      return next;
    });
  };

  const displayedAssets = () => assetFiles().filter((f) => activeFilters().has(f.type));
  const hiddenCount = () => assetFiles().length - displayedAssets().length;

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
            <button onClick={() => setShowCloseConfirm(true)} style={{
              background: 'var(--bg-section)', color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              padding: '2px 6px', 'border-radius': 'var(--radius-sm)',
              'font-size': 'var(--font-size-xs)', cursor: 'pointer',
            }}>Close project</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* ── Assets/ section header ── */}
            <div style={{
              padding: '6px 10px',
              color: 'var(--text-muted)',
              'font-size': 'var(--font-size-xs)',
              'text-transform': 'uppercase',
              'letter-spacing': '0.5px',
              'border-bottom': '1px solid var(--border-subtle)',
            }}>
              Assets
            </div>

            {/* ── Filter bar ── */}
            <div style={{
              display: 'flex', gap: '4px', padding: '6px 10px',
              'border-bottom': '1px solid var(--border-subtle)',
              'flex-wrap': 'wrap',
            }}>
              <For each={ALL_TYPES}>
                {(t) => {
                  const meta = TYPE_META[t];
                  return (
                    <button
                      aria-label={meta.label}
                      title={meta.label}
                      onClick={() => toggleFilter(t)}
                      style={{
                        display: 'flex', 'align-items': 'center', gap: '4px',
                        padding: '2px 6px',
                        background: activeFilters().has(t) ? 'var(--bg-section)' : 'transparent',
                        border: '1px solid',
                        'border-color': activeFilters().has(t) ? 'var(--border-subtle)' : 'transparent',
                        'border-radius': 'var(--radius-sm)',
                        cursor: 'pointer',
                        opacity: activeFilters().has(t) ? '1' : '0.4',
                      }}
                    >
                      <span style={{
                        width: '8px', height: '8px', 'border-radius': '50%',
                        background: activeFilters().has(t) ? meta.color : 'var(--text-muted)',
                        display: 'inline-block', 'flex-shrink': '0',
                      }} />
                      <span style={{
                        'font-size': 'var(--font-size-xs)',
                        color: 'var(--text-muted)',
                      }}>{meta.label}</span>
                    </button>
                  );
                }}
              </For>
            </div>

            {/* ── Asset list ── */}
            <For each={displayedAssets()}>
              {(f) => {
                const meta = TYPE_META[f.type];
                return (
                  <div
                    onClick={
                      f.type === 'scene' ? () => void handleLoadScene(f.path) :
                      f.type === 'glb' ? () => void handleImportModel(f.path) :
                      undefined
                    }
                    style={{
                      display: 'flex', 'align-items': 'center', gap: '6px',
                      padding: '5px 10px',
                      cursor: (f.type === 'scene' || f.type === 'glb') ? 'pointer' : 'default',
                    }}
                  >
                    {/* Type pill */}
                    <span style={{
                      width: '16px', height: '20px', 'border-radius': '3px',
                      background: meta.color + '33',
                      color: meta.color,
                      'font-size': '8px', 'font-weight': 'bold',
                      display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                      'flex-shrink': '0',
                      'line-height': '1',
                    }}>{meta.pill}</span>
                    {/* Filename */}
                    <span style={{
                      'font-size': 'var(--font-size-sm)', color: 'var(--text-secondary)',
                      overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', flex: 1,
                    }}>{f.name}</span>
                  </div>
                );
              }}
            </For>

            {/* ── Hidden hint ── */}
            <Show when={hiddenCount() > 0}>
              <div style={{
                padding: '4px 10px',
                'font-size': 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                'border-top': '1px solid var(--border-subtle)',
              }}>
                {hiddenCount()} items hidden
              </div>
            </Show>

            {/* ── Empty state ── */}
            <Show when={assetFiles().length === 0}>
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
      <ConfirmDialog
        open={showCloseConfirm()}
        title="Close this project?"
        message="Unsaved changes will be lost."
        confirmLabel="Close project"
        cancelLabel="Back"
        onConfirm={() => { handleClose(); setShowCloseConfirm(false); }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
};

export default ProjectPanel;
