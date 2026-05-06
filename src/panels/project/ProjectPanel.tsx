import { createSignal, createMemo, createEffect, For, Show, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { useAreaState } from '../../app/areaState';
import { ErrorDialog } from '../../components/ErrorDialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PromptDialog } from '../../components/PromptDialog';
import { ContextMenu } from '../../components/ContextMenu';
import { PanelHeader } from '../../components/PanelHeader';
import type { ProjectFile } from '../../core/project/ProjectFile';
import type { AssetPath } from '../../utils/branded';
import { ProjectTypeIcon } from './ProjectTypeIcon';
import { FolderIcon } from './FolderIcon';
import { buildProjectMenuItems } from './projectMenuItems';
import { useNewSceneFlow } from './useNewSceneFlow';
import { useDeleteFlow } from './useDeleteFlow';
import styles from './ProjectPanel.module.css';

// ── Type meta ──
const TYPE_META: Record<ProjectFile['type'], { pill: string; label: string; color: string }> = {
  scene:   { pill: 'SCN', label: 'Scene',   color: 'var(--accent-green)'  },
  glb:     { pill: 'GLB', label: 'Model',   color: 'var(--accent-blue)'   },
  texture: { pill: 'TEX', label: 'Texture', color: 'var(--accent-yellow)' },
  hdr:     { pill: 'HDR', label: 'HDRI',    color: 'var(--accent-orange)' },
  prefab:  { pill: 'FAB', label: 'Prefab',  color: 'var(--accent-purple)' },
  other:   { pill: 'OTH', label: 'Other',   color: 'var(--text-muted)'    },
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
  const [pendingLoadPath, setPendingLoadPath] = createSignal<AssetPath | null>(null);

  // ── Multi-select state ──
  // selection is transient — fresh on reload (IDE convention; persisted selection masks hover feedback)
  const [selectedAssetPaths, setSelectedAssetPaths] = createSignal<AssetPath[]>([]);
  const [lastClickedAssetPath, setLastClickedAssetPath] = createSignal<AssetPath | null>(null);

  // ── New IDE state ──
  const [viewMode, setViewMode] = useAreaState<'grid' | 'list'>('viewMode', 'list');
  const [searchQuery, setSearchQuery] = useAreaState<string>('searchQuery', '');
  const [selectedFolder, setSelectedFolder] = useAreaState<string | null>('selectedFolder', null);

  // ── Context menu state ──
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; file: ProjectFile | null } | null>(null);

  // ── New Scene + Delete flow hooks ──
  const newScene = useNewSceneFlow({ editor, bridge, setError: (t, m) => { setErrorTitle(t); setErrorMsg(m); } });
  const deleteFlow = useDeleteFlow({ editor, setSelectedAssetPaths, setError: (t, m) => { setErrorTitle(t); setErrorMsg(m); } });

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

  const [isDragOver, setIsDragOver] = createSignal(false);

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
  const doLoadScene = async (path: AssetPath) => {
    try {
      const file = await editor.projectManager.readFile(path);
      const parsed = JSON.parse(await file.text());
      await editor.loadScene(parsed);
      bridge.setCurrentScenePath(path);
    } catch (e: any) {
      setErrorTitle('Load Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleLoadScene = (path: AssetPath) => {
    if (bridge.confirmBeforeLoad()) {
      setPendingLoadPath(path);
      setShowLoadConfirm(true);
    } else {
      void doLoadScene(path);
    }
  };

  // ── Multi-select click handler (all types) ──
  const handleAssetClick = (e: MouseEvent, path: AssetPath) => {
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

  // ── Context menu: shared handler for both grid and list ──
  const handleAssetContextMenu = (e: MouseEvent, f: ProjectFile) => {
    e.preventDefault();
    e.stopPropagation();
    const selected = selectedAssetPaths();
    const inSelection = selected.includes(f.path);
    if (!inSelection) {
      // Right-clicked outside selection → switch selection to this file only
      setSelectedAssetPaths([f.path]);
      setLastClickedAssetPath(f.path);
    }
    // If in selection and length === 1, or just switched to single → single mode
    // If in selection and length > 1 → batch mode
    // (state is set above; contextMenuItems() reads it fresh)
    setContextMenu({ x: e.clientX, y: e.clientY, file: f });
  };

  // ── Context menu items ──
  const contextMenuItems = () =>
    buildProjectMenuItems({
      file: contextMenu()?.file ?? null,
      selectedPaths: selectedAssetPaths(),
      onLoadScene: handleLoadScene,
      onRequestDelete: deleteFlow.open,
      onRequestNewScene: newScene.open,
    });

  // ── Selection helper ──
  const isSelected = (path: AssetPath) => selectedAssetPaths().includes(path);

  return (
    <div
      data-testid="project-panel"
      class={styles.panel}
    >
      {/* ── Panel header ── */}
      <PanelHeader
        title={bridge.projectName() ?? 'Project'}
        actions={
          <button
            data-testid="project-panel-close-project"
            class={styles.closeBtn}
            onClick={() => setShowCloseConfirm(true)}
          >
            Close project
          </button>
        }
      />

      {/* ── Toolbar row ── */}
      <div class={styles.toolbar}>
        {/* Search input */}
        <input
          data-testid="project-panel-search"
          type="text"
          placeholder="Search assets..."
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
          class={styles.searchInput}
        />

        {/* Grid / List toggle button */}
        <button
          data-testid="project-panel-view-toggle"
          title={viewMode() === 'grid' ? 'Switch to List' : 'Switch to Grid'}
          onClick={() => setViewMode(viewMode() === 'grid' ? 'list' : 'grid')}
          class={styles.viewToggleBtn}
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
      <div class={styles.breadcrumb}>
        <span
          class={styles.breadcrumbRoot}
          classList={{ [styles.active]: selectedFolder() === null }}
          onClick={() => setSelectedFolder(null)}
        >Assets</span>
        <Show when={selectedFolder() !== null}>
          <span>›</span>
          <span class={styles.breadcrumbSub}>{selectedFolder()}</span>
        </Show>
      </div>

      {/* ── Body row ── */}
      <div class={styles.body}>

        {/* ── Left sidebar: folder tree ── */}
        <div class={styles.sidebar}>
          <For each={FOLDERS}>
            {(f) => {
              const isActive = () =>
                f.type === null
                  ? selectedFolder() === null
                  : selectedFolder() === f.type;
              return (
                <div
                  onClick={() => setSelectedFolder(f.type)}
                  class={styles.folderItem}
                  classList={{ [styles.folderActive]: isActive() }}
                >
                  <span class={styles.folderIcon}>
                    <FolderIcon open={isActive()} />
                  </span>
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
          class={styles.assetArea}
          classList={{ [styles.dragOver]: isDragOver() }}
        >
          {/* ── Type-filter pill bar (list view only) ── */}
          <Show when={viewMode() === 'list'}>
            <div
              onClick={(e) => e.stopPropagation()}
              class={styles.filterBar}
            >
              <For each={ALL_TYPES}>
                {(t) => {
                  const meta = TYPE_META[t];
                  return (
                    <button
                      aria-label={meta.label}
                      title={meta.label}
                      onClick={() => toggleFilter(t)}
                      class={styles.filterBtn}
                      classList={{ [styles.filterActive]: activeFilters().has(t) }}
                    >
                      <svg
                        width="16" height="16" viewBox="0 0 16 16"
                        fill="none" stroke-linecap="round" stroke-linejoin="round"
                        class={styles.filterIcon}
                        // inline-allowed: CSS variable injection — type-specific accent token
                        style={{ '--type-color': meta.color }}
                      >
                        <ProjectTypeIcon type={t} />
                      </svg>
                      <span class={styles.filterLabel}>{meta.label}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          </Show>

          {/* ── Grid view ── */}
          <Show when={viewMode() === 'grid'}>
            <div class={styles.gridArea}>
              <For each={displayedAssets()}>
                {(f) => {
                  const meta = TYPE_META[f.type];
                  const selected = () => isSelected(f.path);
                  return (
                    <div
                      data-file-row="true"
                      class={styles.gridItem}
                      classList={{ [styles.assetSelected]: selected() }}
                      onClick={(e) => { e.stopPropagation(); handleAssetClick(e, f.path); }}
                      onDblClick={(e) => {
                        e.stopPropagation();
                        if (f.type === 'scene') void handleLoadScene(f.path);
                        // other types: future hook
                      }}
                      onContextMenu={(e) => handleAssetContextMenu(e, f)}
                      draggable={f.type === 'glb' || f.type === 'prefab'}
                      onDragStart={(f.type === 'glb' || f.type === 'prefab') ? (e) => {
                        if (f.type === 'prefab') {
                          e.dataTransfer!.setData('application/erythos-prefab', f.path);
                        } else {
                          const selected = selectedAssetPaths();
                          const inSelection = selected.includes(f.path);
                          const glbPaths = selected.filter(p =>
                            assetFiles().find(a => a.path === p)?.type === 'glb'
                          );
                          if (inSelection && glbPaths.length >= 2) {
                            e.dataTransfer!.setData('application/erythos-glb-list', JSON.stringify(glbPaths));
                          } else {
                            e.dataTransfer!.setData('application/erythos-glb', f.path);
                          }
                        }
                        e.dataTransfer!.effectAllowed = 'copy';
                      } : undefined}
                    >
                      {/* Thumbnail placeholder */}
                      <div
                        class={styles.gridThumb}
                        // inline-allowed: CSS variable injection — type-specific accent token
                        style={{ '--type-color': meta.color }}
                      >
                        <svg width="24" height="24" viewBox="0 0 16 16" fill="none"
                          stroke="currentColor" stroke-width="1.5"
                          stroke-linecap="round" stroke-linejoin="round">
                          <ProjectTypeIcon type={f.type} />
                        </svg>
                      </div>
                      {/* Type pill, floating bottom-right */}
                      <span
                        class={styles.gridPill}
                        // inline-allowed: CSS variable injection — type-specific accent token
                        style={{ '--type-color': meta.color }}
                      >{meta.pill}</span>
                      {/* Filename */}
                      <span class={styles.gridName}>{f.name}</span>
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
                return (
                  <div
                    data-file-row="true"
                    class={styles.listItem}
                    classList={{ [styles.assetSelected]: selected() }}
                    onClick={(e) => { e.stopPropagation(); handleAssetClick(e, f.path); }}
                    onDblClick={(e) => {
                      e.stopPropagation();
                      if (f.type === 'scene') void handleLoadScene(f.path);
                      // other types: future hook
                    }}
                    onContextMenu={(e) => handleAssetContextMenu(e, f)}
                    draggable={f.type === 'glb' || f.type === 'prefab'}
                    onDragStart={(f.type === 'glb' || f.type === 'prefab') ? (e) => {
                      if (f.type === 'prefab') {
                        e.dataTransfer!.setData('application/erythos-prefab', f.path);
                      } else {
                        const selected = selectedAssetPaths();
                        const inSelection = selected.includes(f.path);
                        const glbPaths = selected.filter(p =>
                          assetFiles().find(a => a.path === p)?.type === 'glb'
                        );
                        if (inSelection && glbPaths.length >= 2) {
                          e.dataTransfer!.setData('application/erythos-glb-list', JSON.stringify(glbPaths));
                        } else {
                          e.dataTransfer!.setData('application/erythos-glb', f.path);
                        }
                      }
                      e.dataTransfer!.effectAllowed = 'copy';
                    } : undefined}
                  >
                    {/* Type pill */}
                    <span
                      class={styles.listPill}
                      // inline-allowed: CSS variable injection — type-specific accent token
                      style={{ '--type-color': meta.color }}
                    >{meta.pill}</span>
                    {/* Filename */}
                    <span class={styles.listName}>{f.name}</span>
                  </div>
                );
              }}
            </For>
          </Show>

          {/* ── Empty state ── */}
          <Show when={assetFiles().length === 0}>
            <div class={styles.emptyState}>
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
      <div class={styles.statusBar}>
        <span>{displayedAssets().length} items</span>
        <Show when={selectedAssetPaths().length === 1}>
          <span class={styles.statusPath}>
            {selectedAssetPaths()[0]}
          </span>
        </Show>
        <Show when={selectedAssetPaths().length > 1}>
          <span class={styles.statusCount}>
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
        open={deleteFlow.show()}
        title={deleteFlow.title()}
        message={deleteFlow.message()}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={deleteFlow.onConfirm}
        onCancel={deleteFlow.onCancel}
      />
      <PromptDialog
        open={newScene.show()}
        title="New Scene"
        message="Enter a name for the new scene."
        placeholder="scene-name"
        confirmLabel="Create"
        onConfirm={newScene.onConfirm}
        onCancel={newScene.onCancel}
      />
    </div>
  );
};

export default ProjectPanel;
