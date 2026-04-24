# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #549：AreaShell editorType 改為 reactive derived，修復 split 後顯示 fallback

單檔局部修改：`src/app/AreaShell.tsx`。

root cause：`createSignal` initializer 只在 AreaShell mount 時 sample 一次 `currentWorkspace().editorTypes[props.areaId]`。Corner drag split 後，新 AreaShell 在 pointerup（`workspaceStore.editorTypes` 尚未寫入）之前就 mount，因此 signal 鎖成 fallback `'viewport'`，直到 reload 才正確。

fix：移除 `createSignal`，改用 reactive derived getter。

---

### 檔案：`src/app/AreaShell.tsx`（局部修改）

**Before（第 1–23 行）：**

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
```

**After（第 1–21 行）：**

```tsx
import { type Component, Show } from 'solid-js';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';

interface AreaShellProps {
  areaId: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const editorType = () => currentWorkspace().editorTypes[props.areaId] ?? 'viewport';

  const handleSetType = (nextId: string) => {
    mutate(s => updateCurrentWorkspace(s, {
      editorTypes: {
        ...currentWorkspace().editorTypes,
        [props.areaId]: nextId,
      },
    }));
  };

  const currentDef = () => editors.find(e => e.id === editorType());
```

其餘 JSX（第 26–41 行）不變：

```tsx
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

---

### 不要做的事
- 不改 `src/app/` 以外任何檔案
- 不保留 `setET`（已移除，若留著會出現 unused variable TS 錯誤）
- 不對 `Show when={currentDef()}` 的用法做任何修改（`currentDef` 已因呼叫 `editorType()` 而 reactive）
- 不加額外 `createEffect` 或手動 sync 邏輯

### build 驗證
```
npm run build
```

### 手動 QA 步驟

1. 清除 localStorage、reload 頁面
2. 從 properties panel 左上角（tl corner handle）拖曳進 properties 內部 → release（vertical split）
3. **預期**：split 後右半邊 area header 立即顯示 PROPERTIES，無需 reload（修前顯示 VIEWPORT）
4. 從 viewport panel 左上角往下拖（horizontal split）→ release
5. **預期**：兩邊均顯示 VIEWPORT（split 前後一致）
6. 點任一 area header 的 editor 切換選單，切換 editorType → **預期**：header 立即更新（handleSetType 仍可運作）

### Commit
```
[app] Fix: AreaShell editorType reactive derived (refs #549)
```

### 開 PR
```bash
gh pr create --base master --title "[app] Fix: AreaShell editorType reactive derived" --body "closes #549
refs #547"
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
