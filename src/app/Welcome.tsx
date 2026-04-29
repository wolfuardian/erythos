import { type Component, createSignal, onMount, Show, For } from 'solid-js';
import { ProjectManager } from '../core/project/ProjectManager';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';

interface Props {
  projectManager: ProjectManager;
  onOpenProject: (handle: FileSystemDirectoryHandle) => Promise<void>;
}

// Session-scoped memory for last picked Parent Location (cleared on page reload)
let lastPickedParent: FileSystemDirectoryHandle | null = null;

function formatLastOpened(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

// Folder SVG icon (no emoji)
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1.5 3.5C1.5 2.948 1.948 2.5 2.5 2.5H6l1.5 1.5H13.5C14.052 4 14.5 4.448 14.5 5v7c0 .552-.448 1-1 1h-11c-.552 0-1-.448-1-1V3.5z"
      fill="var(--text-secondary)"
      opacity="0.7"
    />
    <path
      d="M1.5 5.5H14.5V12c0 .552-.448 1-1 1h-11c-.552 0-1-.448-1-1V5.5z"
      fill="var(--text-secondary)"
      opacity="0.5"
    />
  </svg>
);

// Plus icon
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 1v10M1 6h10" stroke="var(--accent-blue)" stroke-width="1.5" stroke-linecap="round"/>
  </svg>
);

// Thumbnail placeholder — 32x32 dark geometric hint
const ThumbnailPlaceholder = () => (
  <div style={{
    width: '32px',
    height: '32px',
    'min-width': '32px',
    background: 'var(--bg-section)',
    border: '1px solid var(--border-subtle)',
    'border-radius': 'var(--radius-sm)',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    overflow: 'hidden',
  }}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="10,3 17,14 3,14" fill="none" stroke="var(--border-medium)" stroke-width="1" opacity="0.6"/>
      <rect x="6" y="8" width="8" height="7" fill="none" stroke="var(--border-subtle)" stroke-width="0.8" opacity="0.4"/>
    </svg>
  </div>
);

