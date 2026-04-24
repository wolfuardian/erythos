# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #543：Wave 4-3 — corner drag preview + commit + cursor badge

修改 2 個檔案（局部修改）：
- `src/app/layout/AreaCornerHandle.tsx` — 取代 Task 2 的 stub，實作完整 handlePointerDown（含 pointermove / pointerup / keydown / pointercancel）
- `src/app/layout/AreaTreeRenderer.tsx` — `tree()` 讀 cornerDragStore previewTree、加 cursor badge overlay

---

### 檔案 1：`src/app/layout/AreaCornerHandle.tsx`（整檔覆寫）

完整 import 清單：

```tsx
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
            const previewTree = splitArea(
              initialTree, props.areaId, lockedAxis, ratio,
              `area-${Date.now()}`,
            );
            setCornerDragStore({ ...base, mode: 'split', splitRatio: ratio, previewTree });
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
      if (s.phase === 'active' && (s.mode === 'split' || s.mode === 'merge') && s.previewTree) {
        mutate(st => updateCurrentWorkspace(st, { grid: s.previewTree! }));
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
```

---

### 檔案 2：`src/app/layout/AreaTreeRenderer.tsx`（局部修改 — 2 處）

**Before → After（修改 1）：`tree()` 函式定義（L35-38）**

Before：
```tsx
  const tree = (): AreaTree => {
    const g = currentWorkspace().grid;
    return validateTree(g) ? g : createLayoutPresetTree();
  };
```

After：
```tsx
  const tree = (): AreaTree => {
    const s = cornerDragStore();
    if (s.phase === 'active' && s.previewTree) return s.previewTree;
    const g = currentWorkspace().grid;
    return validateTree(g) ? g : createLayoutPresetTree();
  };
```

**Before → After（修改 2）：container `<div>` 內部，`</For>` 結束後（目前 L85 `</div>` 關閉前）加 overlay `<Show>` 區塊**

Before（關閉 container 前）：
```tsx
      </For>
    </div>
  );
```

After：
```tsx
      </For>
      <Show when={cornerDragStore().phase === 'active'}>
        {() => {
          const s = cornerDragStore();
          if (s.phase !== 'active') return null;
          const label =
            s.mode === 'split' ? (s.axis === 'v' ? 'Split ▶' : 'Split ▼') :
            s.mode === 'merge' ? 'Merge →' :
            /* invalid */        "Can't do";
          const cursor =
            s.mode === 'split' ? (s.axis === 'v' ? 'ew-resize' : 'ns-resize') :
            s.mode === 'merge' ? 'move' :
            'not-allowed';
          return (
            <>
              <div style={{
                position: 'fixed', inset: '0', 'z-index': 20,
                cursor, 'pointer-events': 'none',
              }} />
              <div style={{
                position: 'fixed',
                left: `${s.cursorClientX + 12}px`,
                top: `${s.cursorClientY + 16}px`,
                padding: '4px 8px',
                'border-radius': '2px',
                background: 'rgba(0,0,0,0.85)',
                color: '#fff',
                'font-size': '11px',
                'z-index': 21,
                'pointer-events': 'none',
                'user-select': 'none',
              }}>{label}</div>
            </>
          );
        }}
      </Show>
    </div>
  );
```

**需補 import（AreaTreeRenderer.tsx 頂部）**

在既有 import 中補入：
```tsx
import { Show } from 'solid-js';                         // 若尚未 import Show
import { cornerDragStore } from '../cornerDragStore';
```

注意：`Show` 已在 L1 `solid-js` import 中補上；`cornerDragStore` 從 `'../cornerDragStore'` 引入。

---

### Cursor / Badge mapping table

| mode | axis | CSS cursor | badge label |
|------|------|-----------|-------------|
| split | v | `ew-resize` | `Split ▶` |
| split | h | `ns-resize` | `Split ▼` |
| merge | — | `move` | `Merge →` |
| invalid | — | `not-allowed` | `Can't do` |

---

### 不要做的事
- pointermove 不得 mutate workspaceStore（只寫 cornerDragStore.previewTree）
- axis lock 首次 > 5px 決定後鎖到 pointerup，不得每幀重判
- srcRect 用 `computeAreaRect(initialTree, srcId, 1, 1)` 取 normalized rect（containerW/H 傳 1）
- dst area 必須出現在 `getCornerNeighbors(initialTree, srcAreaId, corner)` 結果內才 merge，否則 invalid
- splitArea / mergeArea 拋錯 → mode='invalid' + console.error，不可讓錯誤冒泡 crash
- full-screen cursor overlay 必須 `pointer-events: none`，否則擋 pointermove
- cleanup 必須同時移除 move / up / key / pointercancel 全部 4 個 listener
- 不動 `src/app/workspaceStore.ts`、`src/app/AreaShell.tsx`、`src/app/App.tsx`

### 手動 QA Matrix

| Preset | 動作 | 預期 |
|--------|------|------|
| Layout | scene-tree tr corner 往 viewport 拖 | merge → viewport 消失、scene-tree 擴至 x=0.72；release 生效 |
| Layout | viewport tl corner 往內拖（axis='v' 超過 5px） | split 垂直、預覽即時、release 生效 |
| Layout | viewport tr corner 往外拖（拖進 scene-tree） | 先 split（cursor 在 viewport 內）→ 拖出到 scene-tree → merge preview 切換 |
| Debug | 4-way T-junction（viewport br）corner 啟動 | 依象限判定 src；拖進 env → merge；拖進 leaf → merge；拖回 viewport 中 → split |
| Debug | leaf tl corner 朝上拖 | 進 environment 或 viewport → merge；停在 leaf 內 → split 水平 |
| Any | pending 階段（< 5px）release | 無變化，回 idle |
| Any | active 拖到接近 MIN_AREA_PX 邊界 | mode='invalid'、not-allowed cursor、「Can't do」badge |
| Any | active 按 Esc | layout 不變、回 idle |
| Any | 連續 split 到深度 3+，再 merge 回去 | 拓樸正確恢復 |
| Blank | 單 area 任一 corner 拖 | 只能 split（無鄰居可 merge） |

### build 驗證
```
npm run build
npm run test
```

### Commit
```
[app] Wave 4-3: corner drag preview + commit + cursor badge (refs #543)
```

### 開 PR
```bash
gh pr create --base master --title "[app] Wave 4-3: corner drag preview + commit + cursor badge" --body "closes #543
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
