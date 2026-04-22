# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #531 — [app] Wave 3-3: AreaSplitter pointer drag resize

**Branch**: `feat/531-area-splitter`
**Worktree**: `C:\z\erythos-531-area-splitter`

---

#### 背景

`areaTree.ts`（`getAllInternalEdges` / `resizeEdge`）與 `AreaTreeRenderer.tsx` 已 merged（Task 1 + 2）。Task 3 補齊 edge drag 拖曳 resize 互動。

---

#### 改動清單

**新檔 `src/app/layout/AreaSplitter.tsx`**

```tsx
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
```

**重點設計**：
- `setPointerCapture` 對 `e.currentTarget as HTMLElement`（非 `e.target`）
- `pointermove` / `pointerup` / `keydown` 全用 `window` global listener，避免滑出 splitter 失焦
- `onKey`（Escape）cleanup 同 `onUp`，三個 listener 一起清
- 每次 `onMove` 從 `initialTree` 算 `newRatio`，不從 current tree 累積
- 拖曳中 store 寫入約 60Hz，現實場景 OK，不加 throttle
- splitter re-render（props 變）不影響 closure 裡的 pointer state

---

**改 `src/app/layout/AreaTreeRenderer.tsx`**

在現有 `</For>` 之後、`</div>` 之前加第二個 `<For>`，並補齊 import：

```tsx
// 在檔案頂端 import 區補上：
import { getAllInternalEdges } from '../areaTree';
import { AreaSplitter } from './AreaSplitter';

// 在現有 <For each={tree().areas}>...</For> 之後加：
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
```

完整結構（`return` 內）：

```tsx
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
  </div>
);
```

---

**改 `src/app/layout/index.ts`**

加一行 export：

```ts
export { AreaSplitter } from './AreaSplitter';
```

---

#### Steps

- [ ] **Step 3.1**: 建 `src/app/layout/AreaSplitter.tsx`（完整骨幹如上）
- [ ] **Step 3.2**: 改 `src/app/layout/AreaTreeRenderer.tsx`：補 import + 加第二個 `<For>` 渲染 splitters
- [ ] **Step 3.3**: 改 `src/app/layout/index.ts`：加 `AreaSplitter` export
- [ ] **Step 3.4**: `npm run build` 過（型別驗證）
- [ ] **Step 3.5**: 手動 QA：
  - Layout 垂直拖曳：scene-tree / properties 寬度變化正常
  - **Debug 水平拖曳（y=0.6）→ viewport / env / leaf 三 area 高度同時改變（T-junction N=3 連動）**
  - 拖到 min-size（120px）停住，不能繼續壓縮
  - 拖動中按 Esc → 恢復起始佈局
  - 視窗 resize → area 與 splitter 位置/大小同步更新
  - Reload → 拖動後的佈局保留（持久化正常）
- [ ] **Step 3.6**: 還原 CLAUDE.md：`git checkout master -- src/app/CLAUDE.md`（**commit 前必做，否則 QC FAIL**）
- [ ] **Step 3.7**: Commit + PR

---

#### Commit 命令

```bash
git add src/app/layout/AreaSplitter.tsx src/app/layout/AreaTreeRenderer.tsx src/app/layout/index.ts
git commit -m "[app] AreaSplitter pointer drag resize (refs #531)"
```

#### PR 命令

```bash
gh pr create \
  --title "[app] Wave 3-3: AreaSplitter pointer drag resize (#531)" \
  --body "## Summary
- 新增 \`AreaSplitter.tsx\`：pointer drag 拖曳 edge resize，Esc 取消恢復 snapshot
- 改 \`AreaTreeRenderer.tsx\`：加第二個 \`<For getAllInternalEdges(tree())>\` 渲染 splitters
- 改 \`layout/index.ts\`：加 \`AreaSplitter\` barrel export

## Test plan
- [ ] npm run build 過
- [ ] Layout 垂直拖曳 scene-tree / properties 寬度
- [ ] Debug 水平拖曳 y=0.6 → viewport / env / leaf 三 area T-junction 連動
- [ ] 拖到 min-size (120px) 停住
- [ ] Esc 取消恢復起始位置
- [ ] 視窗 resize 後 splitter 位置同步
- [ ] Reload 保留拖動後狀態

Closes #531"
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局
- workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout / WorkspaceTabBar 皆訂 store signal

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
