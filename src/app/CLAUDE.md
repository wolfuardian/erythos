# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

### Issue #547：corner split/merge 漏維護 editorTypes

修改 2 個檔案（局部修改）：
- `src/app/cornerDragStore.ts`：active split phase 加 `newAreaId` 欄位
- `src/app/layout/AreaCornerHandle.tsx`：onMove 生成一次 newAreaId 重用 + onUp commit 加 editorTypes 維護

**背景**：Wave 4-3 corner drag commit 只更新 `grid`，未同步 `workspaceStore.editorTypes`，導致：
- Bug 1：split 後新 area 掉到 AreaShell fallback `'viewport'`（應繼承 srcAreaId 的 editorType）
- Bug 2：merge 後 dst area 的 editorTypes entry 殘留成 orphan（污染 store / localStorage）

`updateCurrentWorkspace` 是 **shallow merge**（`{ ...w, ...patch }`），傳 `{ editorTypes: newMap }` 即可覆蓋整個 map。

---

### 檔案 1：`src/app/cornerDragStore.ts`（局部修改）

active split phase 加 `newAreaId: string` 欄位。

**Before**：
```ts
| {
    phase: 'active';
    srcAreaId: string;
    corner: Corner;
    mode: 'split' | 'merge' | 'invalid';
    axis?: 'h' | 'v';
    splitRatio?: number;
    dstAreaId?: string;
    cursorClientX: number;
    cursorClientY: number;
    previewTree?: AreaTree;
    initialTree: AreaTree;
  };
```

**After**：
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

整檔其餘不變。

---

### 檔案 2：`src/app/layout/AreaCornerHandle.tsx`（局部修改，3 處）

#### 修改 1：lockedAxis 首次鎖定時生成 newAreaId（`onMove` 函式起頭）

**Before**：
```ts
let lockedAxis: 'h' | 'v' | undefined = undefined;
```

**After**：
```ts
let lockedAxis: 'h' | 'v' | undefined = undefined;
let newAreaId: string | undefined = undefined;
```

#### 修改 2：onMove 內 split mode — 生成 newAreaId 一次後重用

**Before**（`onMove` 內，split 成功分支）：
```ts
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
```

**After**：
```ts
if (areaAtCursor === props.areaId) {
  const srcRect = computeAreaRect(initialTree, props.areaId, 1, 1)!;
  const ratio = lockedAxis === 'v'
    ? (cx - srcRect.left) / srcRect.width
    : (cy - srcRect.top) / srcRect.height;
  const ok = canSplit(initialTree, props.areaId, lockedAxis, ratio,
                      props.containerW, props.containerH);
  if (ok) {
    try {
      if (newAreaId === undefined) newAreaId = `area-${Date.now()}`;
      const previewTree = splitArea(
        initialTree, props.areaId, lockedAxis, ratio,
        newAreaId,
      );
      setCornerDragStore({ ...base, mode: 'split', splitRatio: ratio, previewTree, newAreaId });
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
```

#### 修改 3：onUp — commit 時同步維護 editorTypes

**Before**：
```ts
const onUp = () => {
  const s = cornerDragStore();
  if (s.phase === 'active' && (s.mode === 'split' || s.mode === 'merge') && s.previewTree) {
    mutate(st => updateCurrentWorkspace(st, { grid: s.previewTree! }));
  }
  cleanup();
  setCornerDragStore({ phase: 'idle' });
};
```

**After**：
```ts
const onUp = () => {
  const s = cornerDragStore();
  if (s.phase === 'active' && s.previewTree) {
    if (s.mode === 'split' && s.newAreaId) {
      const { editorTypes } = currentWorkspace();
      const inherited = editorTypes[s.srcAreaId] ?? 'viewport';
      mutate(st => updateCurrentWorkspace(st, {
        grid: s.previewTree!,
        editorTypes: { ...editorTypes, [s.newAreaId!]: inherited },
      }));
    } else if (s.mode === 'merge' && s.dstAreaId) {
      const { editorTypes } = currentWorkspace();
      const { [s.dstAreaId]: _removed, ...remainingTypes } = editorTypes;
      mutate(st => updateCurrentWorkspace(st, {
        grid: s.previewTree!,
        editorTypes: remainingTypes,
      }));
    }
  }
  cleanup();
  setCornerDragStore({ phase: 'idle' });
};
```

---

### 不要做的事
- 不改 `areaTree.ts` 或任何 core/ 模組
- 不在 `pending` phase 加 `newAreaId`（pending 不需要）
- 不在 `onMove` 每 frame 重建 `newAreaId`（生成一次後重用，避免 Date.now() 每次不同）
- 不改 Escape / pointercancel 路徑（這兩條不 commit，editorTypes 不需改）
- 不改「範圍限制」/「慣例」/「待修項」/「上報區」等其他 section

### build 驗證
```
npm run build
```

手動 QA（build 過後在瀏覽器驗證）：
1. 拖角 split 一個 properties panel → 新區域應顯示 properties，不是 viewport fallback
2. 拖角 split 一個 scene-tree panel → 新區域應顯示 scene-tree
3. 拖角 merge 兩個 area → merge 後開 Solid DevTools 確認 `editorTypes` 無殘留 orphan key

### Commit
```
[app] Fix: corner split/merge editorTypes 同步 (refs #547)
```

### 開 PR
```bash
gh pr create --base master --title "[app] Fix: corner split/merge editorTypes 同步" --body "closes #547
refs #543"
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
