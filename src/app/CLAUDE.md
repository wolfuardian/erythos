# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #551：AreaShell `<Show>` children 不重跑導致 component swap 失敗

局部修改 `src/app/AreaShell.tsx`：import `Dynamic`，把 Show children 改為 `<Dynamic component={def().component} />`，移除中介變數 `const Comp`。

---

### 檔案：`src/app/AreaShell.tsx`（局部修改）

**Root cause**：SolidJS `<Show>` 預設 non-keyed。children function 只在 `when` 從 falsy → truthy 時 execute 一次。當 editorType 從 viewport 換 properties（兩邊都 truthy），children 不 re-run，`Comp` 永遠是最初 capture 的 `Viewport.component`，新的 component 永遠不渲染。

**Before**：

```tsx
import { type Component, Show } from 'solid-js';
// ...

<Show when={currentDef()}>
  {(def) => {
    const Comp = def().component;
    return <Comp />;
  }}
</Show>
```

**After**：

```tsx
import { type Component, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
// ...（其餘 import 不變）

<Show when={currentDef()}>
  {(def) => <Dynamic component={def().component} />}
</Show>
```

完整 after 檔案內容：

```tsx
import { type Component, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
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

  return (
    <AreaContext.Provider value={{
      id: props.areaId,
      get editorType() { return editorType(); },
      setEditorType: handleSetType,
    }}>
      <Show when={currentDef()}>
        {(def) => <Dynamic component={def().component} />}
      </Show>
    </AreaContext.Provider>
  );
};
```

**說明**：`def` 是 non-keyed Show 的 accessor function，`def().component` 在 `Dynamic` 的 `component` prop 內是 reactive expression，每次 signal 更新都會重新讀取，因此 `Dynamic` 能正確 swap component。若改用 `keyed` Show，則可寫 `def.component`（非 accessor），但 `Dynamic` 寫法更 idiomatic，不需改 Show 的 keyed 設定。

---

### 不要做的事
- 不要改 `src/app/` 以外的任何檔案
- 不要加 `keyed` prop 到 `<Show>`（`Dynamic` 寫法已足夠）
- 不要保留 `const Comp = def().component` 中介變數（此為 bug 根源）

### 驗證步驟

1. `npm run build` — 確認型別無誤
2. clear localStorage、reload 頁面
3. 從 properties area 的左上角 handle 向右拖曳約 120px（vertical split，產生新 area）
4. **預期**：split 後**立即**看到右半邊 header 是 PROPERTIES，不需 reload
5. 點新 area header 切換到 viewport editor → 應正確切換為 Viewport

### build 驗證
```
npm run build
```

### Commit
```
[app] Fix: AreaShell <Show> children use Dynamic (refs #551)
```

### 開 PR
```bash
gh pr create --base master --title "[app] Fix: AreaShell <Show> children use Dynamic" --body "closes #551
refs #549"
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
