# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #516 — WorkspaceTab context menu + 雙擊改名

**Branch**: `feat/516-context-menu`
**Worktree**: `C:\z\erythos-516-context-menu`

---

#### 1. 新檔 `src/app/layout/WorkspaceContextMenu.tsx`

完整程式碼：

```tsx
import { type Component, Show, onMount, onCleanup } from 'solid-js';
import {
  store,
  mutate,
  deleteWorkspace,
  duplicateWorkspace,
  resetWorkspaceToPreset,
  isPresetId,
} from '../workspaceStore';

interface Props {
  workspaceId: string;
  x: number;
  y: number;
  onClose: () => void;
}

export const WorkspaceContextMenu: Component<Props> = (props) => {
  const canDelete = () => store().workspaces.length > 1;
  const canReset = () => isPresetId(props.workspaceId);

  const handle = (action: () => void) => {
    action();
    props.onClose();
  };

  onMount(() => {
    const close = () => props.onClose();
    window.addEventListener('click', close);
    onCleanup(() => window.removeEventListener('click', close));
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: `${props.y}px`,
        left: `${props.x}px`,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
        'z-index': '1000',
        'min-width': '160px',
        'border-radius': '4px',
        overflow: 'hidden',
      }}
    >
      <MenuItem
        label="Duplicate"
        onClick={() =>
          handle(() => mutate(s => duplicateWorkspace(s, props.workspaceId)))
        }
      />
      <Show when={canReset()}>
        <MenuItem
          label="Reset to default"
          onClick={() =>
            handle(() => mutate(s => resetWorkspaceToPreset(s, props.workspaceId)))
          }
        />
      </Show>
      <MenuItem
        label="Delete"
        disabled={!canDelete()}
        onClick={() =>
          handle(() => mutate(s => deleteWorkspace(s, props.workspaceId)))
        }
      />
    </div>
  );
};

const MenuItem: Component<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = (p) => (
  <div
    onClick={() => !p.disabled && p.onClick()}
    style={{
      padding: 'var(--space-sm) var(--space-md)',
      cursor: p.disabled ? 'default' : 'pointer',
      color: p.disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
      'user-select': 'none',
    }}
    onMouseEnter={(e) => {
      if (!p.disabled) {
        (e.currentTarget as HTMLDivElement).style.background =
          'var(--bg-hover, rgba(255,255,255,0.06))';
      }
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.background = '';
    }}
  >
    {p.label}
  </div>
);
```

---

#### 2. 改 `src/app/layout/WorkspaceTab.tsx`

整檔替換為：

```tsx
import {
  type Component,
  createSignal,
  Show,
} from 'solid-js';
import { store, mutate, setCurrent, renameWorkspace } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';
import { WorkspaceContextMenu } from './WorkspaceContextMenu';

interface Props {
  workspace: Workspace;
}

interface MenuPos {
  x: number;
  y: number;
}

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;

  // ── context menu ─────────────────────────────────────────
  const [menuPos, setMenuPos] = createSignal<MenuPos | null>(null);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setMenuPos(null);

  // ── inline rename ─────────────────────────────────────────
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal('');

  const startEdit = () => {
    setDraft(props.workspace.name);
    setEditing(true);
  };

  const commitEdit = () => {
    const name = draft().trim();
    if (name) {
      mutate(s => renameWorkspace(s, props.workspace.id, name));
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  return (
    <>
      <div
        onClick={() => !editing() && mutate(s => setCurrent(s, props.workspace.id))}
        onDblClick={(e) => { e.preventDefault(); startEdit(); }}
        onContextMenu={handleContextMenu}
        style={{
          padding: '0 var(--space-md)',
          height: '100%',
          display: 'flex',
          'align-items': 'center',
          cursor: 'pointer',
          color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
          background: isActive() ? 'var(--bg-app)' : 'transparent',
          'border-bottom': isActive()
            ? '2px solid var(--accent-blue)'
            : '2px solid transparent',
          'user-select': 'none',
          'min-width': '80px',
          position: 'relative',
        }}
      >
        <Show
          when={editing()}
          fallback={<span>{props.workspace.name}</span>}
        >
          <input
            autofocus
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={commitEdit}
            ref={(el) => {
              // select all text after mount so user can immediately type
              setTimeout(() => el?.select(), 0);
            }}
            style={{
              background: 'var(--bg-input, var(--bg-app))',
              border: '1px solid var(--accent-blue)',
              color: 'var(--text-primary)',
              'font-size': 'inherit',
              padding: '0 4px',
              width: '100%',
              outline: 'none',
              'border-radius': '2px',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </Show>
      </div>

      <Show when={menuPos()}>
        {(pos) => (
          <WorkspaceContextMenu
            workspaceId={props.workspace.id}
            x={pos().x}
            y={pos().y}
            onClose={closeMenu}
          />
        )}
      </Show>
    </>
  );
};
```

---

#### 3. 改 `src/app/layout/index.ts`

加入 `WorkspaceContextMenu` barrel export（追加一行）：

```ts
export { WorkspaceContextMenu } from './WorkspaceContextMenu';
```

現有 `index.ts` 末尾已有：
```ts
export { WorkspaceTab } from './WorkspaceTab';
```
在其後追加上面那行即可。

---

#### 4. Build + 手動 QA

```bash
npm run build
```

Build 過後瀏覽器手動 QA：

- 右鍵 Layout tab → 看到 Duplicate / Reset to default / Delete
- 右鍵自建 tab（非 preset id）→ 不顯示 Reset to default；或依 `Show when={canReset()}` 隱藏
- 只剩一個 tab 時 Delete 呈 disabled（`color: var(--text-disabled)`，點無效）
- 雙擊 tab → input 出現，全選文字，可改名：
  - Enter 確認 → tab 顯示新名稱
  - Esc 取消 → 名稱不變
  - 空字串 Enter / blur → 不改名（`if (name)` guard）
- Reset to default → Layout preset 的 grid 還原為預設佈局
- 點 context menu 外部任意處 → menu 收起

---

#### 5. 還原 CLAUDE.md

```bash
git checkout master -- src/app/CLAUDE.md
```

（開 PR 前必須執行，不讓當前任務 block 進入 diff）

---

#### 6. Commit + PR

```bash
git add src/app/layout/WorkspaceContextMenu.tsx src/app/layout/WorkspaceTab.tsx src/app/layout/index.ts
git commit -m "[app] WorkspaceTab context menu + 雙擊改名 (refs #516)"
```

```bash
gh pr create \
  --title "[app] Wave 2-5: WorkspaceTab context menu + 雙擊改名" \
  --body "$(cat <<'EOF'
## Summary
- 新增 `WorkspaceContextMenu.tsx`：固定定位 context menu，含 Duplicate / Reset to default（僅 preset）/ Delete（最後一個 disabled）
- 改 `WorkspaceTab.tsx`：右鍵彈 menu，雙擊進 inline edit（`<input>` + Enter/Esc/blur 處理），外部 click 自動關閉 menu
- 更新 `index.ts` barrel export

## Test plan
- [ ] `npm run build` 過
- [ ] 右鍵 Layout tab → Duplicate / Reset to default / Delete 顯示正確
- [ ] 右鍵自建 tab → Reset to default 不顯示
- [ ] 只剩一個 tab → Delete disabled
- [ ] 雙擊改名 Enter 確認 / Esc 取消 / 空字串不儲存
- [ ] Reset to default 還原 preset grid

closes #516
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
