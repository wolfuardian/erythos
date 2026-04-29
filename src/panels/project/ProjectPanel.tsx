import { createSignal, createMemo, createEffect, For, Show, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { useAreaState } from '../../app/areaState';
import { ErrorDialog } from '../../components/ErrorDialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PromptDialog } from '../../components/PromptDialog';
import { ContextMenu, type MenuItem } from '../../components/ContextMenu';
import { PanelHeader } from '../../components/PanelHeader';
import type { ProjectFile } from '../../core/project/ProjectFile';

// ── Type meta ──
const TYPE_META: Record<ProjectFile['type'], { pill: string; label: string; color: string }> = {
  scene:   { pill: 'SCN', label: 'Scene',   color: 'var(--accent-green)'  },
  glb:     { pill: 'GLB', label: 'Model',   color: 'var(--accent-blue)'   },
  texture: { pill: 'TEX', label: 'Texture', color: 'var(--accent-yellow)' },
  hdr:     { pill: 'HDR', label: 'HDRI',    color: 'var(--accent-orange)' },
  prefab:  { pill: 'FAB', label: 'Prefab',  color: 'var(--accent-purple)' },
  other:   { pill: 'OTH', label: 'Other',   color: 'var(--text-muted)'    },
};

const filterIcon = (t: ProjectFile['type']) => {
  // viewBox 0 0 16 16, fill:none, stroke-linecap:round, stroke-linejoin:round
  switch (t) {
    case 'scene':   return <><path d="M8 3L3 6v5l5 3 5-3V6L8 3z"/><line x1="8" y1="3" x2="8" y2="14"/><line x1="3" y1="6" x2="13" y2="6"/></>;
    case 'glb':     return <><path d="M8 2l5 3v5l-5 3-5-3V5z"/><line x1="8" y1="2" x2="8" y2="10"/><line x1="3" y1="5" x2="13" y2="10"/></>;
    case 'texture': return <><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="2" y="2" width="6" height="6"/><rect x="8" y="8" width="6" height="6"/></>;
    case 'hdr':     return <><circle cx="8" cy="8" r="5"/><line x1="3" y1="8" x2="13" y2="8"/><path d="M5.5 5a5 5 0 0 0 0 6"/><path d="M10.5 5a5 5 0 0 1 0 6"/></>;
    case 'prefab':  return <><path d="M4 13c0 0 1-7 7-9"/><path d="M4 13c3-1 8-4 7-9"/><line x1="4" y1="13" x2="8" y2="9"/></>;
    case 'other':   return <><rect x="3" y="2" width="8" height="11" rx="1"/><line x1="3" y1="7" x2="11" y2="7"/><text x="7" y="12" text-anchor="middle" font-size="5" stroke="none" fill="currentColor">?</text></>;
  }
};

// ── Folder tree constant ──
const FOLDERS: Array<{ label: string; type: ProjectFile['type'] | null }> = [
  { label: 'Assets',   type: null      },  // root → show all
  { label: 'scenes',   type: 'scene'   },
  { label: 'models',   type: 'glb'     },
  { label: 'textures', type: 'texture' },
  { label: 'hdris',    type: 'hdr'     },
  { label: 'prefabs',  type: 'prefab'  },
  { label: 'other',    type: 'other'   },
];

const ProjectPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [errorMsg, setErrorMsg] = createSignal('');
  const [errorTitle, setErrorTitle] = createSignal('');
  const [showCloseConfirm, setShowCloseConfirm] = createSignal(false);
  const [showLoadConfirm, setShowLoadConfirm] = createSignal(false);
  const [pendingLoadPath, setPendingLoadPath] = createSignal<string | null>(null);

  // ── Multi-select state ──
  const [selectedAssetPaths, setSelectedAssetPaths] = useAreaState<string[]>('selectedAssetPaths', []);
  const [lastClickedAssetPath, setLastClickedAssetPath] = createSignal<string | null>(null);

  // ── New IDE state ──
  const [viewMode, setViewMode] = useAreaState<'grid' | 'list'>('viewMode', 'list');
  const [searchQuery, setSearchQuery] = useAreaState<string>('searchQuery', '');
  const [selectedFolder, setSelectedFolder] = useAreaState<string | null>('selectedFolder', null);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; file: ProjectFile | null } | null>(null);

  // ── New Scene dialog state ──
  const [showNewScenePrompt, setShowNewScenePrompt] = createSignal(false);

  // ── Delete confirm state ──
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [pendingDeletePath, setPendingDeletePath] = createSignal<string | null>(null);

  const handleClose = () => editor.projectManager.close();

  // ── Browser: Assets/ ──
  const assetFiles = () => bridge.projectFiles();

  const ALL_TYPES: ProjectFile['type'][] = ['scene', 'glb', 'texture', 'hdr', 'prefab', 'other'];
  const [activeFiltersArr, setActiveFiltersArr] = useAreaState<ProjectFile['type'][]>(
    'activeFilters',
    [...ALL_TYPES],
  );
  const activeFilters = createMemo(() => new Set(activeFiltersArr()));
  const setActiveFilters = (
    next: Set<ProjectFile['type']> | ((prev: Set<ProjectFile['type']>) => Set<ProjectFile['type']>),
  ) => {
    if (typeof next === 'function') {
      setActiveFiltersArr(prev => Array.from(next(new Set(prev))));
    } else {
      setActiveFiltersArr(Array.from(next));
    }
  };

  const toggleFilter = (t: ProjectFile['type']) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(t)) { next.delete(t); } else { next.add(t); }
      return next;
    });
  };

  const [hoveredFilter, setHoveredFilter] = createSignal<ProjectFile['type'] | null>(null);
  const [isDragOver, setIsDragOver] = createSignal(false);
  const [hoveredFolder, setHoveredFolder] = createSignal<string | null>(null);
  const [hoveredAssetPath, setHoveredAssetPath] = createSignal<string | null>(null);

  // ── Filtered assets (folder + search + type-filter) ──
  const displayedAssets = createMemo(() => {
    const query = searchQuery().toLowerCase();
    return assetFiles().filter((f) => {
      const matchesFolder = selectedFolder() === null || f.type === selectedFolder();
      const matchesSearch = query === '' || f.name.toLowerCase().includes(query);
      const matchesFilter = activeFilters().has(f.type);
      return matchesFolder && matchesSearch && matchesFilter;
    });
  });

  // ── Clear selection when folder / filter / search changes ──
  createEffect(() => {
    void selectedFolder();
    void activeFiltersArr();
    void searchQuery();
    setSelectedAssetPaths([]);
    setLastClickedAssetPath(null);
  });

  // ── Load scene: also syncs currentScenePath ──
  const doLoadScene = async (path: string) => {
    try {
      const file = await editor.projectManager.readFile(path);
      const parsed = JSON.parse(await file.text());
      editor.loadScene(parsed);
      bridge.setCurrentScenePath(path);
    } catch (e: any) {
      setErrorTitle('Load Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleLoadScene = (path: string) => {
    if (bridge.confirmBeforeLoad()) {
      setPendingLoadPath(path);
      setShowLoadConfirm(true);
    } else {
      void doLoadScene(path);
    }
  };

  // ── Multi-select click handler (all types) ──
  const handleAssetClick = (e: MouseEvent, path: string) => {
    const assets = displayedAssets();
    if (e.shiftKey) {
      const last = lastClickedAssetPath();
      const currentIdx = assets.findIndex(f => f.path === path);
      const lastIdx = last !== null ? assets.findIndex(f => f.path === last) : -1;
      if (lastIdx === -1) {
        // No prior anchor → fallback to plain click
        setSelectedAssetPaths([path]);
      } else {
        const start = Math.min(lastIdx, currentIdx);
        const end = Math.max(lastIdx, currentIdx);
        setSelectedAssetPaths(assets.slice(start, end + 1).map(f => f.path));
      }
    } else if (e.ctrlKey || e.metaKey) {
      const current = selectedAssetPaths();
      if (current.includes(path)) {
        setSelectedAssetPaths(current.filter(p => p !== path));
      } else {
        setSelectedAssetPaths([...current, path]);
      }
    } else {
      setSelectedAssetPaths([path]);
    }
    setLastClickedAssetPath(path);
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

  // ── New Scene flow ──
  const handleNewScene = async (name: string) => {
    setShowNewScenePrompt(false);
    try {
      const path = await bridge.createScene(name);
      bridge.setCurrentScenePath(path);
      editor.loadScene({ version: 1, nodes: [] });
    } catch (e: any) {
      setErrorTitle('Create Scene Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  // ── Delete flow ──
  const handleDeleteConfirmed = async () => {
    const path = pendingDeletePath();
    setShowDeleteConfirm(false);
    setPendingDeletePath(null);
    if (!path) return;
    try {
      await editor.projectManager.deleteFile(path);
    } catch (e: any) {
      setErrorTitle('Delete Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  // ── Context menu items ──
  const contextMenuItems = (): MenuItem[] => {
    const file = contextMenu()?.file ?? null;
    if (file?.type === 'scene') {
      return [
        { label: 'Open Scene', action: () => handleLoadScene(file.path) },
        { label: 'Delete', action: () => {
          setPendingDeletePath(file.path);
          setShowDeleteConfirm(true);
        }},
        { label: '---' },
        { label: 'New Scene...', action: () => setShowNewScenePrompt(true) },
      ];
    }
    return [
      { label: 'New Scene...', action: () => setShowNewScenePrompt(true) },
    ];
  };

  // ── Selection helper ──
  const isSelected = (path: string) => selectedAssetPaths().includes(path);

  return (
    <div
      data-devid="project-panel"
      style={{
        width: 'calc(100% - 6px)', height: 'calc(100% - 6px)',
        display: 'flex', 'flex-direction': 'column', overflow: 'hidden',
        background: 'var(--bg-panel)',
        'box-shadow': 'var(--shadow-well-outer)',
        'border-radius': 'var(--radius-lg)',
        margin: '3px',
        'box-sizing': 'border-box',
      }}
    >
      {/* ── Panel header ── */}
      <PanelHeader
        title={bridge.projectName() ?? 'Project'}
        actions={
          <button data-devid="project-panel-close-project" onClick={() => setShowCloseConfirm(true)} style={{
            background: 'var(--bg-section)', color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
            padding: '2px 6px', 'border-radius': 'var(--radius-sm)',
            'font-size': 'var(--font-size-xs)', cursor: 'pointer',
          }}>Close project</button>
        }
      />

      {/* ── Toolbar row ── */}
      <div style={{
        height: '36px',
        display: 'flex', 'align-items': 'center', gap: '6px',
        padding: '0 8px',
        'border-bottom': '1px solid var(--border-subtle)',
        'flex-shrink': '0',
      }}>
        {/* Search input */}
        <input
          data-devid="project-panel-search"
          type="text"
          placeholder="Search assets..."
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            'border-radius': 'var(--radius-sm)',
            padding: '3px 6px',
            'font-size': 'var(--font-size-sm)',
            'box-shadow': 'var(--shadow-input-inset)',
            outline: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-gold)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
        />

        {/* Grid / List toggle button */}
        <button
          data-devid="project-panel-view-toggle"
          title={viewMode() === 'grid' ? 'Switch to List' : 'Switch to Grid'}
          onClick={() => setViewMode(viewMode() === 'grid' ? 'list' : 'grid')}
          style={{
            width: '24px', height: '24px',
            background: 'var(--bg-section)',
            border: '1px solid var(--border-subtle)',
            'border-radius': 'var(--radius-sm)',
            cursor: 'pointer',
            display: 'flex', 'align-items': 'center', 'justify-content': 'center',
            color: 'var(--text-muted)',
            'flex-shrink': '0',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <Show when={viewMode() === 'list'}>
              {/* grid icon */}
              <rect x="1" y="1" width="5" height="5" rx="1"/><rect x="8" y="1" width="5" height="5" rx="1"/>
              <rect x="1" y="8" width="5" height="5" rx="1"/><rect x="8" y="8" width="5" height="5" rx="1"/>
            </Show>
            <Show when={viewMode() === 'grid'}>
              {/* list icon */}
              <line x1="1" y1="3.5" x2="13" y2="3.5"/>
              <line x1="1" y1="7" x2="13" y2="7"/>
              <line x1="1" y1="10.5" x2="13" y2="10.5"/>
            </Show>
          </svg>
        </button>

      </div>

      {/* ── Breadcrumb row ── */}
      <div style={{
        height: 'var(--statusbar-height)',
        display: 'flex', 'align-items': 'center',
        padding: '0 10px', gap: '4px',
        'font-size': 'var(--font-size-sm)',
        color: 'var(--text-muted)',
        'border-bottom': '1px solid var(--border-subtle)',
        'flex-shrink': '0',
      }}>
        <span
          style={{ cursor: 'pointer', color: selectedFolder() ? 'var(--accent-blue)' : 'var(--text-secondary)' }}
          onClick={() => setSelectedFolder(null)}
        >Assets</span>
        <Show when={selectedFolder() !== null}>
          <span>›</span>
          <span style={{ color: 'var(--text-secondary)' }}>{selectedFolder()}</span>
        </Show>
      </div>

      {/* ── Body row ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left sidebar: folder tree ── */}
        <div style={{
          width: '140px',
          'overflow-y': 'auto',
          'border-right': '1px solid var(--border-subtle)',
          'flex-shrink': '0',
        }}>
          <For each={FOLDERS}>
            {(f) => {
              const isActive = () =>
                f.type === null
                  ? selectedFolder() === null
                  : selectedFolder() === f.type;
              const isHovered = () => hoveredFolder() === f.label;
              return (
                <div
                  onClick={() => setSelectedFolder(f.type)}
                  onMouseEnter={() => setHoveredFolder(f.label)}
                  onMouseLeave={() => setHoveredFolder(null)}
                  style={{
                    padding: '5px 10px',
                    cursor: 'pointer',
                    'font-size': 'var(--font-size-sm)',
                    color: isActive() ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: isActive()
                      ? 'var(--bg-selected)'
                      : isHovered()
                        ? 'var(--bg-hover)'
                        : 'transparent',
                    'white-space': 'nowrap',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis',
                  }}
                >
                  {f.label}
                </div>
              );
            }}
          </For>
        </div>

        {/* ── Right: asset area with drag-drop + context menu wrapper ── */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => {
            if (!(e.currentTarget as Element).contains(e.relatedTarget as Node)) {
              setIsDragOver(false);
            }
          }}
          onDrop={(e) => void handleAssetsDrop(e)}
          onContextMenu={(e) => {
            // Only fire if not on a file row (file rows have their own context menu)
            if ((e.target as Element).closest('[data-file-row]')) return;
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, file: null });
          }}
          onClick={() => {
            // Click on empty area (bubbles up from non-file-row areas) → clear selection
            setSelectedAssetPaths([]);
            setLastClickedAssetPath(null);
          }}
          style={{
            flex: 1,
            overflow: 'auto',
            border: isDragOver() ? '2px dashed var(--accent-blue)' : '2px solid transparent',
            background: isDragOver() ? 'rgba(70,130,220,0.08)' : undefined,
            'box-sizing': 'border-box',
            transition: 'border-color 100ms, background 100ms',
            display: 'flex',
            'flex-direction': 'column',
            position: 'relative',
          }}
        >
          {/* ── Type-filter pill bar (list view only) ── */}
          <Show when={viewMode() === 'list'}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'flex', gap: '4px', padding: '6px 10px',
                'border-bottom': '1px solid var(--border-subtle)',
                'flex-wrap': 'wrap',
                'flex-shrink': '0',
              }}
            >
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
          </Show>

          {/* ── Grid view ── */}
          <Show when={viewMode() === 'grid'}>
            <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px', padding: '8px' }}>
              <For each={displayedAssets()}>
                {(f) => {
                  const meta = TYPE_META[f.type];
                  const selected = () => isSelected(f.path);
                  const hovered = () => hoveredAssetPath() === f.path;
                  return (
                    <div
                      data-file-row="true"
                      onMouseEnter={() => setHoveredAssetPath(f.path)}
                      onMouseLeave={() => setHoveredAssetPath(prev => prev === f.path ? null : prev)}
                      style={{
                        position: 'relative', width: '72px', cursor: 'pointer',
                        display: 'flex', 'flex-direction': 'column', 'align-items': 'center', gap: '4px',
                        background: selected()
                          ? 'var(--bg-selected)'
                          : hovered()
                            ? 'var(--bg-hover)'
                            : undefined,
                        outline: !selected() && hovered() ? '1px solid var(--border-medium)' : undefined,
                        'outline-offset': !selected() && hovered() ? '-1px' : undefined,
                        'border-radius': hovered() ? 'var(--radius-md)' : undefined,
                      }}
                      onClick={(e) => { e.stopPropagation(); handleAssetClick(e, f.path); }}
                      onDblClick={(e) => {
                        e.stopPropagation();
                        if (f.type === 'scene') void handleLoadScene(f.path);
                        // other types: future hook
                      }}
                      onContextMenu={f.type === 'scene' ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, file: f });
                      } : undefined}
                    >
                      {/* Thumbnail placeholder */}
                      <div style={{
                        width: '64px', height: '64px',
                        background: 'var(--bg-section)',
                        border: `1px solid ${selected() ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                        'border-radius': 'var(--radius-md)',
                        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                        color: meta.color,
                      }}>
                        <svg width="24" height="24" viewBox="0 0 16 16" fill="none"
                          stroke="currentColor" stroke-width="1.5"
                          stroke-linecap="round" stroke-linejoin="round">
                          {filterIcon(f.type)}
                        </svg>
                      </div>
                      {/* Type pill, floating bottom-right */}
                      <span style={{
                        position: 'absolute', bottom: '20px', right: '0',
                        background: meta.color + '33', color: meta.color,
                        'font-size': '7px', 'font-weight': 'bold',
                        padding: '1px 3px', 'border-radius': '2px',
                      }}>{meta.pill}</span>
                      {/* Filename */}
                      <span style={{
                        'font-size': 'var(--font-size-xs)', color: 'var(--text-secondary)',
                        width: '72px', overflow: 'hidden', 'text-overflow': 'ellipsis',
                        'white-space': 'nowrap', 'text-align': 'center',
                      }}>{f.name}</span>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>

          {/* ── List view ── */}
          <Show when={viewMode() === 'list'}>
            <For each={displayedAssets()}>
              {(f) => {
                const meta = TYPE_META[f.type];
                const selected = () => isSelected(f.path);
                const hovered = () => hoveredAssetPath() === f.path;
                return (
                  <div
                    data-file-row="true"
                    onMouseEnter={() => setHoveredAssetPath(f.path)}
                    onMouseLeave={() => setHoveredAssetPath(prev => prev === f.path ? null : prev)}
                    onClick={(e) => { e.stopPropagation(); handleAssetClick(e, f.path); }}
                    onDblClick={(e) => {
                      e.stopPropagation();
                      if (f.type === 'scene') void handleLoadScene(f.path);
                      // other types: future hook
                    }}
                    onContextMenu={f.type === 'scene' ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, file: f });
                    } : undefined}
                    draggable={f.type === 'glb'}
                    onDragStart={f.type === 'glb' ? (e) => {
                      e.dataTransfer!.setData('application/erythos-glb', f.path);
                      e.dataTransfer!.effectAllowed = 'copy';
                    } : undefined}
                    style={{
                      display: 'flex', 'align-items': 'center', gap: '6px',
                      padding: hovered() && !selected() ? '5px 6px' : '5px 10px',
                      margin: hovered() && !selected() ? '0 4px' : undefined,
                      cursor: 'pointer',
                      background: selected()
                        ? 'var(--bg-selected)'
                        : hovered()
                          ? 'var(--bg-hover)'
                          : undefined,
                      outline: hovered() && !selected() ? '1px solid var(--border-medium)' : undefined,
                      'outline-offset': hovered() && !selected() ? '-1px' : undefined,
                      'border-radius': hovered() && !selected() ? 'var(--radius-sm)' : undefined,
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
          </Show>

          {/* ── Empty state ── */}
          <Show when={assetFiles().length === 0}>
            <div style={{
              padding: '16px 12px', color: 'var(--text-muted)',
              'font-size': 'var(--font-size-xs)', 'text-align': 'center', 'line-height': '1.6',
            }}>
              No assets found.<br />
              Place files in scenes/, models/, textures/,<br />hdris/, prefabs/, or other/ folders.
            </div>
          </Show>

          {/* ── Context menu ── */}
          <Show when={contextMenu()}>
            <ContextMenu
              items={contextMenuItems()}
              position={{ x: contextMenu()!.x, y: contextMenu()!.y }}
              onClose={() => setContextMenu(null)}
            />
          </Show>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        height: 'var(--statusbar-height)',
        display: 'flex', 'align-items': 'center',
        padding: '0 10px', gap: '8px',
        'font-size': 'var(--font-size-xs)',
        color: 'var(--text-muted)',
        'border-top': '1px solid var(--border-subtle)',
        'flex-shrink': '0',
      }}>
        <span>{displayedAssets().length} items</span>
        <Show when={selectedAssetPaths().length === 1}>
          <span style={{ 'margin-left': 'auto', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
            {selectedAssetPaths()[0]}
          </span>
        </Show>
        <Show when={selectedAssetPaths().length > 1}>
          <span style={{ 'margin-left': 'auto' }}>
            {selectedAssetPaths().length} items selected
          </span>
        </Show>
      </div>

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
      <ConfirmDialog
        open={showLoadConfirm()}
        title="Open this scene?"
        message="Unsaved changes may be lost."
        confirmLabel="Open scene"
        cancelLabel="Cancel"
        onConfirm={() => {
          const path = pendingLoadPath();
          setShowLoadConfirm(false);
          setPendingLoadPath(null);
          if (path !== null) void doLoadScene(path);
        }}
        onCancel={() => { setShowLoadConfirm(false); setPendingLoadPath(null); }}
      />
      <ConfirmDialog
        open={showDeleteConfirm()}
        title="Delete scene?"
        message={`"${pendingDeletePath()}" will be permanently deleted.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => void handleDeleteConfirmed()}
        onCancel={() => { setShowDeleteConfirm(false); setPendingDeletePath(null); }}
      />
      <PromptDialog
        open={showNewScenePrompt()}
        title="New Scene"
        message="Enter a name for the new scene."
        placeholder="scene-name"
        confirmLabel="Create"
        onConfirm={(name) => void handleNewScene(name)}
        onCancel={() => setShowNewScenePrompt(false)}
      />
    </div>
  );
};

export default ProjectPanel;
