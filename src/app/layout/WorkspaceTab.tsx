import {
  type Component,
  createSignal,
  Show,
} from 'solid-js';
import { store, mutate, setCurrent, renameWorkspace, reorderWorkspace } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';
import { WorkspaceContextMenu } from './WorkspaceContextMenu';

interface Props {
  workspace: Workspace;
  ref?: (el: HTMLDivElement) => void;
  tabRefs: Map<string, HTMLElement>;
}

interface MenuPos {
  x: number;
  y: number;
}

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;
  let suppressNextClick = false;

  // ── drag-reorder ──────────────────────────────────────────
  const handlePointerDown = (e: PointerEvent) => {
    // Don't start drag on right-click (context menu)
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    const fromIdx = store().workspaces.findIndex(w => w.id === props.workspace.id);
    let hoveredIdx = fromIdx;
    let hasDragged = false;
    const startX = e.clientX;

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) >= 5) hasDragged = true;
      if (!hasDragged) return;

      for (const [id, tabEl] of props.tabRefs) {
        const rect = tabEl.getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
          hoveredIdx = store().workspaces.findIndex(w => w.id === id);
          break;
        }
      }

      el.style.opacity = '0.5';
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.style.opacity = '';

      if (hasDragged && hoveredIdx !== fromIdx) {
        suppressNextClick = true;
        mutate(s => reorderWorkspace(s, fromIdx, hoveredIdx));
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── context menu ─────────────────────────────────────────
  const [menuPos, setMenuPos] = createSignal<MenuPos | null>(null);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setMenuPos(null);

  // ── inline rename ─────────────────────────────────────────
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  let cancelled = false;

  const startEdit = () => {
    setDraft(props.workspace.name);
    setEditing(true);
  };

  const commitEdit = () => {
    if (cancelled) { cancelled = false; return; }
    const trimmed = draft().trim();
    if (trimmed) {
      mutate(s => renameWorkspace(s, props.workspace.id, trimmed));
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    cancelled = true;
    setEditing(false);
  };

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  return (
    <>
      <div
        data-testid="toolbar-workspace-tab"
        data-workspace-id={props.workspace.id}
        ref={props.ref}
        onClick={() => {
          if (editing()) return;
          if (suppressNextClick) { suppressNextClick = false; return; }
          mutate(s => setCurrent(s, props.workspace.id));
        }}
        onDblClick={(e) => { e.preventDefault(); startEdit(); }}
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        style={{
          padding: '0 10px',
          height: '22px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          cursor: editing() ? 'text' : 'grab',
          color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
          background: isActive() ? 'var(--bg-section)' : 'transparent',
          border: isActive() ? '1px solid var(--border-medium)' : '1px solid transparent',
          'border-radius': 'var(--radius-md)',
          'user-select': 'none',
          'touch-action': 'none',
          'min-width': '58px',
          'max-width': '120px',
          'flex-shrink': '0',
          'font-size': '9px',
          'white-space': 'nowrap',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          position: 'relative',
          transition: 'color var(--transition-fast), background var(--transition-fast)',
        }}
      >
        <Show
          when={editing()}
          fallback={<span>{props.workspace.name}</span>}
        >
          <input
            autofocus
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={commitEdit}
            ref={(el) => {
              // select all text after mount so user can immediately type
              setTimeout(() => el?.select(), 0);
            }}
            style={{
              background: 'var(--bg-input, var(--bg-app))',
              border: '1px solid var(--accent-blue)',
              color: 'var(--text-primary)',
              'font-size': 'inherit',
              padding: '0 4px',
              width: '100%',
              outline: 'none',
              'border-radius': '2px',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </Show>
      </div>

      <Show when={menuPos()}>
        {(pos) => (
          <WorkspaceContextMenu
            workspaceId={props.workspace.id}
            x={pos().x}
            y={pos().y}
            onClose={closeMenu}
          />
        )}
      </Show>
    </>
  );
};
