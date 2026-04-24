import { type Component, createSignal, createEffect, onCleanup, onMount, For, Show, type Accessor } from 'solid-js';
import type { CornerDragPhase } from '../cornerDragStore';
import { currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';
import { AreaShell } from '../AreaShell';
import { validateTree, computeAreaRect, createLayoutPresetTree, getAllInternalEdges, type AreaTree } from '../areaTree';
import { AreaSplitter } from './AreaSplitter';
import { AreaCornerHandle } from './AreaCornerHandle';
import type { Corner } from '../areaTree';
import { cornerDragStore } from '../cornerDragStore';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

const DragOverlay: Component<{ store: Accessor<CornerDragPhase> }> = (props) => {
  const s = () => props.store();
  const label = () => {
    const st = s();
    if (st.phase !== 'active') return '';
    return st.mode === 'split' ? (st.axis === 'v' ? 'Split ▶' : 'Split ▼') :
           st.mode === 'merge' ? 'Merge →' :
           "Can't do";
  };
  const cursor = () => {
    const st = s();
    if (st.phase !== 'active') return 'default';
    return st.mode === 'split' ? (st.axis === 'v' ? 'ew-resize' : 'ns-resize') :
           st.mode === 'merge' ? 'move' :
           'not-allowed';
  };
  const badgeLeft = () => {
    const st = s();
    return st.phase === 'active' ? `${st.cursorClientX + 12}px` : '-9999px';
  };
  const badgeTop = () => {
    const st = s();
    return st.phase === 'active' ? `${st.cursorClientY + 16}px` : '-9999px';
  };
  return (
    <>
      <div style={{
        position: 'fixed', inset: '0', 'z-index': 20,
        cursor: cursor(), 'pointer-events': 'none',
      }} />
      <div style={{
        position: 'fixed',
        left: badgeLeft(),
        top: badgeTop(),
        padding: '4px 8px',
        'border-radius': '2px',
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        'font-size': '11px',
        'z-index': 21,
        'pointer-events': 'none',
        'user-select': 'none',
      }}>{label()}</div>
    </>
  );
};

export const AreaTreeRenderer: Component = () => {
  let containerRef!: HTMLDivElement;
  const [containerSize, setContainerSize] = createSignal({ w: 0, h: 0 });

  onMount(() => {
    const rect = containerRef.getBoundingClientRect();
    setContainerSize({ w: rect.width || 1920, h: rect.height || 1080 });

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  // 若 grid 不合法 → fallback preset（並寫回 store，修復污染狀態）
  createEffect(() => {
    const grid = currentWorkspace().grid;
    if (!validateTree(grid)) {
      mutate(s => updateCurrentWorkspace(s, { grid: createLayoutPresetTree() }));
    }
  });

  const tree = (): AreaTree => {
    const s = cornerDragStore();
    if (s.phase === 'active' && s.previewTree) return s.previewTree;
    const g = currentWorkspace().grid;
    return validateTree(g) ? g : createLayoutPresetTree();
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <For each={tree().areas}>
        {(area) => {
          const rect = () => computeAreaRect(tree(), area.id, containerSize().w, containerSize().h);
          return (
            <div
              style={{
                position: 'absolute',
                left: `${rect()?.left ?? 0}px`,
                top: `${rect()?.top ?? 0}px`,
                width: `${rect()?.width ?? 0}px`,
                height: `${rect()?.height ?? 0}px`,
                overflow: 'hidden',
              }}
            >
              <AreaShell areaId={area.id} />
              <For each={CORNERS}>
                {(corner) => (
                  <AreaCornerHandle
                    areaId={area.id}
                    corner={corner}
                    areaRect={rect()!}
                    containerW={containerSize().w}
                    containerH={containerSize().h}
                  />
                )}
              </For>
            </div>
          );
        }}
      </For>
      <For each={getAllInternalEdges(tree())}>
        {(edge) => (
          <AreaSplitter
            edge={edge}
            tree={tree()}
            containerW={containerSize().w}
            containerH={containerSize().h}
          />
        )}
      </For>
      <Show when={cornerDragStore().phase === 'active'}>
        <DragOverlay store={cornerDragStore as Accessor<CornerDragPhase>} />
      </Show>
    </div>
  );
};
