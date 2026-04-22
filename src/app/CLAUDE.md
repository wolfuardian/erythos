# App 模組

## 範圍限制
只能修改 src/app/ 底下的檔案。
不得修改 src/core/、src/viewport/、src/components/、src/panels/。

## 當前任務

> **本 task 例外允許修改 `src/panels/viewport/ViewportPanel.tsx`**（Task 2 跨目錄，plan 決議。`src/app/CLAUDE.md` 的「範圍限制」對本 task 不適用此檔案）。

### Issue: #513 — [app] Wave 2-2: viewportState camera snapshot 模組

**Branch**: `feat/513-viewport-state`
**Commit prefix**: `[app]`

### 目標
建立 `src/app/viewportState.ts`（module-level Map 儲存各 panelId 的 camera 位置快照），並在 `ViewportPanel.tsx` 的 mount/unmount 時串入 restore / save 邏輯，使 camera 位置在切換 editor type 離開再回來後保留。

### Files
- **Create**: `src/app/viewportState.ts`
- **Modify**: `src/panels/viewport/ViewportPanel.tsx`

### Step 1: 建 `src/app/viewportState.ts`

```ts
// src/app/viewportState.ts

export interface ViewportSnapshot {
  position: [number, number, number];
  target: [number, number, number];
}

const SNAPSHOTS = new Map<string, ViewportSnapshot>();

export function getSnapshot(panelId: string): ViewportSnapshot | undefined {
  return SNAPSHOTS.get(panelId);
}

export function setSnapshot(panelId: string, snap: ViewportSnapshot): void {
  SNAPSHOTS.set(panelId, snap);
}

export function clearSnapshot(panelId: string): void {
  SNAPSHOTS.delete(panelId);
}
```

### Step 2: 修改 `src/panels/viewport/ViewportPanel.tsx`

**2-A**: import 區塊末尾加：
```ts
import { useArea } from '../../app/AreaContext';
import { getSnapshot, setSnapshot } from '../../app/viewportState';
```

**2-B**: component body 頂層（`const bridge = useEditor()` 之後、所有 `onMount` 之前）加：
```ts
const area = useArea();
```
`useArea()` 必須在 component top-level 呼叫（SolidJS context hook 規則），不可放進 `onMount`。

**2-C** Restore：在 `viewport.mount(canvasRef)`（約 line 265）**之後**插入：
```ts
// Restore camera snapshot after mount (controls rebuilt by mount, so restore AFTER)
const panelId = area?.id;
if (panelId) {
  const snap = getSnapshot(panelId);
  if (snap) {
    viewport.cameraCtrl.camera.position.fromArray(snap.position);
    viewport.cameraCtrl.controls.target.fromArray(snap.target);
    viewport.cameraCtrl.controls.update();
  }
}
```
**關鍵**：restore 必須在 `viewport.mount(canvasRef)` 之後，因為 `CameraController.mount()` 會 `dispose()` 舊 controls 重建（`CameraController.ts` line 24-28）。放錯位置 target 會設在即將丟棄的 controls 上。

**2-D** Save：`onCleanup` 內 `viewport?.dispose()` 之前插入：
```ts
onCleanup(() => {
  // Save camera snapshot before disposing
  const panelId = area?.id;
  if (panelId && viewport) {
    setSnapshot(panelId, {
      position: viewport.cameraCtrl.camera.position.toArray() as [number, number, number],
      target: viewport.cameraCtrl.controls.target.toArray() as [number, number, number],
    });
  }
  viewport?.dispose();
  viewport = null;
});
```

**存取鏈**：`viewport.cameraCtrl` (`Viewport.ts:26`) → `.camera` (`CameraController.ts:5`) / `.controls` (`CameraController.ts:6`)。

### Step 3: Build 驗收
```bash
npm run build
```
TypeScript strict 必須零 error。

### Step 4: 手動 QA
Task 3 未 merge，無法跨 workspace 測。限 editor type 切換層級：
1. 開 app，開 Viewport
2. 旋轉 / 平移 camera 到非預設位置
3. Panel header 下拉切到 SceneTree（觸發 ViewportPanel onCleanup → save）
4. 切回 Viewport（觸發新 ViewportPanel onMount → restore）
5. 驗證 camera 位置保留、無 console error

### Step 5: Commit
```
[app] viewportState camera snapshot + ViewportPanel mount/unmount 串接 (refs #513)
```

### Step 6: PR
```bash
gh pr create --title "[app] Wave 2-2: viewportState camera snapshot 模組 (refs #513)" --body "## Summary

建立 \`src/app/viewportState.ts\` module-level Map 儲存各 panelId 的 camera position + target snapshot。在 \`ViewportPanel.tsx\` 的 mount（restore）與 onCleanup（save）串接。

## Changes
- Create \`src/app/viewportState.ts\`：\`getSnapshot\` / \`setSnapshot\` / \`clearSnapshot\`
- Modify \`src/panels/viewport/ViewportPanel.tsx\`：mount restore（\`viewport.mount()\` 之後）+ onCleanup save（\`dispose()\` 之前）

## Notes
- Restore 放在 \`viewport.mount(canvasRef)\` 之後，避開 CameraController.mount() 重建 controls 的問題
- 跨 workspace 完整 QA 待 Task 3 (DockLayout) merge 後驗證
- 不含 vitest（DOM + WebGL，現有 infra 無覆蓋）

refs #513"
```

## 慣例
- bridge.ts 負責將 core 事件轉為 SolidJS signal，供面板訂閱
- 不在 app 層寫業務邏輯，只做膠水和佈局

## 待修項（由主腦根據 QC issue 填寫）
<!-- 修完所有項目後 commit message 加上 refs #N，由主腦清除此區塊並送 QC 複審。 -->

## 上報區（供主腦 review）
<!-- Agent 在此記錄跨模組需求或發現 -->
