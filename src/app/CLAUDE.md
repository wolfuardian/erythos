# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #553：corner drag preview 新 area 繼承 src editor type

修改 3 個檔案（局部修改）：
- `src/app/cornerDragStore.ts`：active phase 加 `previewEditorTypes` 欄位
- `src/app/layout/AreaCornerHandle.tsx`：onMove split 分支在首次生成 newAreaId 時同步存入 previewEditorTypes
- `src/app/AreaShell.tsx`：editorType lookup 加 preview 優先邏輯

---

### 檔案 1：`src/app/cornerDragStore.ts`（局部修改）

**Before（active phase 型別）：**
```ts
  | {
      phase: 'active';
      srcAreaId: string;
      corner: Corner;
      mode: 'split' | 'merge' | 'invalid';
      axis?: 'h' | 'v';
      splitRatio?: number;
      dstAreaId?: string;
      newAreaId?: string;
      cursorClientX: number;
      cursorClientY: number;
      previewTree?: AreaTree;
      initialTree: AreaTree;
    };
```

**After（加 `previewEditorTypes` 欄位）：**
```ts
  | {
      phase: 'active';
      srcAreaId: string;
      corner: Corner;
      mode: 'split' | 'merge' | 'invalid';
      axis?: 'h' | 'v';
      splitRatio?: number;
      dstAreaId?: string;
      newAreaId?: string;
      cursorClientX: number;
      cursorClientY: number;
      previewTree?: AreaTree;
      previewEditorTypes?: Record<string, string>;
      initialTree: AreaTree;
    };
```

---

### 檔案 2：`src/app/layout/AreaCornerHandle.tsx`（局部修改）

只改 `onMove` 函式內 split 分支中「生成 newAreaId → setCornerDragStore」那段。

**Before（L110–L116，split 分支成功路徑）：**
```ts
          try {
            if (newAreaId === undefined) newAreaId = `area-${Date.now()}`;
            const previewTree = splitArea(
              initialTree, props.areaId, lockedAxis, ratio,
              newAreaId,
            );
            setCornerDragStore({ ...base, mode: 'split', splitRatio: ratio, previewTree, newAreaId });
```

**After（首次生成 newAreaId 時一起算 inherited type，存入 previewEditorTypes）：**
```ts
          try {
            if (newAreaId === undefined) newAreaId = `area-${Date.now()}`;
            const previewTree = splitArea(
              initialTree, props.areaId, lockedAxis, ratio,
              newAreaId,
            );
            const inherited = currentWorkspace().editorTypes[props.areaId] ?? 'viewport';
            const previewEditorTypes = { [newAreaId]: inherited };
            setCornerDragStore({ ...base, mode: 'split', splitRatio: ratio, previewTree, newAreaId, previewEditorTypes });
```

`return;` 和後續 catch 不變。

---

### 檔案 3：`src/app/AreaShell.tsx`（局部修改）

**Before（import 區段 + editorType 計算）：**
```ts
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
```

**After（加 cornerDragStore import，editorType 加 preview 優先）：**
```ts
import { type Component, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { editors } from './editors';
import { AreaContext } from './AreaContext';
import { currentWorkspace, mutate, updateCurrentWorkspace } from './workspaceStore';
import { cornerDragStore } from './cornerDragStore';

interface AreaShellProps {
  areaId: string;
}

export const AreaShell: Component<AreaShellProps> = (props) => {
  const editorType = () => {
    const drag = cornerDragStore();
    if (
      drag.phase === 'active' &&
      drag.previewEditorTypes &&
      drag.previewEditorTypes[props.areaId] !== undefined
    ) {
      return drag.previewEditorTypes[props.areaId];
    }
    return currentWorkspace().editorTypes[props.areaId] ?? 'viewport';
  };
```

其餘程式碼（`handleSetType`、`currentDef`、JSX）不變。

---

### 不要做的事
- 不修改 merge mode 路徑（merge 不 mount 新 area，不需 previewEditorTypes）
- 不修改 onUp commit 邏輯（#552 已處理）
- 不修改 `src/app/CLAUDE.md`「當前任務」以外的任何 section
- 不修改 `src/core/`、`src/viewport/`、`src/components/`、`src/panels/` 的任何檔案

### build 驗證
```
npm run build
npm run test
```

### 手動驗證步驟
1. clear localStorage、reload 頁面
2. 從 properties 面板（顯示 PROPERTIES 的 area）的 tl 角落慢慢往右拖 120px，**不要 release**
3. **預期**：preview 期間右半邊新 area 即時顯示 PROPERTIES（而非 VIEWPORT）
4. Release → commit，仍顯示 PROPERTIES
5. 再次拖曳拖到一半按 Esc 取消 → 無殘留 orphan state，UI 正常

### Commit
```
[app] Fix: corner drag preview 新 area 繼承 src editor type (refs #553)
```

### 開 PR
```bash
gh pr create --base master --title "[app] Fix: corner drag preview 新 area 繼承 src editor type" --body "closes #553
refs #552"
```

**開 PR 前還原 CLAUDE.md：**
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
