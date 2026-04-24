import { createSignal } from 'solid-js';
import type { AreaTree, Corner } from './areaTree';

export type CornerDragPhase =
  | { phase: 'idle' }
  | {
      phase: 'pending';
      srcAreaId: string;
      corner: Corner;
      startClientX: number;
      startClientY: number;
      initialTree: AreaTree;
    }
  | {
      phase: 'active';
      srcAreaId: string;
      corner: Corner;
      mode: 'split' | 'merge' | 'invalid';
      axis?: 'h' | 'v';
      splitRatio?: number;
      dstAreaId?: string;
      newAreaId?: string;
      cursorClientX: number;
      cursorClientY: number;
      previewTree?: AreaTree;
      initialTree: AreaTree;
    };

const [cornerDragStore, setCornerDragStore] = createSignal<CornerDragPhase>({ phase: 'idle' });

export { cornerDragStore, setCornerDragStore };
