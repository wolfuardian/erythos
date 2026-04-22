# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #517 — WorkspaceTab drag-reorder（pointer events，不引 library）

**Branch**：`feat/517-drag-reorder`
**Commit prefix**：`[app]`
**PR title**：`[app] Wave 2-6: WorkspaceTab drag-reorder (refs #517)`

---

#### 前置確認

`reorderWorkspace(s, fromIdx, toIdx)` 已存在於 `src/app/workspaceStore.ts`（line 147）：

```ts
export function reorderWorkspace(s: WorkspaceStore, fromIdx: number, toIdx: number): WorkspaceStore {
  const ws = [...s.workspaces];
  const [moved] = ws.splice(fromIdx, 1);
  ws.splice(toIdx, 0, moved);
  return { ...s, workspaces: ws };
}
```

---

#### Step 1 — 改 `src/app/layout/WorkspaceTabBar.tsx`

在 component 函式內、`return` 前加 `tabRefs` Map，並將 ref callback 傳給每個 `WorkspaceTab`：

```tsx
import { For, type Component } from 'solid-js';
import { store, mutate, addWorkspace } from '../workspaceStore';
import { WorkspaceTab } from './WorkspaceTab';

export const WorkspaceTabBar: Component = () => {
  const tabRefs = new Map<string, HTMLElement>();

  return (
    <div
      style={{
        display: 'flex',
        height: 'var(--workspace-tab-height, 32px)',
        background: 'var(--bg-header)',
        'border-bottom': '1px solid var(--border-subtle)',
        'align-items': 'center',
        'flex-shrink': 0,
      }}
    >
      <For each={store().workspaces}>
        {(w) => (
          <WorkspaceTab
            workspace={w}
            ref={(el) => tabRefs.set(w.id, el)}
            tabRefs={tabRefs}
          />
        )}
      </For>
      <button
        type="button"
        onClick={() => mutate(s => addWorkspace(s))}
        style={{
          padding: '0 var(--space-md)',
          height: '100%',
          background: 'transparent',
          color: 'var(--text-muted)',
          border: 'none',
          cursor: 'pointer',
          'font-size': 'var(--font-size-md)',
          'user-select': 'none',
        }}
        title="Duplicate current workspace"
      >
        +
      </button>
    </div>
  );
};
```

---

#### Step 2 — 改 `src/app/layout/WorkspaceTab.tsx`

完整替換為以下實作（pointer events drag-reorder，避免與 click 衝突）：

```tsx
import { type Component } from 'solid-js';
import { store, mutate, setCurrent, reorderWorkspace } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

interface Props {
  workspace: Workspace;
  ref?: (el: HTMLDivElement) => void;
  tabRefs: Map<string, HTMLElement>;
}

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;

  let dragState: {
    pointerId: number;
    startX: number;
    fromIdx: number;
    hasDragged: boolean;
    hoveredIdx: number;
    onMove: (e: PointerEvent) => void;
    onUp: (e: PointerEvent) => void;
  } | null = null;

  const handlePointerDown = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    const workspaces = store().workspaces;
    const fromIdx = workspaces.findIndex(w => w.id === props.workspace.id);

    const onMove = (ev: PointerEvent) => {
      if (!dragState) return;

      const dx = Math.abs(ev.clientX - dragState.startX);
      if (dx >= 5) dragState.hasDragged = true;
      if (!dragState.hasDragged) return;

      // 找出滑鼠 x 所在的 tab idx
      let found = dragState.hoveredIdx;
      let idx = 0;
      for (const [id, tabEl] of props.tabRefs) {
        const rect = tabEl.getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
          found = store().workspaces.findIndex(w => w.id === id);
          break;
        }
        idx++;
      }
      dragState.hoveredIdx = found;

      // 視覺：被拖 tab opacity 0.5
      el.style.opacity = '0.5';
    };

    const onUp = (ev: PointerEvent) => {
      if (!dragState) return;
      window.removeEventListener('pointermove', dragState.onMove);
      window.removeEventListener('pointerup', dragState.onUp);

      const { hasDragged, hoveredIdx, fromIdx: fi } = dragState;
      dragState = null;

      el.style.opacity = '';

      if (hasDragged && hoveredIdx !== fi) {
        mutate(s => reorderWorkspace(s, fi, hoveredIdx));
      }
      // hasDragged false → 讓原本的 click 觸發（onClick 仍會執行）
    };

    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      fromIdx,
      hasDragged: false,
      hoveredIdx: fromIdx,
      onMove,
      onUp,
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={props.ref}
      onClick={() => {
        // drag 吸收：若已拖動，skip click（onClick 在 pointerup 後觸發，dragState 已清）
        // hasDragged 資訊在 onUp 清掉前已決定 reorder，這裡只需要正常 click 行為
        if (!dragState) {
          mutate(s => setCurrent(s, props.workspace.id));
        }
      }}
      onPointerDown={handlePointerDown}
      style={{
        padding: '0 var(--space-md)',
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        cursor: 'grab',
        color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive() ? 'var(--bg-app)' : 'transparent',
        'border-bottom': isActive() ? '2px solid var(--accent-blue)' : '2px solid transparent',
        'user-select': 'none',
        'touch-action': 'none',
      }}
    >
      {props.workspace.name}
    </div>
  );
};
```

