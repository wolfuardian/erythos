# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #530 — AreaTreeRenderer 渲染 + AreaShell props 重構

**Branch**: `feat/530-area-tree-renderer`
**Depends-on**: #529（`src/app/areaTree.ts` 已 merged，API 就位）

---

#### Step 2.1 — 改 `src/app/workspaceStore.ts`：preset creator 改用 areaTree

在檔案頂部 import 加：

```ts
import { createLayoutPresetTree, createDebugPresetTree, validateTree } from './areaTree';
```

把 `createLayoutPreset()` 改成：

```ts
export function createLayoutPreset(): Workspace {
  return {
    id: LAYOUT_PRESET_ID,
    name: 'Layout',
    grid: createLayoutPresetTree(),
    editorTypes: {
      'scene-tree': 'scene-tree',
      'viewport': 'viewport',
      'properties': 'properties',
    },
  };
}
```

把 `createDebugPreset()` 改成：

```ts
export function createDebugPreset(): Workspace {
  return {
    id: DEBUG_PRESET_ID,
    name: 'Debug',
    grid: createDebugPresetTree(),
    editorTypes: {
      'viewport': 'viewport',
      'environment': 'environment',
      'leaf': 'leaf',
    },
  };
}
```

---

#### Step 2.2 — 改 `src/app/workspaceStore.ts`：`loadStore()` 校驗邏輯

`loadStore()` 目前對每個 workspace 的 `.grid` 欄位沒有校驗。改為：解析成功後，對每個 workspace 的 `.grid` 用 `validateTree` 驗證；失敗就依 workspace id 換回 preset：

```ts
// 在 parsed.workspaces.length > 0 驗證通過後加：
const sanitizedWorkspaces = parsed.workspaces.map(w => {
  if (validateTree(w.grid)) return w;
  // validateTree 失敗 → 根據 id 決定 fallback
  if (w.id === LAYOUT_PRESET_ID) return createLayoutPreset();
  if (w.id === DEBUG_PRESET_ID)  return createDebugPreset();
  // 其他 workspace 重建為 blank（保留 id / name，但 grid 換新）
  return { ...createLayoutPreset(), id: w.id, name: w.name };
});
// 並把 parsed.workspaces 換成 sanitizedWorkspaces
return { ...parsed, workspaces: sanitizedWorkspaces };
```

Legacy migration 區塊（`LEGACY_KEY = 'erythos-layout-v2'`）：舊 Dockview JSON 無 `version: 2`，`validateTree` 一定失敗，直接強硬 reset：

```ts
// 把整段 legacy migration 換成：
try {
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw) {
    // Dockview JSON 無法轉換為 AreaTree，直接 reset
    localStorage.removeItem(LEGACY_KEY);
    const store: WorkspaceStore = {
      version: 1,
      currentWorkspaceId: LAYOUT_PRESET_ID,
      workspaces: [createLayoutPreset(), createDebugPreset()],
    };
    saveStore(store);
    return store;
  }
} catch { /* fall through */ }
```

---

#### Step 2.3 — 改 `src/app/AreaShell.tsx`

把 `interface AreaShellProps` 和組件從 Dockview `panel` prop 換為 `areaId`：

```tsx
import { type Component, Show, createSignal } from 'solid-js';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';

interface AreaShellProps {
  areaId: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const [editorType, setET] = createSignal(
    currentWorkspace().editorTypes[props.areaId] ?? 'viewport'
  );

  const handleSetType = (nextId: string) => {
    setET(nextId);
    mutate(s => updateCurrentWorkspace(s, {
      editorTypes: {
        ...currentWorkspace().editorTypes,
        [props.areaId]: nextId,
      },
    }));
  };

  const currentDef = () => editors.find(e => e.id === editorType());

  return (
    <AreaContext.Provider value={{
      id: props.areaId,
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

**注意**：`import type { DockviewPanelApi }` 這行要刪除；`props.panel.id` 和 `props.initialEditorType` 的所有引用一起清掉。

---

#### Step 2.4 — 新建 `src/app/layout/AreaTreeRenderer.tsx`

```tsx
import { type Component, createSignal, createEffect, onCleanup, onMount, For } from 'solid-js';
import { currentWorkspace, mutate, updateCurrentWorkspace } from '../workspaceStore';
import { AreaShell } from '../AreaShell';
import { validateTree, computeAreaRect, createLayoutPresetTree, type AreaTree } from '../areaTree';

