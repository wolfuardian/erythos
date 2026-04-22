// src/app/layout/AreaSplitter.tsx
import { type Component } from 'solid-js';
import { mutate, updateCurrentWorkspace } from '../workspaceStore';
import { resizeEdge, type AreaTree, type ScreenEdge } from '../areaTree';

interface AreaSplitterProps {
  edge: ScreenEdge;
  tree: AreaTree;
  containerW: number;
  containerH: number;
}

const SPLITTER_SIZE = 4; // px

export const AreaSplitter: Component<AreaSplitterProps> = (props) => {
  const rect = () => {
    const vertA = props.tree.verts.find(v => v.id === props.edge.vertA)!;
    const vertB = props.tree.verts.find(v => v.id === props.edge.vertB)!;
    if (props.edge.orientation === 'v') {
      const x = vertA.x * props.containerW - SPLITTER_SIZE / 2;
      const yTop = Math.min(vertA.y, vertB.y) * props.containerH;
      const yBot = Math.max(vertA.y, vertB.y) * props.containerH;
      return { left: x, top: yTop, width: SPLITTER_SIZE, height: yBot - yTop };
    } else {
      const y = vertA.y * props.containerH - SPLITTER_SIZE / 2;
      const xLeft = Math.min(vertA.x, vertB.x) * props.containerW;
      const xRight = Math.max(vertA.x, vertB.x) * props.containerW;
      return { left: xLeft, top: y, width: xRight - xLeft, height: SPLITTER_SIZE };
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const vertical = props.edge.orientation === 'v';
    const containerSize = vertical ? props.containerW : props.containerH;
    const startVert = props.tree.verts.find(v => v.id === props.edge.vertA)!;
    const startRatio = vertical ? startVert.x : startVert.y;
    const startClient = vertical ? e.clientX : e.clientY;

    // snapshot for Esc（從 snapshot 算 newRatio，避免累積誤差）
    const initialTree = props.tree;

    const onMove = (ev: PointerEvent) => {
      const delta = vertical ? ev.clientX - startClient : ev.clientY - startClient;
      const newRatio = startRatio + delta / containerSize;
      mutate(s => updateCurrentWorkspace(s, {
        grid: resizeEdge(initialTree, props.edge.id, newRatio, containerSize),
      }));
    };

    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        mutate(s => updateCurrentWorkspace(s, { grid: initialTree }));
        onUp();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        position: 'absolute',
        left: `${rect().left}px`,
        top: `${rect().top}px`,
        width: `${rect().width}px`,
        height: `${rect().height}px`,
        cursor: props.edge.orientation === 'v' ? 'ew-resize' : 'ns-resize',
        'touch-action': 'none',
        'user-select': 'none',
        'z-index': 10,
      }}
    />
  );
};
