# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #515 — WorkspaceTabBar 切換 + 新增（Task 4）

**Branch**: `feat/515-tabbar-basic`  
**Worktree**: `C:\z\erythos-515-tabbar-basic`

#### 前提確認

`src/app/workspaceStore.ts` 已 merge，以下 API 可直接 import：
- `store` — SolidJS signal，回傳 `WorkspaceStore`
- `mutate(fn)` — 呼叫 pure function 更新並 persist
- `addWorkspace(s)` — 複製 current workspace，name 遞增，setCurrent 到新 id
- `setCurrent(s, id)` — 切換 currentWorkspaceId

#### 新檔 1：`src/app/layout/WorkspaceTab.tsx`

```tsx
import { type Component } from 'solid-js';
import { store, mutate, setCurrent } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

interface Props {
  workspace: Workspace;
}

export const WorkspaceTab: Component<Props> = (props) => {
  const isActive = () => store().currentWorkspaceId === props.workspace.id;

  return (
    <div
      onClick={() => mutate(s => setCurrent(s, props.workspace.id))}
      style={{
        padding: '0 var(--space-md)',
        height: '100%',
        display: 'flex',
        'align-items': 'center',
        cursor: 'pointer',
        color: isActive() ? 'var(--text-primary)' : 'var(--text-muted)',
        background: isActive() ? 'var(--bg-app)' : 'transparent',
        'border-bottom': isActive() ? '2px solid var(--accent-blue)' : '2px solid transparent',
        'user-select': 'none',
      }}
    >
      {props.workspace.name}
    </div>
  );
};
```

#### 新檔 2：`src/app/layout/WorkspaceTabBar.tsx`

```tsx
import { For, type Component } from 'solid-js';
import { store, mutate, addWorkspace } from '../workspaceStore';
import { WorkspaceTab } from './WorkspaceTab';

export const WorkspaceTabBar: Component = () => {
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
        {(w) => <WorkspaceTab workspace={w} />}
      </For>
      <button
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

#### 改 `src/app/App.tsx`

在 `<Toolbar />` 之後、`{/* Dock panels */}` 容器之前插入 `<WorkspaceTabBar />`。

**精確差分**：

1. 在 import 區末尾加：
```tsx
import { WorkspaceTabBar } from './layout/WorkspaceTabBar';
```

2. 在 JSX 中找到：
```tsx
        <Toolbar />

        {/* Dock panels */}
```
改成：
```tsx
        <Toolbar />
        <WorkspaceTabBar />

        {/* Dock panels */}
```

#### 改 `src/app/layout/index.ts`

在既有 export 末尾追加兩行：
```ts
export { WorkspaceTabBar } from './WorkspaceTabBar';
export { WorkspaceTab } from './WorkspaceTab';
```

#### Build 驗證

```bash
npm run build
```

期望：無 TypeScript 錯誤，無 build 失敗。

#### 手動 QA 步驟

1. `npm run dev`，開瀏覽器
2. Toolbar 下方應出現 32px 高 TabBar，顯示「Layout」「Debug」兩個 tab
3. 點 Debug tab → active 樣式切換（底線高亮）；若 Task 3 已整合 DockLayout，畫面佈局應同步切換
4. 點 `+` button → 新 tab 出現，名稱為 `Layout.001`（從 Layout 複製）
5. 再點 `+` → `Layout.002`，以此類推
6. 雙擊 tab 不應有任何效果（Task 5 才做）
7. 右鍵不應有 context menu（Task 5 才做）

#### 還原命令（PR 開完後執行）

```bash
git checkout master -- src/app/CLAUDE.md
```

**注意**：是 `master`，不是 `HEAD`。

#### Commit message

```
[app] WorkspaceTabBar 基本切換 + 新增 (refs #515)
```

#### PR 開法

```bash
gh pr create \
  --title "[app] Wave 2-4: WorkspaceTabBar 切換 + 新增 (refs #515)" \
  --body "## 變更摘要
- 新增 \`WorkspaceTab.tsx\`：點擊切換 workspace，active tab 底線高亮，CSS 變數配色
- 新增 \`WorkspaceTabBar.tsx\`：水平 tab 列 + 尾端 \`+\` button（呼 addWorkspace）
- 改 \`App.tsx\`：在 Toolbar 與 DockLayout 之間插入 \`<WorkspaceTabBar />\`
- 改 \`layout/index.ts\`：加 barrel export

## 不含（留後續 Task）
- 右鍵 context menu（Task 5）
- 雙擊改名（Task 5）
- drag-reorder（Task 6）

## 驗收
- \`npm run build\` 過
- 手動 QA：見 CLAUDE.md Task 4 QA 步驟

refs #515"
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
