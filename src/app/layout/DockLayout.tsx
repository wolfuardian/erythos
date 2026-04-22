import { onMount, onCleanup, createEffect, type Component } from 'solid-js';
import { createDockview, type PanelComponent, type DockviewApi } from './solid-dockview';
import { applyWorkspace } from './workspaceLayout';
import { store, currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';

// dockview CSS
import 'dockview-core/dist/styles/dockview.css';

// Hide dockview tab bar (AreaShell provides its own header + EditorSwitcher)
const DOCK_HIDE_TABS_CSS = `
.erythos-dock .dv-tabs-container,
.erythos-dock .dv-tabs-and-actions-container { display: none !important; }
`;

// Inject once
if (typeof document !== 'undefined') {
  const styleId = 'erythos-dock-hide-tabs';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = DOCK_HIDE_TABS_CSS;
    document.head.appendChild(style);
  }
}

export interface DockLayoutProps {
  components: Record<string, PanelComponent>;
  onReady?: (api: DockviewApi) => void;
}

const DEBOUNCE_MS = 300;

const DockLayout: Component<DockLayoutProps> = (props) => {
  let containerRef!: HTMLDivElement;

  onMount(() => {
    const api = createDockview({
      parentElement: containerRef,
      components: props.components,
    });

    applyWorkspace(api, currentWorkspace());
    props.onReady?.(api);

    let saveTimer: number | undefined;

    const scheduleSave = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        mutate(s => updateCurrentWorkspace(s, {
          grid: api.toJSON(),
        }));
      }, DEBOUNCE_MS);
    };

    const disposeLayout = api.onDidLayoutChange(scheduleSave);

    // 切 workspace → clear + apply
    let lastId = store().currentWorkspaceId;
    createEffect(() => {
      const id = store().currentWorkspaceId;
      if (id !== lastId) {
        lastId = id;
        api.clear();
        applyWorkspace(api, currentWorkspace());
      }
    });

    onCleanup(() => {
      window.clearTimeout(saveTimer);
      disposeLayout.dispose();
      api.dispose();
    });
  });

  return (
    <div
      ref={containerRef}
      class="erythos-dock"
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
};

export default DockLayout;
