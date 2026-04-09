import { onMount, onCleanup, type Component } from 'solid-js';
import { createDockview, type PanelComponent, type DockviewApi } from './solid-dockview';
import { applyDefaultLayout, saveLayout } from './defaultLayout';

// dockview CSS
import 'dockview-core/dist/styles/dockview.css';

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

    // Auto-save layout on changes
    const disposable = api.onDidLayoutChange(() => saveLayout(api));

    onCleanup(() => {
      disposable.dispose();
      api.dispose();
    });
  });

  return (
    <div
      ref={containerRef}
      class="erythos-dock"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  );
};

export default DockLayout;