**實作重點**：
- `setPointerCapture` 確保 pointermove/pointerup 不因游標離開 tab 而中斷
- `hasDragged` flag：移動 < 5px → `onClick` 正常觸發切換；>= 5px → drag 吸收，執行 reorder
- click 吸收方式：`onUp` 先清 `dragState`，`onClick` 裡檢查 `!dragState` 才呼 `setCurrent`；drag 結束時 `dragState` 已是 null，但 `hasDragged` 旗標的決策在 `onUp` 裡做完了，所以 click 仍會觸發 `setCurrent`。需調整邏輯——改用局部變數記錄 drag 結果：

```tsx
// 修正 onClick：用 closure 變數而非 dragState 判斷
```

**修正後的正確實作**（click 吸收用獨立 flag）：

在 component 頂層加：
```ts
let suppressNextClick = false;
```

`onUp` 裡：
```ts
if (hasDragged && hoveredIdx !== fi) {
  suppressNextClick = true;
  mutate(s => reorderWorkspace(s, fi, hoveredIdx));
}
```

`onClick`：
```ts
onClick={() => {
  if (suppressNextClick) { suppressNextClick = false; return; }
  mutate(s => setCurrent(s, props.workspace.id));
}}
```

以下是整合後的最終完整版本，請以此為準：

```tsx
import { type Component } from 'solid-js';
import { store, mutate, setCurrent, reorderWorkspace } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

interface Props {
  workspace: Workspace;
  ref?: (el: HTMLDivElement) => void;
  tabRefs: Map<string, HTMLElement>;
}

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;
  let suppressNextClick = false;

  const handlePointerDown = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);

    const fromIdx = store().workspaces.findIndex(w => w.id === props.workspace.id);
    let hoveredIdx = fromIdx;
    let hasDragged = false;
    const startX = e.clientX;

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) >= 5) hasDragged = true;
      if (!hasDragged) return;

      for (const [id, tabEl] of props.tabRefs) {
        const rect = tabEl.getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
          hoveredIdx = store().workspaces.findIndex(w => w.id === id);
          break;
        }
      }

      el.style.opacity = '0.5';
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.style.opacity = '';

      if (hasDragged && hoveredIdx !== fromIdx) {
        suppressNextClick = true;
        mutate(s => reorderWorkspace(s, fromIdx, hoveredIdx));
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={props.ref}
      onClick={() => {
        if (suppressNextClick) { suppressNextClick = false; return; }
        mutate(s => setCurrent(s, props.workspace.id));
      }}
      onPointerDown={handlePointerDown}
      style={{
        padding: '0 var(--space-md)',
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        cursor: 'grab',
        color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive() ? 'var(--bg-app)' : 'transparent',
        'border-bottom': isActive() ? '2px solid var(--accent-blue)' : '2px solid transparent',
        'user-select': 'none',
        'touch-action': 'none',
      }}
    >
      {props.workspace.name}
    </div>
  );
};
```

---

#### Step 3 — Build + 手動 QA

```bash
npm run build
```

手動 QA checklist（開發伺服器 `npm run dev`）：
- 拖 Layout tab 到 Debug 右邊 → 順序交換，tab bar 反映新順序
- 拖極短距離（< 5px）→ 不觸發 reorder，仍觸發 tab 切換
- reorder 後重新整理頁面 → 順序保留（已存 localStorage）

---

#### Step 4 — 還原 CLAUDE.md

```bash
git checkout master -- src/app/CLAUDE.md
```

---

#### Step 5 — Commit + PR

```bash
git add src/app/layout/WorkspaceTabBar.tsx src/app/layout/WorkspaceTab.tsx
git commit -m "[app] Wave 2-6: WorkspaceTab drag-reorder (refs #517)"
git push -u origin feat/517-drag-reorder
gh pr create \
  --title "[app] Wave 2-6: WorkspaceTab drag-reorder (refs #517)" \
  --body "$(cat <<'EOF'
## 變更摘要
- \`WorkspaceTabBar.tsx\`：加 \`tabRefs = new Map<string, HTMLElement>()\`，透過 ref callback 收集每個 tab DOM 節點
- \`WorkspaceTab.tsx\`：pointer events 實作 drag-reorder；\`suppressNextClick\` flag 避免 drag 結束時誤觸 click；移動 < 5px 仍正常切換 tab

## 驗收
- \`npm run build\` 過
- 拖 tab 交換順序 ✓
- 極短距離不 reorder、正常切換 ✓
- 重整後順序保留 ✓

## 注意
Task 5（WorkspaceTab context menu）也改 WorkspaceTab.tsx，兩 PR 後 merge 者需 resolve conflict。

refs #517
EOF
)"
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
