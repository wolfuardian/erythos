import { type Component } from 'solid-js';
import { currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';
import { cornerDragStore, setCornerDragStore } from '../cornerDragStore';
import {
  computeAreaRect,
  getAreaAt,
  getCornerNeighbors,
  splitArea,
  mergeArea,
  canSplit,
  canMerge,
  type Corner,
  type AreaTree,
} from '../areaTree';

const HIT_SIZE = 16;        // px — 可點擊區域總大小
const EDGE_RESERVE = 4;     // px — 內側避開 AreaSplitter 4px 中段
const DRAG_THRESHOLD = 5;   // px

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
      'z-index': 9,
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
    const startClientX = e.clientX;
    const startClientY = e.clientY;

    setCornerDragStore({
      phase: 'pending',
      srcAreaId: props.areaId,
      corner: props.corner,
      startClientX,
      startClientY,
      initialTree,
    });

    let lockedAxis: 'h' | 'v' | undefined = undefined;
    let newAreaId: string | undefined = undefined;

    const cleanup = () => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointercancel', onCancel);
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      const dist = Math.hypot(dx, dy);

      if (dist < DRAG_THRESHOLD && lockedAxis === undefined) return;

      if (lockedAxis === undefined) {
        lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'v' : 'h';
      }

      const cx = ev.clientX / props.containerW;
      const cy = ev.clientY / props.containerH;
      const areaAtCursor = getAreaAt(initialTree, cx, cy);

      const base = {
        phase: 'active' as const,
        srcAreaId: props.areaId,
        corner: props.corner,
        cursorClientX: ev.clientX,
        cursorClientY: ev.clientY,
        initialTree,
        axis: lockedAxis,
      };

      if (areaAtCursor === props.areaId) {
        const srcRect = computeAreaRect(initialTree, props.areaId, 1, 1)!;
        const ratio = lockedAxis === 'v'
          ? (cx - srcRect.left) / srcRect.width
          : (cy - srcRect.top) / srcRect.height;
        const ok = canSplit(initialTree, props.areaId, lockedAxis, ratio,
                            props.containerW, props.containerH);
        if (ok) {
          try {
            if (newAreaId === undefined) newAreaId = `area-${Date.now()}`;
            const previewTree = splitArea(
              initialTree, props.areaId, lockedAxis, ratio,
              newAreaId,
            );
            setCornerDragStore({ ...base, mode: 'split', splitRatio: ratio, previewTree, newAreaId });
            return;
          } catch (err) {
            console.error('[corner-drag] splitArea failed', err);
            setCornerDragStore({ ...base, mode: 'invalid' });
            return;
          }
        }
        setCornerDragStore({ ...base, mode: 'invalid', splitRatio: ratio });
        return;
      }

      if (areaAtCursor) {
        const neighbors = getCornerNeighbors(initialTree, props.areaId, props.corner);
        const match = neighbors.find(n => n.neighborAreaId === areaAtCursor);
        if (match && canMerge(initialTree, props.areaId, areaAtCursor)) {
          try {
            const previewTree = mergeArea(initialTree, props.areaId, areaAtCursor);
            setCornerDragStore({ ...base, mode: 'merge', dstAreaId: areaAtCursor, previewTree });
            return;
          } catch (err) {
            console.error('[corner-drag] mergeArea failed', err);
            setCornerDragStore({ ...base, mode: 'invalid' });
            return;
          }
        }
      }

      setCornerDragStore({ ...base, mode: 'invalid' });
    };

    const onUp = () => {
      const s = cornerDragStore();
      if (s.phase === 'active' && s.previewTree) {
        if (s.mode === 'split' && s.newAreaId) {
          const { editorTypes } = currentWorkspace();
          const inherited = editorTypes[s.srcAreaId] ?? 'viewport';
          mutate(st => updateCurrentWorkspace(st, {
            grid: s.previewTree!,
            editorTypes: { ...editorTypes, [s.newAreaId!]: inherited },
          }));
        } else if (s.mode === 'merge' && s.dstAreaId) {
          const { editorTypes } = currentWorkspace();
          const { [s.dstAreaId]: _removed, ...remainingTypes } = editorTypes;
          mutate(st => updateCurrentWorkspace(st, {
            grid: s.previewTree!,
            editorTypes: remainingTypes,
          }));
        }
      }
      cleanup();
      setCornerDragStore({ phase: 'idle' });
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        // preview 未寫 workspaceStore，保守 rollback（no-op 但安全）
        mutate(st => updateCurrentWorkspace(st, { grid: initialTree }));
        cleanup();
        setCornerDragStore({ phase: 'idle' });
      }
    };

    const onCancel = () => {
      // pointercancel 視為 Esc（不 commit）
      mutate(st => updateCurrentWorkspace(st, { grid: initialTree }));
      cleanup();
      setCornerDragStore({ phase: 'idle' });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointercancel', onCancel);
  };

  return <div style={hitStyle()} onPointerDown={handlePointerDown} />;
};
