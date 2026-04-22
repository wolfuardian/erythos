# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

<!-- issue #532 | branch: feat/532-remove-dockview -->

### 目標
移除 dockview-core 所有相依（JS + CSS），刪除三個舊 layout 檔，更新 barrel export，清 theme.css dockview 段落，處理 Toolbar.tsx 的 `clearSavedLayout` 搬移。

### 掃描結果（AT 已確認的引用清單）

| 檔案 | 引用 | 處置 |
|------|------|------|
| `src/app/layout/DockLayout.tsx` | 整個檔案 | **刪除** |
| `src/app/layout/solid-dockview.tsx` | 整個檔案 | **刪除** |
| `src/app/layout/workspaceLayout.ts` | 整個檔案（`clearSavedLayout` 遷出後） | **刪除** |
| `src/app/layout/index.ts` | lines 3–7：DockLayout / solid-dockview / workspaceLayout export | **改寫** |
| `src/components/Toolbar.tsx` | line 7：`import { clearSavedLayout } from '../app/layout/workspaceLayout'` | **改 import 路徑** |
| `src/app/workspaceStore.ts` | line 8 comment `// Dockview toJSON()` | **改 comment** |
| `src/app/types.ts` | line 11 comment `目前從 Dockview panel.id 衍生` | **改 comment** |
| `src/styles/theme.css` | lines 191–295：整個 dockview theme 段落 | **刪除** |
| `package.json` | `dockview-core` dependency | **npm uninstall** |

---

### Step 4.1：搬移 `clearSavedLayout` 到 workspaceStore.ts

`workspaceLayout.ts` 要刪，但 `Toolbar.tsx`（scope 外）仍需 `clearSavedLayout`。解法：把函式移入 `src/app/workspaceStore.ts`。

在 `src/app/workspaceStore.ts` 尾端加：

```ts
/** Remove persisted workspace data so next reload starts fresh (Reset Layout button). */
export function clearSavedLayout(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  // also clear old pre-workspaceStore keys
  localStorage.removeItem('erythos-layout-v1');
  localStorage.removeItem('erythos-layout-v2');
}
```

注意：`STORAGE_KEY` 和 `LEGACY_KEY` 已在 workspaceStore.ts 定義，直接用。

---

### Step 4.2：改 `src/components/Toolbar.tsx` import

**Line 7**，把：
```ts
import { clearSavedLayout } from '../app/layout/workspaceLayout';
```
改成：
```ts
import { clearSavedLayout } from '../app/workspaceStore';
```

---

### Step 4.3：刪三個檔案

```bash
git rm src/app/layout/DockLayout.tsx
git rm src/app/layout/solid-dockview.tsx
git rm src/app/layout/workspaceLayout.ts
```

---

### Step 4.4：改 `src/app/layout/index.ts`

整個檔改成：

```ts
export { AreaTreeRenderer } from './AreaTreeRenderer';
export { AreaSplitter } from './AreaSplitter';
export { WorkspaceTabBar } from './WorkspaceTabBar';
export { WorkspaceTab } from './WorkspaceTab';
export { WorkspaceContextMenu } from './WorkspaceContextMenu';
```

（移除 lines 3–7：DockLayout / DockLayoutProps / createDockview / PanelComponent / DockviewApi / DockviewPanelApi / applyWorkspace / clearSavedLayout）

---

### Step 4.5：清 `src/styles/theme.css` dockview 段落

刪除 lines 191–295（從 `/* Dockview theme — … */` 到檔末）。

具體刪除區間（整段）：
```
/* Dockview theme — 對映到 Erythos token system，覆蓋 default themeAbyss */
.dockview-theme-erythos { ... }

.dockview-theme-erythos .dv-tabs-and-actions-container { ... }
.dockview-theme-erythos .dv-tabs-container { ... }
.dockview-theme-erythos .dv-tab.dv-active-tab { ... }
.dockview-theme-erythos .dv-tab.dv-inactive-tab { ... }
.dockview-theme-erythos .dv-tab.dv-inactive-tab:hover { ... }
.dockview-theme-erythos .dv-tab .dv-default-tab-action { ... }
.dockview-theme-erythos .dv-tab .dv-default-tab { ... }
```

也要刪 line 190（空行）+ line 191（comment）起到 line 295 EOF。

---

### Step 4.6：清 `src/app/workspaceStore.ts` comment（可選微修）

Line 8：
```ts
grid: unknown;                       // Dockview toJSON()
```
改成：
```ts
grid: unknown;                       // AreaTree（序列化為 JSON）
```

---

### Step 4.7：清 `src/app/types.ts` comment（可選微修）

Line 11：
```ts
id: string;          // 穩定 id，目前從 Dockview panel.id 衍生；未來 #465 會改成 UUID
```
改成：
```ts
id: string;          // 穩定 id（UUID），#465 追蹤
```

---

### Step 4.8：npm uninstall dockview-core

```bash
npm uninstall dockview-core
```

這會同時改 `package.json` + `package-lock.json`，兩者都要 commit。

---

### Step 4.9：驗證

```bash
grep -rn "dockview\|Dockview" src/
```
預期：零結果。

```bash
npm run build
```
預期：build 成功，無 TS 錯誤。

---

### Step 4.10：手動 QA

- 清 localStorage → 開 app → 行為與 Task 3 完成時一致
- DevTools Network tab 確認無 dockview JS 被載入

---

### Step 4.11：還原 CLAUDE.md + stage + commit

```bash
git checkout master -- src/app/CLAUDE.md
git add src/app/CLAUDE.md
```

（**必須 stage**，否則過去兩個 task 都踩過遺漏的坑）

---

### Step 4.12：Commit + PR

Stage 所有變更：
```bash
git add src/app/workspaceStore.ts
git add src/components/Toolbar.tsx
git add src/app/layout/index.ts
git add src/styles/theme.css
git add src/app/types.ts
git add package.json package-lock.json
git add src/app/CLAUDE.md
```

Commit message：
```
[app] 移除 dockview-core 相依 + 刪舊 DockLayout (refs #532)
```

PR：
```bash
gh pr create --title "[app] Wave 3-4: 移除 dockview-core 相依" \
  --body "$(cat <<'EOF'
## 變更摘要
- 刪 `DockLayout.tsx` / `solid-dockview.tsx` / `workspaceLayout.ts`
- `clearSavedLayout` 移入 `workspaceStore.ts`，Toolbar.tsx 更新 import
- `layout/index.ts` 移除 dockview 相關 barrel export
- `src/styles/theme.css` 刪除整段 dockview theme（原 lines 191–295）
- `npm uninstall dockview-core`（package.json + package-lock.json）

## 驗收
- `grep -rn "dockview\|Dockview" src/` 零結果
- `npm run build` 通過
- 手動 QA：app 行為同 Task 3；DevTools Network 無 dockview JS

Depends-on: #531
refs #532
EOF
)"
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局
- workspaceStore.ts 集中管 workspace / area / editorType 持久化；AreaShell / DockLayout / WorkspaceTabBar 皆訂 store signal

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
