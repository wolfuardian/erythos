# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #542：Wave 4-2 cornerDragStore + AreaCornerHandle pointerdown

新增 2 個檔案、修改 2 個現有檔案。前置已 merged：Task 1 (#541, PR #544) — `src/app/areaTree.ts` 已有 `Corner` / `getAreaAt` / `getCornerAt` / `getCornerNeighbors` / `splitArea` / `mergeArea` / `canSplit` / `canMerge`。

---

### 檔案 1：`src/app/cornerDragStore.ts`（整檔新增）

```ts
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
      cursorClientX: number;
      cursorClientY: number;
      previewTree?: AreaTree;
      initialTree: AreaTree;
    };

const [cornerDragStore, setCornerDragStore] = createSignal<CornerDragPhase>({ phase: 'idle' });

export { cornerDragStore, setCornerDragStore };
```

---

### 檔案 2：`src/app/layout/AreaCornerHandle.tsx`（整檔新增）

```tsx
import { type Component } from 'solid-js';
import { currentWorkspace } from '../workspaceStore';
import { setCornerDragStore } from '../cornerDragStore';
import type { Corner } from '../areaTree';

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

    const initialTree = currentWorkspace().grid;
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
```

---

### 檔案 3：`src/app/layout/AreaTreeRenderer.tsx`（局部修改）

在原有 import 列末尾加：

```ts
import { For } from 'solid-js';   // 注意：For 已在第 1 行 import，無需重複加
import { AreaCornerHandle } from './AreaCornerHandle';
import type { Corner } from '../areaTree';
```

在檔案頂層（`export const AreaTreeRenderer` 函式外）加常數：

```ts
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];
```

在 area `<div>` 內 `<AreaShell areaId={area.id} />` 之後加 `<For>` handle 塊。完整 area 渲染 div 由：

```tsx
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
</div>
```

改為：

```tsx
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
```

import 行（第 1 行）`For` 已存在，只需在既有 import 後補：

```ts
import { AreaCornerHandle } from './AreaCornerHandle';
import type { Corner } from '../areaTree';
```

---

### 檔案 4：`src/app/layout/index.ts`（局部修改）

在現有 export 末尾加一行：

```ts
export { AreaCornerHandle } from './AreaCornerHandle';
```

---

### 不要做的事
- 不加 pointermove 處理（屬 Task 3）
- 不加 previewTree 邏輯、不讀 previewTree（屬 Task 3）
- 不加 Esc keydown 取消（屬 Task 3）
- 不修改 workspaceStore（preview 期間不寫 store，Task 3 才 commit）
- 不改 AreaShell.tsx / App.tsx / 其他非 Task 2 範圍的檔案
- z-index 不可 ≥ 10（必須低於 AreaSplitter 的 10，保 AreaSplitter 邊界拖曳優先）
- 4 個 handle 各自由各自的 area div 包著，不共用 vert 或共用 DOM 節點

### build 驗證
```
npm run build
```

### 手動 QA
1. Layout / Debug preset 任一 area 四個角落 hover → cursor 變 `crosshair`
2. pointerdown 任一 corner → 開 DevTools `cornerDragStore()` 看到 `{ phase: 'pending', srcAreaId: '...', corner: '...', startClientX: N, ... }`
3. pointerup → `cornerDragStore()` 回 `{ phase: 'idle' }`
4. AreaSplitter 邊界（垂直 / 水平分割線）拖曳 resize 仍正常（handle z-index 9 < splitter 10）

### Commit
```
[app] Wave 4-2: cornerDragStore + AreaCornerHandle pointerdown (refs #542)
```

### 開 PR
```bash
gh pr create --base master --title "[app] Wave 4-2: cornerDragStore + AreaCornerHandle pointerdown" --body "closes #542
refs #459"
```

**開 PR 前還原 CLAUDE.md**：
```bash
git checkout master -- src/app/CLAUDE.md
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局
- workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout / WorkspaceTabBar 皆訂 store signal

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
