import { type Component } from 'solid-js';
import { currentWorkspace } from '../workspaceStore';
import { setCornerDragStore } from '../cornerDragStore';
import type { Corner, AreaTree } from '../areaTree';

const HIT_SIZE = 16;        // px — 可點擊區域總大小
const EDGE_RESERVE = 4;     // px — 內側避開 AreaSplitter 4px 中段

interface AreaCornerHandleProps {
  areaId: string;
  corner: Corner;
  areaRect: { left: number; top: number; width: number; height: number }; // px
  containerW: number;
  containerH: number;
}

export const AreaCornerHandle: Component<AreaCornerHandleProps> = (props) => {
  const hitStyle = () => {
    const base = {
      position: 'absolute' as const,
      width: `${HIT_SIZE - EDGE_RESERVE}px`,
      height: `${HIT_SIZE - EDGE_RESERVE}px`,
      'z-index': 9,            // 低於 AreaSplitter 的 10
      'touch-action': 'none' as const,
      cursor: 'crosshair',
    };
    switch (props.corner) {
      case 'tl': return { ...base, left: `${EDGE_RESERVE}px`, top: `${EDGE_RESERVE}px` };
      case 'tr': return { ...base, right: `${EDGE_RESERVE}px`, top: `${EDGE_RESERVE}px` };
      case 'bl': return { ...base, left: `${EDGE_RESERVE}px`, bottom: `${EDGE_RESERVE}px` };
      case 'br': return { ...base, right: `${EDGE_RESERVE}px`, bottom: `${EDGE_RESERVE}px` };
    }
  };

  const handlePointerDown = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const initialTree = currentWorkspace().grid as AreaTree;
    setCornerDragStore({
      phase: 'pending',
      srcAreaId: props.areaId,
      corner: props.corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      initialTree,
    });

    // Task 2 stub：pointerup 僅清 state，不做 preview / commit（Task 3 補）
    const onUp = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointerup', onUp);
      setCornerDragStore({ phase: 'idle' });
    };
    window.addEventListener('pointerup', onUp);
  };

  return <div style={hitStyle()} onPointerDown={handlePointerDown} />;
};
