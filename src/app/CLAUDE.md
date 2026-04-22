# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #514 — DockLayout / AreaShell 串 workspaceStore（切 workspace 真換畫面）

**Branch**: `feat/514-docklayout-integration`
**Worktree**: `C:\z\erythos-514-docklayout-integration`

---

#### 檔案清單

| 操作 | 路徑 |
|------|------|
| 新增 | `src/app/layout/workspaceLayout.ts` |
| 修改 | `src/app/layout/DockLayout.tsx` |
| 修改 | `src/app/AreaShell.tsx` |
| 刪除 | `src/app/layout/defaultLayout.ts` |
| 刪除 | `src/app/editorTypeStore.ts` |
| 不動 | `src/app/App.tsx`（TabBar 插入留 Task 4） |

---

#### Step 1 — 新增 `src/app/layout/workspaceLayout.ts`

完整貼上（取代舊 `defaultLayout.ts` 角色，不保留舊檔）：

```ts
import type { DockviewApi } from 'dockview-core';
import { LAYOUT_PRESET_ID, DEBUG_PRESET_ID } from '../workspaceStore';
import type { Workspace } from '../workspaceStore';

export function applyWorkspace(api: DockviewApi, workspace: Workspace): void {
  if (
    workspace.grid &&
    typeof workspace.grid === 'object' &&
    Object.keys(workspace.grid as object).length > 0
  ) {
    try {
      api.fromJSON(workspace.grid as never);
      return;
    } catch {
      // fall through to preset-aware fallback
    }
  }
  applyPresetFallback(api, workspace.id);
}

function applyPresetFallback(api: DockviewApi, workspaceId: string): void {
  if (workspaceId === LAYOUT_PRESET_ID) {
    // Layout preset：3 欄（scene-tree 左 220 / viewport 中 / properties 右 280）
    const viewport = api.addPanel({
      id: 'viewport',
      component: 'viewport',
      title: 'Viewport',
    });
    api.addPanel({
      id: 'scene-tree',
      component: 'scene-tree',
      title: 'Scene',
      position: { referencePanel: viewport, direction: 'left' },
      initialWidth: 220,
    });
    api.addPanel({
      id: 'properties',
      component: 'properties',
      title: 'Properties',
      position: { referencePanel: viewport, direction: 'right' },
      initialWidth: 280,
    });
  } else if (workspaceId === DEBUG_PRESET_ID) {
    // Debug preset：viewport 中 / environment 右 300 / leaf 底 200
    const viewport = api.addPanel({
      id: 'viewport',
      component: 'viewport',
      title: 'Viewport',
    });
    api.addPanel({
      id: 'environment',
      component: 'environment',
      title: 'Environment',
      position: { referencePanel: viewport, direction: 'right' },
      initialWidth: 300,
    });
    api.addPanel({
      id: 'leaf',
      component: 'leaf',
      title: 'Leaf',
      position: { referencePanel: viewport, direction: 'below' },
      initialHeight: 200,
    });
  } else {
    // 使用者自建 workspace，grid 為空或損壞 → 單 viewport
    api.addPanel({
      id: 'viewport',
      component: 'viewport',
      title: 'Viewport',
    });
  }
}
```

---

#### Step 2 — 改寫 `src/app/layout/DockLayout.tsx`

完整貼上（取代舊內容）：

```tsx
import { onMount, onCleanup, createEffect, type Component } from 'solid-js';
import { createDockview, type PanelComponent, type DockviewApi } from './solid-dockview';
import { applyWorkspace } from './workspaceLayout';
import { store, currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';

// dockview CSS
import 'dockview-core/dist/styles/dockview.css';

// Hide dockview tab bar (AreaShell provides its own header + EditorSwitcher)
const DOCK_HIDE_TABS_CSS = `
.erythos-dock .dv-tabs-container,
.erythos-dock .dv-tabs-and-actions-container { display: none !important; }
`;

// Inject once
if (typeof document !== 'undefined') {
  const styleId = 'erythos-dock-hide-tabs';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = DOCK_HIDE_TABS_CSS;
    document.head.appendChild(style);
  }
}

export interface DockLayoutProps {
  components: Record<string, PanelComponent>;
  onReady?: (api: DockviewApi) => void;
}

const DEBOUNCE_MS = 300;

const DockLayout: Component<DockLayoutProps> = (props) => {
  let containerRef!: HTMLDivElement;

  onMount(() => {
    const api = createDockview({
      parentElement: containerRef,
      components: props.components,
    });

    applyWorkspace(api, currentWorkspace());
    props.onReady?.(api);

    let saveTimer: number | undefined;

    const scheduleSave = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        mutate(s => updateCurrentWorkspace(s, {
          grid: api.toJSON(),
        }));
      }, DEBOUNCE_MS);
    };

    const disposeLayout = api.onDidLayoutChange(scheduleSave);

    // 切 workspace → clear + apply
    let lastId = store().currentWorkspaceId;
    const stopEffect = createEffect(() => {
      const id = store().currentWorkspaceId;
      if (id !== lastId) {
        lastId = id;
        api.clear();
        applyWorkspace(api, currentWorkspace());
      }
    });

    onCleanup(() => {
      window.clearTimeout(saveTimer);
      disposeLayout.dispose();
      stopEffect?.();
      api.dispose();
    });
  });

  return (
    <div
      ref={containerRef}
      class="erythos-dock"
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
};

export default DockLayout;
```

