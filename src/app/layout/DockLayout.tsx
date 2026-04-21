import { onMount, onCleanup, type Component } from 'solid-js';
import { createDockview, type PanelComponent, type DockviewApi } from './solid-dockview';
import { applyDefaultLayout, saveLayout } from './defaultLayout';
import { subscribe as subscribeEditorTypes } from '../editorTypeStore';

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

const DockLayout: Component<DockLayoutProps> = (props) => {
  let containerRef!: HTMLDivElement;

  onMount(() => {
    const api = createDockview({
      parentElement: containerRef,
      components: props.components,
    });

    applyDefaultLayout(api);
    props.onReady?.(api);

    const disposeLayout = api.onDidLayoutChange(() => saveLayout(api));
    const unsubscribeEditorTypes = subscribeEditorTypes(() => saveLayout(api));

    onCleanup(() => {
      disposeLayout.dispose();
      unsubscribeEditorTypes();
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
