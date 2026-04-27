import { createSignal, createMemo, For, Show, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { useAreaState } from '../../app/areaState';
import { ErrorDialog } from '../../components/ErrorDialog';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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

const ProjectPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [errorMsg, setErrorMsg] = createSignal('');
  const [errorTitle, setErrorTitle] = createSignal('');
  const [showCloseConfirm, setShowCloseConfirm] = createSignal(false);
  const [selectedAssetPath, setSelectedAssetPath] = useAreaState<string | null>('selectedAssetPath', null);

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
    }}>
      {/* ── Browser mode ── */}
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
              Place files in scenes/, models/, textures/,<br />hdris/, prefabs/, or other/ folders.
            </div>
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
    </div>
  );
};

export default ProjectPanel;