export const AreaTreeRenderer: Component = () => {
  let containerRef!: HTMLDivElement;
  const [containerSize, setContainerSize] = createSignal({ w: 0, h: 0 });

  onMount(() => {
    const rect = containerRef.getBoundingClientRect();
    setContainerSize({ w: rect.width || 1920, h: rect.height || 1080 });

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  // 若 grid 不合法 → fallback preset（並寫回 store，修復污染狀態）
  createEffect(() => {
    const grid = currentWorkspace().grid;
    if (!validateTree(grid)) {
      mutate(s => updateCurrentWorkspace(s, { grid: createLayoutPresetTree() }));
    }
  });

  const tree = (): AreaTree => {
    const g = currentWorkspace().grid;
    return validateTree(g) ? g : createLayoutPresetTree();
  };

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
      {/* Splitter 在 Task 3 (#531) 加 */}
    </div>
  );
};
```

---

#### Step 2.5 — 改 `src/app/App.tsx`

移除 `COMPONENTS` 常數（`Object.fromEntries(editors.map(...))`）和 `DockLayout` import，改為：

```tsx
import { AreaTreeRenderer } from './layout/AreaTreeRenderer';
```

把 `<DockLayout components={COMPONENTS} />` 換成 `<AreaTreeRenderer />`。

同時移除：
- `import DockLayout from './layout/DockLayout'`
- `import type { PanelComponent } from './layout/solid-dockview'`
- `const COMPONENTS: Record<string, PanelComponent> = Object.fromEntries(...)`

`AreaShell` import 也可以移除（AreaShell 改由 AreaTreeRenderer 直接使用）。

---

#### Step 2.6 — 改 `src/app/layout/index.ts`

加上 barrel export（**不刪** DockLayout / solid-dockview / workspaceLayout 相關 export，Task 4 再刪）：

```ts
export { AreaTreeRenderer } from './AreaTreeRenderer';
```

---

#### Step 2.7 — Build 驗證

```bash
npm run build
```

build 必須零 TypeScript 錯誤、零 warning 才算過。

---

#### Step 2.8 — 手動 QA

1. 清 localStorage（DevTools → Application → Storage → Clear site data）
2. 重整頁面 → 看到 Layout 三欄（scene-tree / viewport / properties）
3. 切換到 Debug workspace → 看到正確佈局（viewport + environment + leaf）
4. 拖動瀏覽器視窗大小 → 三個 area 等比例縮放，無跑版
5. 切換 workspace 面板內容正確更換
6. 無拖曳分割功能（邊界是死的）是可接受的，Task 3 再加

---

#### 地雷提醒

- **AreaShell callsite 要一起清**：App.tsx 原有 HOC 用 `props.panel` → 改 `areaId` 後所有 `panel` 引用要清乾淨，否則 TS strict mode 會報錯
- **`currentWorkspace().editorTypes[props.areaId] ?? 'viewport'`**：這是 `createSignal` 的初始值（snapshot），不是 reactive 訂閱。若需要跨 workspace 切換後動態更新 editorType，可改用 `createMemo` 訂閱 `currentWorkspace()`；但 Task 2 骨幹已用 createSignal + handleSetType 維護本地 signal，維持原設計即可
- **validateTree 失敗 fallback**：`createEffect` 裡面 fallback 會觸發一次 re-render，但因為 `tree()` 函式是從 `currentWorkspace().grid` 動態讀，寫回 store 後下一個 tick 就合法了，不會無限迴圈
- **v2 版本判斷**：舊 Dockview JSON 沒有 `version` 欄位，`validateTree` 檢查 `version === 2` 就足夠判斷是否合法；不需另外寫 v1/v2 分支

---

#### Step 2.9 — 還原模組 CLAUDE.md

```bash
git checkout master -- src/app/CLAUDE.md
```

---

#### Step 2.10 — Commit + PR

Commit message：
```
[app] AreaTreeRenderer + AreaShell props 重構 (refs #530)
```

PR title：`[app] Wave 3-2: AreaTreeRenderer 渲染 + AreaShell props 重構`

PR body 加上：
```
Depends-on: #529
refs #459
```

關閉條件：`npm run build` 過 + 手動 QA Step 2.8 全過。

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局
- workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout / WorkspaceTabBar 皆訂 store signal

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