**重點**：
- `createEffect` 在 `onMount` 內建立，SolidJS 規則允許（effect 在 reactive root 內即可）。`stopEffect` 是 `createEffect` 回傳的 dispose 函式，型別為 `() => void | undefined`；`onCleanup` 呼叫時加 `?.()` 保護。
- `editorTypes` 的 persist 移至 AreaShell（Step 3），此處 `scheduleSave` 只存 grid。

---

#### Step 3 — 改 `src/app/AreaShell.tsx`

精確改動位置如下。

**移除** import 行（第 5 行）：
```ts
import { getEditorType, setEditorType as persistType } from './editorTypeStore';
```

**新增** import（接在其他 import 後）：
```ts
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';
```

**改** `createSignal` 初始值（第 14–16 行）：

舊：
```ts
const [editorType, setET] = createSignal(
  getEditorType(props.panel.id) ?? props.initialEditorType
);
```

新：
```ts
const [editorType, setET] = createSignal(
  currentWorkspace().editorTypes[props.panel.id] ?? props.initialEditorType
);
```

**改** `handleSetType`（第 18–21 行）：

舊：
```ts
const handleSetType = (nextId: string) => {
  setET(nextId);
  persistType(props.panel.id, nextId);
};
```

新：
```ts
const handleSetType = (nextId: string) => {
  setET(nextId);
  const panelId = props.panel.id;
  mutate(s => updateCurrentWorkspace(s, {
    editorTypes: { ...currentWorkspace().editorTypes, [panelId]: nextId },
  }));
};
```

完整改後的 `AreaShell.tsx`（完整貼上確認無遺漏）：

```tsx
import { type Component, Show, createSignal } from 'solid-js';
import type { DockviewPanelApi } from './layout/solid-dockview';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';

interface AreaShellProps {
  panel: DockviewPanelApi;
  initialEditorType: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const [editorType, setET] = createSignal(
    currentWorkspace().editorTypes[props.panel.id] ?? props.initialEditorType
  );

  const handleSetType = (nextId: string) => {
    setET(nextId);
    const panelId = props.panel.id;
    mutate(s => updateCurrentWorkspace(s, {
      editorTypes: { ...currentWorkspace().editorTypes, [panelId]: nextId },
    }));
  };

  const currentDef = () => editors.find(e => e.id === editorType());

  return (
    <AreaContext.Provider value={{
      id: props.panel.id,
      get editorType() { return editorType(); },
      setEditorType: handleSetType,
    }}>
      <Show when={currentDef()}>
        {(def) => {
          const Comp = def().component;
          return <Comp />;
        }}
      </Show>
    </AreaContext.Provider>
  );
};
```

---

#### Step 4 — 刪除舊檔

```bash
rm src/app/layout/defaultLayout.ts
rm src/app/editorTypeStore.ts
```

---

#### Step 5 — 搜殘留引用

```bash
grep -rn "editorTypeStore\|defaultLayout" src/
```

若有殘留（預期只剩 plan/spec 文件，不在 `src/` 下），逐一修掉。

---

#### Step 6 — Build 驗證

```bash
npm run build
```

Build 必須 0 error 才繼續。

---

#### Step 7 — 手動 QA

1. `npm run dev` 啟動
2. 首次開啟 → 應看到 Layout preset 的 3 欄（scene-tree 左 / viewport 中 / properties 右）
3. 開 F12，執行：
   ```js
   // 取得 workspaceStore signal（module-level，需透過 app 暴露或直接 import）
   // 或用以下方式模擬切換：
   localStorage.setItem('erythos-workspaces-v1', JSON.stringify({
     version: 1,
     currentWorkspaceId: 'debug-preset',
     workspaces: [
       { id: 'layout-preset', name: 'Layout', grid: {}, editorTypes: {} },
       { id: 'debug-preset', name: 'Debug', grid: {}, editorTypes: {} }
     ]
   }));
   location.reload();
   ```
4. 重整後應看到 Debug preset 的 3 區（viewport 中 / environment 右 300 / leaf 底 200）
5. 確認 `grep -rn "editorTypeStore\|defaultLayout" src/` 只剩 plan/spec，無 TS 原始碼殘留

---

#### Step 8 — Commit 前還原 CLAUDE.md

**務必執行**（過去兩 task 都 QC FAIL 這點）：

```bash
git checkout master -- src/app/CLAUDE.md
```

注意：是 `master`，不是 `HEAD`。

---

#### Step 9 — Commit + PR

Commit message：
```
[app] DockLayout / AreaShell 串 workspaceStore，切 workspace 真換畫面 (refs #514)
```

PR 指令：
```bash
gh pr create \
  --title "[app] Wave 2-3: DockLayout / AreaShell 串 workspaceStore" \
  --body "$(cat <<'EOF'
## 變更摘要

- 新增 `workspaceLayout.ts`：`applyWorkspace` + `applyPresetFallback`（Layout / Debug / 自建三路）
- 改寫 `DockLayout.tsx`：onMount 套 workspace、onDidLayoutChange debounced 存 grid、createEffect 監 currentWorkspaceId 切換
- 改 `AreaShell.tsx`：初始 editorType 從 `currentWorkspace().editorTypes` 讀、setType 呼 `mutate(updateCurrentWorkspace)`
- 刪 `editorTypeStore.ts` 與 `defaultLayout.ts`

## QA

- [ ] `npm run build` 0 error
- [ ] 首次開啟顯示 Layout preset 3 欄
- [ ] 切到 debug-preset 顯示 Debug preset 3 區
- [ ] `grep -rn "editorTypeStore|defaultLayout" src/` 無 TS 殘留

refs #514
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
