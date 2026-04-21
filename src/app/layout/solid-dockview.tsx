import { render } from 'solid-js/web';
import type { Component } from 'solid-js';
import {
  DockviewComponent,
  type DockviewApi,
  type DockviewPanelApi,
} from 'dockview-core';

export type PanelComponent = Component<{ panel: DockviewPanelApi }>;

export interface DockviewOptions {
  parentElement: HTMLElement;
  components: Record<string, PanelComponent>;
}

export function createDockview(options: DockviewOptions): DockviewApi {
  const disposers = new Map<string, () => void>();

  const dockview = new DockviewComponent(options.parentElement, {
    theme: { name: 'erythos', className: 'dockview-theme-erythos' },
    disableDnd: true,
    createComponent(opts) {
      const Comp = options.components[opts.name];
      if (!Comp) throw new Error(`Unknown panel component: ${opts.name}`);

      const element = document.createElement('div');
      element.style.height = '100%';
      element.style.overflow = 'hidden';

      let panelId: string | undefined;

      return {
        element,
        init(params) {
          panelId = params.api.id;
          const dispose = render(() => <Comp panel={params.api} />, element);
          disposers.set(params.api.id, dispose);
        },
        dispose() {
          if (panelId) {
            disposers.get(panelId)?.();
            disposers.delete(panelId);
          }
        },
      };
    },
  });

  return dockview.api;
}

export type { DockviewApi, DockviewPanelApi };