export const Welcome: Component<Props> = (props) => {
  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [showModal, setShowModal] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [parentHandle, setParentHandle] = createSignal<FileSystemDirectoryHandle | null>(lastPickedParent);
  const [errorMsg, setErrorMsg] = createSignal('');

  // Hover states
  const [newProjHover, setNewProjHover] = createSignal(false);
  const [openFolderHover, setOpenFolderHover] = createSignal(false);
  const [hoveredRecentId, setHoveredRecentId] = createSignal<string | null>(null);

  const refresh = async () => setRecentProjects(await props.projectManager.getRecentProjects());

  onMount(() => {
    void refresh();
    const unsub = props.projectManager.onChange(() => void refresh());
    return unsub;
  });

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
      lastPickedParent = handle;
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
      setShowModal(false);
      setNewName('');
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setNewName('');
    setErrorMsg('');
  };

  // Final path preview — shows <parent.name>/<projectName> assemblage
  const finalPath = (): string | null => {
    const parent = parentHandle();
    if (!parent) return null;
    const name = newName().trim();
    return name ? `${parent.name}/${name}` : `${parent.name}/...`;
  };

  const subHeaderStyle = {
    'font-size': 'var(--font-size-xs)',
    'font-weight': '600',
    color: 'var(--text-muted)',
    'text-transform': 'uppercase' as const,
    'letter-spacing': '0.8px',
    'margin-bottom': 'var(--space-md)',
  };

  const tileBaseStyle = (hovered: boolean, accent?: boolean) => ({
    display: 'flex',
    'align-items': 'flex-start',
    gap: 'var(--space-md)',
    padding: 'var(--space-lg) var(--space-xl)',
    background: hovered ? 'var(--bg-hover)' : 'var(--bg-section)',
    border: accent
      ? `1px solid ${hovered ? 'var(--accent-blue)' : 'rgba(82,127,200,0.35)'}`
      : '1px solid var(--border-subtle)',
    'border-radius': 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'background 0.1s, border-color 0.1s',
    'text-align': 'left' as const,
    width: '100%',
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      background: 'var(--bg-app)',
    }}>
      {/* Main card */}
      <div style={{
        width: '640px',
        height: '420px',
        background: 'var(--bg-panel)',
        'border-radius': 'var(--radius-lg)',
        'box-shadow': 'var(--shadow-well-outer)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Left column ~38% */}
        <div style={{
          width: '38%',
          'min-width': '38%',
          background: 'var(--bg-section)',
          'border-right': '1px solid var(--border-subtle)',
          display: 'flex',
          'flex-direction': 'column',
          padding: 'var(--space-2xl) var(--space-xl)',
          'box-sizing': 'border-box',
        }}>
          {/* Logo + Title */}
          <div style={{ 'margin-bottom': 'var(--space-2xl)' }}>
            <div style={{
              'font-size': '18px',
              'font-weight': '700',
              color: 'var(--text-primary)',
              'letter-spacing': '-0.3px',
              'line-height': '1.2',
            }}>
              Erythos
            </div>
            <div style={{
              'font-size': 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              'margin-top': '2px',
            }}>
              3D Editor
            </div>
          </div>

          {/* Quick Start sub-header */}
          <div style={subHeaderStyle}>Quick Start</div>

          {/* Tiles */}
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-md)', 'flex': '1' }}>
            {/* New Project tile */}
            <button
              style={tileBaseStyle(newProjHover(), true)}
              onMouseEnter={() => setNewProjHover(true)}
              onMouseLeave={() => setNewProjHover(false)}
              onClick={() => setShowModal(true)}
            >
              <div style={{ 'margin-top': '2px', 'flex-shrink': '0' }}>
                <PlusIcon />
              </div>
              <div>
                <div style={{
                  'font-size': 'var(--font-size-md)',
                  'font-weight': '600',
                  color: 'var(--text-primary)',
                  'margin-bottom': '2px',
                }}>
                  New Project
                </div>
                <div style={{
                  'font-size': 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                  'line-height': '1.4',
                }}>
                  Create a new 3D scene workspace
                </div>
              </div>
            </button>

            {/* Open Folder tile */}
            <button
              style={tileBaseStyle(openFolderHover(), false)}
              onMouseEnter={() => setOpenFolderHover(true)}
              onMouseLeave={() => setOpenFolderHover(false)}
              onClick={() => void handleAdd()}
            >
              <div style={{ 'margin-top': '2px', 'flex-shrink': '0' }}>
                <FolderIcon />
              </div>
              <div>
                <div style={{
                  'font-size': 'var(--font-size-md)',
                  'font-weight': '600',
                  color: 'var(--text-primary)',
                  'margin-bottom': '2px',
                }}>
                  Open Folder…
                </div>
                <div style={{
                  'font-size': 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                  'line-height': '1.4',
                }}>
                  Open an existing project folder
                </div>
              </div>
            </button>
          </div>

          {/* Footer */}
          <div style={{ 'margin-top': 'var(--space-xl)' }}>
            <div style={{
              'font-size': 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              'line-height': '1.6',
            }}>
              v0.1 — Erythos 3D Editor
            </div>
          </div>
        </div>

        {/* Right column ~62% */}
        <div style={{
          flex: '1',
          display: 'flex',
          'flex-direction': 'column',
          padding: 'var(--space-2xl) var(--space-xl)',
          'box-sizing': 'border-box',
          overflow: 'hidden',
        }}>
          {/* Recent Projects header */}
          <div style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
            'margin-bottom': 'var(--space-md)',
          }}>
            <div style={subHeaderStyle}>Recent Projects</div>
            <Show when={recentProjects().length > 0}>
              <div style={{
                'font-size': 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                'margin-bottom': 'var(--space-md)',
              }}>
                {recentProjects().length}
              </div>
            </Show>
          </div>

          {/* Project list */}
          <div style={{
            flex: '1',
            'overflow-y': 'auto',
            display: 'flex',
            'flex-direction': 'column',
            gap: '1px',
          }}>
            <For each={recentProjects()} fallback={
              <div style={{
                flex: '1',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                border: '1px dashed var(--border-subtle)',
                'border-radius': 'var(--radius-md)',
                'min-height': '80px',
              }}>
                <span style={{
                  'font-size': 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                }}>
                  No recent projects
                </span>
              </div>
            }>
              {(entry) => (
                <div
                  style={{
                    display: 'grid',
                    'grid-template-columns': '32px 1fr 80px',
                    'align-items': 'center',
                    gap: 'var(--space-md)',
                    padding: 'var(--space-md) var(--space-sm)',
                    cursor: 'pointer',
                    'border-radius': 'var(--radius-sm)',
                    background: hoveredRecentId() === entry.id ? 'var(--bg-hover)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={() => setHoveredRecentId(entry.id)}
                  onMouseLeave={() => setHoveredRecentId(null)}
                  onClick={() => void handleOpenRecent(entry.id)}
                >
                  <ThumbnailPlaceholder />
                  <div style={{
                    overflow: 'hidden',
                    'min-width': '0',
                  }}>
                    <div style={{
                      'font-size': 'var(--font-size-md)',
                      'font-weight': '500',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      'text-overflow': 'ellipsis',
                      'white-space': 'nowrap',
                    }}>
                      {entry.name}
                    </div>
                    <div style={{
                      'font-size': 'var(--font-size-xs)',
                      color: 'var(--text-muted)',
                      'font-family': 'var(--font-mono)',
                      overflow: 'hidden',
                      'text-overflow': 'ellipsis',
                      'white-space': 'nowrap',
                    }}>
                      {entry.id}
                    </div>
                  </div>
                  <div style={{
                    'font-size': 'var(--font-size-xs)',
                    color: 'var(--text-muted)',
                    'white-space': 'nowrap',
                    'text-align': 'right',
                  }}>
                    {formatLastOpened(entry.lastOpened)}
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Error message */}
          <Show when={errorMsg()}>
            <div style={{
              'font-size': 'var(--font-size-xs)',
              color: 'var(--accent-red)',
              'margin-top': 'var(--space-sm)',
            }}>
              {errorMsg()}
            </div>
          </Show>
        </div>
      </div>

      {/* Create New Project Modal */}
      <Show when={showModal()}>
        <div
          data-devid="new-project-modal"
          style={{
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'z-index': '1000',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-medium)',
            'border-radius': 'var(--radius-lg)',
            'box-shadow': 'var(--shadow-popup)',
            padding: 'var(--space-2xl)',
            width: '360px',
            display: 'flex',
            'flex-direction': 'column',
            gap: 'var(--space-xl)',
          }}>
            {/* Modal title */}
            <div data-devid="new-project-modal-title" style={{
              'font-size': 'var(--font-size-xl)',
              'font-weight': '600',
              color: 'var(--text-primary)',
            }}>
              Create New Project
            </div>

            {/* Pick location */}
            <div data-devid="new-project-modal-parent-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
              <label style={{
                'font-size': 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                'text-transform': 'uppercase' as const,
                'letter-spacing': '0.6px',
                'font-weight': '600',
              }}>
                Parent Location
              </label>
              <button
                data-devid="new-project-modal-parent-picker"
                style={{
                  background: 'var(--bg-section)',
                  border: '1px solid var(--border-subtle)',
                  'border-radius': 'var(--radius-md)',
                  padding: 'var(--space-md) var(--space-lg)',
                  color: parentHandle() ? 'var(--text-primary)' : 'var(--text-muted)',
                  'font-size': 'var(--font-size-md)',
                  cursor: 'pointer',
                  'text-align': 'left' as const,
                  'font-family': parentHandle() ? 'var(--font-mono)' : 'inherit',
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                }}
                onClick={() => void handlePickLocation()}
              >
                {parentHandle() ? parentHandle()!.name : 'Pick parent folder…'}
              </button>
            </div>

            {/* Project name */}
            <div data-devid="new-project-modal-name-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
              <label style={{
                'font-size': 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                'text-transform': 'uppercase' as const,
                'letter-spacing': '0.6px',
                'font-weight': '600',
              }}>
                Project Name
              </label>
              <input
                data-devid="new-project-modal-name-input"
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
                placeholder="my-project"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  'border-radius': 'var(--radius-md)',
                  padding: 'var(--space-md) var(--space-lg)',
                  color: 'var(--text-primary)',
                  'font-size': 'var(--font-size-md)',
                  'box-shadow': 'var(--shadow-input-inset)',
                  outline: 'none',
                  width: '100%',
                  'box-sizing': 'border-box',
                }}
                onFocus={(e) => { e.currentTarget.style.outline = '1px solid var(--accent-gold)'; }}
                onBlur={(e) => { e.currentTarget.style.outline = 'none'; }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') closeModal(); }}
              />
            </div>

            {/* Final Path preview */}
            <div data-devid="new-project-modal-path-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
              <label style={{
                'font-size': 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                'text-transform': 'uppercase' as const,
                'letter-spacing': '0.6px',
                'font-weight': '600',
              }}>
                Final Path
              </label>
              <div
                data-devid="new-project-modal-path-preview"
                title={finalPath() ?? undefined}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  'border-radius': 'var(--radius-md)',
                  padding: 'var(--space-md) var(--space-lg)',
                  'font-size': 'var(--font-size-sm)',
                  'font-family': finalPath() ? 'var(--font-mono)' : 'inherit',
                  'font-style': finalPath() ? 'normal' : 'italic',
                  color: finalPath() ? 'var(--text-secondary)' : 'var(--text-muted)',
                  'box-shadow': 'var(--shadow-input-inset)',
                  overflow: 'hidden',
                  'text-overflow': 'ellipsis',
                  'white-space': 'nowrap',
                }}
              >
                {finalPath() ?? 'Pick parent location to preview path'}
              </div>
            </div>

            {/* Modal error */}
            <Show when={errorMsg()}>
              <div data-devid="new-project-modal-error" style={{
                'font-size': 'var(--font-size-xs)',
                color: 'var(--accent-red)',
              }}>
                {errorMsg()}
              </div>
            </Show>

            {/* Actions */}
            <div data-devid="new-project-modal-actions" style={{
              display: 'flex',
              gap: 'var(--space-md)',
              'justify-content': 'flex-end',
            }}>
              <button
                data-devid="new-project-modal-cancel"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  'border-radius': 'var(--radius-md)',
                  padding: 'var(--space-md) var(--space-xl)',
                  color: 'var(--text-secondary)',
                  'font-size': 'var(--font-size-md)',
                  cursor: 'pointer',
                }}
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                data-devid="new-project-modal-create"
                style={{
                  background: (!parentHandle() || !newName().trim()) ? 'var(--bg-section)' : 'var(--accent-blue)',
                  border: '1px solid transparent',
                  'border-radius': 'var(--radius-md)',
                  padding: 'var(--space-md) var(--space-xl)',
                  color: (!parentHandle() || !newName().trim()) ? 'var(--text-muted)' : 'var(--text-primary)',
                  'font-size': 'var(--font-size-md)',
                  cursor: (!parentHandle() || !newName().trim()) ? 'default' : 'pointer',
                }}
                disabled={!parentHandle() || !newName().trim()}
                onClick={() => void handleCreate()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
