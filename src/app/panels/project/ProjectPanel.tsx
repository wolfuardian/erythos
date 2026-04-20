import { createSignal, createResource, onMount, onCleanup, Show, For, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';
import { ErrorDialog } from '../../../components/ErrorDialog';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { PanelHeader } from '../../../components/PanelHeader';
import type { ProjectEntry } from '../../../core/project/ProjectHandleStore';
import type { ProjectFile } from '../../../core/project/ProjectFile';

// ── Type meta ──
const TYPE_META: Record<ProjectFile['type'], { pill: string; label: string; color: string }> = {
  scene:   { pill: 'SCN', label: 'Scene',   color: 'var(--accent-green)'  },
  glb:     { pill: 'GLB', label: 'Model',   color: 'var(--accent-blue)'   },
  texture: { pill: 'TEX', label: 'Texture', color: 'var(--accent-yellow)' },
  hdr:     { pill: 'HDR', label: 'HDRI',    color: 'var(--accent-orange)' },
  leaf:    { pill: 'LEA', label: 'Leaf',    color: 'var(--accent-purple)' },
  other:   { pill: 'OTH', label: 'Other',   color: 'var(--text-muted)'    },
};

const filterIcon = (t: ProjectFile['type']) => {
  // viewBox 0 0 16 16, fill:none, stroke-linecap:round, stroke-linejoin:round
  switch (t) {
    case 'scene':   return <><path d="M8 3L3 6v5l5 3 5-3V6L8 3z"/><line x1="8" y1="3" x2="8" y2="14"/><line x1="3" y1="6" x2="13" y2="6"/></>;
    case 'glb':     return <><path d="M8 2l5 3v5l-5 3-5-3V5z"/><line x1="8" y1="2" x2="8" y2="10"/><line x1="3" y1="5" x2="13" y2="10"/></>;
    case 'texture': return <><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="2" y="2" width="6" height="6"/><rect x="8" y="8" width="6" height="6"/></>;
    case 'hdr':     return <><circle cx="8" cy="8" r="5"/><line x1="3" y1="8" x2="13" y2="8"/><path d="M5.5 5a5 5 0 0 0 0 6"/><path d="M10.5 5a5 5 0 0 1 0 6"/></>;
    case 'leaf':    return <><path d="M4 13c0 0 1-7 7-9"/><path d="M4 13c3-1 8-4 7-9"/><line x1="4" y1="13" x2="8" y2="9"/></>;
    case 'other':   return <><rect x="3" y="2" width="8" height="11" rx="1"/><line x1="3" y1="7" x2="11" y2="7"/><text x="7" y="12" text-anchor="middle" font-size="5" stroke="none" fill="currentColor">?</text></>;
  }
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
  const [selectedAssetPath, setSelectedAssetPath] = createSignal<string | null>(null);

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

  const [hoveredFilter, setHoveredFilter] = createSignal<ProjectFile['type'] | null>(null);
  const [isDragOver, setIsDragOver] = createSignal(false);

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

  const handleSelectAsset = (path: string) => {
    setSelectedAssetPath(path === selectedAssetPath() ? null : path);
  };

  const handleAssetsDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    const errors: string[] = [];
    for (const file of files) {
      try {
        await editor.projectManager.importAsset(file);
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message ?? String(err)}`);
      }
    }
    if (errors.length > 0) {
      setErrorTitle('Import Failed');
      setErrorMsg(errors.join('\n'));
    }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', 'flex-direction': 'column', overflow: 'hidden',
      background: 'var(--bg-panel)',
      'box-shadow': 'var(--shadow-well-outer)',
      'border-radius': 'var(--radius-lg)',
    }}>
      <Show when={bridge.projectOpen()} fallback={
        /* ── Hub mode ── */
        <>
          {/* Hub header — 永遠顯示 */}
          <PanelHeader
            title="Projects"
            actions={
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
            }
          />

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
                background: 'var(--bg-app)',
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
                        ? `${parentHandle()!.name}/${newName().trim()}/\n├── scenes/\n├── models/\n├── textures/\n├── hdris/\n├── leaves/\n└── other/`
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
          <PanelHeader
            title={bridge.projectName() ?? 'Project'}
            actions={
              <button onClick={() => setShowCloseConfirm(true)} style={{
                background: 'var(--bg-section)', color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                padding: '2px 6px', 'border-radius': 'var(--radius-sm)',
                'font-size': 'var(--font-size-xs)', cursor: 'pointer',
              }}>Close project</button>
            }
          />
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => {
              if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) {
                setIsDragOver(false);
              }
            }}
            onDrop={(e) => void handleAssetsDrop(e)}
            style={{
              flex: 1, overflow: 'auto',
              border: isDragOver() ? '2px dashed var(--accent-blue)' : '2px solid transparent',
              background: isDragOver() ? 'rgba(70,130,220,0.08)' : undefined,
              'box-sizing': 'border-box',
              transition: 'border-color 100ms, background 100ms',
            }}
          >
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
                      onMouseEnter={() => setHoveredFilter(t)}
                      onMouseLeave={() => setHoveredFilter(null)}
                      style={{
                        display: 'flex', 'align-items': 'center', gap: '4px',
                        padding: '2px 6px',
                        background: activeFilters().has(t)
                          ? 'var(--bg-section)'
                          : hoveredFilter() === t
                            ? 'var(--bg-hover)'
                            : 'transparent',
                        border: '1px solid',
                        'border-color': activeFilters().has(t) ? 'var(--border-subtle)' : 'transparent',
                        'border-radius': 'var(--radius-sm)',
                        cursor: 'pointer',
                        opacity: activeFilters().has(t) ? '1' : '0.4',
                      }}
                    >
                      <svg
                        width="16" height="16" viewBox="0 0 16 16"
                        fill="none" stroke-linecap="round" stroke-linejoin="round"
                        style={{
                          'flex-shrink': '0',
                          stroke: activeFilters().has(t)
                            ? (hoveredFilter() === t ? 'var(--text-primary)' : 'var(--accent-blue)')
                            : (hoveredFilter() === t ? 'var(--text-primary)' : 'var(--text-muted)'),
                          'stroke-width': '1.5',
                        }}
                      >
                        {filterIcon(t)}
                      </svg>
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
                      f.type === 'glb'   ? () => handleSelectAsset(f.path) :
                      undefined
                    }
                    draggable={f.type === 'glb'}
                    onDragStart={f.type === 'glb' ? (e) => {
                      e.dataTransfer!.setData('application/erythos-glb', f.path);
                      e.dataTransfer!.effectAllowed = 'copy';
                    } : undefined}
                    style={{
                      display: 'flex', 'align-items': 'center', gap: '6px',
                      padding: '5px 10px',
                      cursor: (f.type === 'scene' || f.type === 'glb') ? 'pointer' : 'default',
                      background: (f.type === 'glb' && selectedAssetPath() === f.path)
                        ? 'var(--bg-selected)'
                        : undefined,
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
                Place files in scenes/, models/, textures/,<br />hdris/, leaves/, or other/ folders.
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
