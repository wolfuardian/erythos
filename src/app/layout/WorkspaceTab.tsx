import { type Component } from 'solid-js';
import { store, mutate, setCurrent, reorderWorkspace } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

interface Props {
  workspace: Workspace;
  ref?: (el: HTMLDivElement) => void;
  tabRefs: Map<string, HTMLElement>;
}

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;
  let suppressNextClick = false;

  const handlePointerDown = (e: PointerEvent) => {
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

  return (
    <div
      ref={props.ref}
      onClick={() => {
        if (suppressNextClick) { suppressNextClick = false; return; }
        mutate(s => setCurrent(s, props.workspace.id));
      }}
      onPointerDown={handlePointerDown}
      style={{
        padding: '0 var(--space-md)',
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        cursor: 'grab',
        color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive() ? 'var(--bg-app)' : 'transparent',
        'border-bottom': isActive() ? '2px solid var(--accent-blue)' : '2px solid transparent',
        'user-select': 'none',
        'touch-action': 'none',
      }}
    >
      {props.workspace.name}
    </div>
  );
};
