# Project-Gated Editing Implementation Plan

> **Execution Note:** This project uses its own AT/AD/QC pipeline (see root `CLAUDE.md`). Each Task below maps to one GitHub issue + one PR. AH dispatches AT → AT writes the relevant module's `CLAUDE.md` 當前任務 block → AD implements in worktree → QC reviews → PM merges. Steps inside each task are guidance for AT; AT may further split into AD steps.

**Goal:** 廢除 toy mode：app 啟動進 Welcome screen，必須開 project 才能編輯；scene 從 project 目錄持久化；AutoSave 直寫 disk。

**Architecture:** App 層持有 `projectOpen` signal（不依賴 Editor）。`<Show when={projectOpen}>` 條件渲染 `<Welcome>` / `<EditorShell>`。Editor lazy instantiation：openProject 流程才 `new Editor()` + `init()` + 讀 `scenes/scene.erythos`。AutoSave 改 debounce 寫 `projectManager.writeFile`，localStorage 從 AutoSave 系統移除。

**Tech Stack:** TypeScript strict + SolidJS + Three.js + Dockview + File System Access API + vitest。

**Spec reference:** `docs/superpowers/specs/2026-04-27-project-gated-editing-design.md`

**Epic issue:** #613

---

## File Structure

**新增**：
- `src/app/Welcome.tsx` — 全螢幕入口（Recent / New / Add）

**修改**：
- `src/app/App.tsx` — 持 `projectOpen` signal、`openProject` / `closeProject` 操作、條件渲染 Welcome / EditorShell
- `src/app/EditorContext.tsx` — Provider 在 editor !== null 時才 wrap
- `src/core/Editor.ts` — `init()` 移除 restoreSnapshot 區段
- `src/core/scene/AutoSave.ts` — 重寫為純寫 disk + 加 `flushNow()` method
- `src/core/project/ProjectManager.ts` — 新增 `openHandle(handle)` method
- `src/components/Toolbar.tsx` — `handleSave` 改 immediate flush，砍瀏覽器下載 fallback
- `src/utils/gltfLoader.ts` — 移除 toy mode console.warn 分支
- `src/panels/project/ProjectPanel.tsx` — 砍 Hub mode `<Show fallback={...}>` 分支
- `src/panels/environment/EnvironmentPanel.tsx` — 砍 `<Show when={bridge.projectOpen()}>` gate
- `src/panels/viewport/ViewportPanel.tsx` — 加 SceneDocument 空時的 placeholder UI（γ 狀態）
- `src/app/bridge.ts` — `projectOpen` 仍保留為 panel 內訂閱用（不再是條件渲染的依據）
- `src/app/CLAUDE.md` — 慣例區塊加一行「Welcome.tsx 為入口元件，不依賴 Editor / EditorContext」
- `src/core/CLAUDE.md` — 慣例區塊加一行「AutoSave 寫 project file，不寫 localStorage」

**不變動**：
- `src/core/scene/SceneDocument.ts`
- `src/core/project/ProjectHandleStore.ts`
- `src/app/workspaceStore.ts`（grep 確認 Welcome.tsx 不 import 即可，無需改）

---

## Task 1: PR-A — App lazy init + Welcome 骨架

**GitHub issue**: `[app] Wave 5-1: App lazy init + Welcome screen 骨架`

**Files:**
- Create: `src/app/Welcome.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/EditorContext.tsx`
- Modify: `src/core/project/ProjectManager.ts`（新增 `openHandle` method）
- Modify: `src/app/CLAUDE.md`（一行慣例）

**Depends on:** 無
**Blocks:** Task 2, Task 3, Task 4

### 設計重點

App.tsx 的職責改變：從「啟動就創 Editor」變成「啟動只持 projectOpen 訊號 + 兩個操作（openProject / closeProject）」。Editor 與其衍生物（bridge / GridHelpers）由 openProject 流程懶建，closeProject 流程拆解。

**關鍵不變式**：
- Welcome 階段：`editor === null`、`bridge === null`、`projectOpen === false`
- EditorShell 階段：`editor !== null`、`bridge !== null`、`projectOpen === true`
- 兩階段切換之間沒有「半開」中間態

**暫保留**：本 task 不動 ProjectPanel Hub mode 分支（Task 2 才砍）。Welcome.tsx 的 UI 風格從 ProjectPanel Hub mode 複製樣式（不 import），確保兩者視覺接近。

### Welcome.tsx 骨幹

```tsx
import { type Component, createSignal, onMount, Show, For, createResource } from 'solid-js';
import { ProjectManager } from '../core/project/ProjectManager';
import type { ProjectEntry } from '../core/project/ProjectHandleStore';

interface Props {
  projectManager: ProjectManager;
  onOpenProject: (handle: FileSystemDirectoryHandle) => Promise<void>;
}

export const Welcome: Component<Props> = (props) => {
  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal('');
  const [parentHandle, setParentHandle] = createSignal<FileSystemDirectoryHandle | null>(null);
  const [errorMsg, setErrorMsg] = createSignal('');

  const refresh = async () => setRecentProjects(await props.projectManager.getRecentProjects());

  onMount(() => {
    void refresh();
    const unsub = props.projectManager.onChange(() => void refresh());
    return unsub;
  });

  const handleOpenRecent = async (id: string) => {
    const ok = await props.projectManager.openRecent(id);
    if (!ok) { setErrorMsg('Failed to open project (permission?)'); return; }
    const handle = (await props.projectManager.getRecentProjects()).find(e => e.id === id)?.handle;
    if (handle) await props.onOpenProject(handle);
  };

  const handleAdd = async () => {
    try {
      await props.projectManager.addFromDisk();
      await refresh();
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || String(e));
    }
  };

  const handlePickLocation = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setParentHandle(handle);
    } catch (e: any) {
      if (e.name !== 'AbortError') setErrorMsg(e.message || String(e));
    }
  };

  const handleCreate = async () => {
    const parent = parentHandle();
    if (!parent || !newName().trim()) return;
    try {
      await props.projectManager.createProject(newName().trim(), parent);
      await refresh();
      // Reopen the newly created project
      const list = await props.projectManager.getRecentProjects();
      const fresh = list.find(e => e.name === newName().trim());
      if (fresh) await handleOpenRecent(fresh.id);
      setShowCreate(false);
      setNewName('');
      setParentHandle(null);
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', 'align-items': 'center', 'justify-content': 'center',
      background: 'var(--bg-app)',
    }}>
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        'border-radius': 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        'min-width': '360px',
      }}>
        <h2 style={{ color: 'var(--text-primary)', 'margin-bottom': 'var(--space-md)' }}>Erythos</h2>
        <Show when={!showCreate()} fallback={
          <CreateProjectForm
            name={newName()}
            onName={setNewName}
            parentHandle={parentHandle()}
            onPickLocation={() => void handlePickLocation()}
            onCreate={() => void handleCreate()}
            onCancel={() => { setShowCreate(false); setNewName(''); setParentHandle(null); }}
          />
        }>
          <RecentList
            entries={recentProjects()}
            onOpen={(id) => void handleOpenRecent(id)}
          />
          <div style={{ display: 'flex', gap: 'var(--space-sm)', 'margin-top': 'var(--space-md)' }}>
            <button onClick={() => setShowCreate(true)}>+ New Project</button>
            <button onClick={() => void handleAdd()}>Open Folder…</button>
          </div>
        </Show>
        <Show when={errorMsg()}>
          <div style={{ color: 'var(--accent-red)', 'margin-top': 'var(--space-sm)' }}>{errorMsg()}</div>
        </Show>
      </div>
    </div>
  );
};

// RecentList / CreateProjectForm 為內部 sub-component，從 ProjectPanel.tsx Hub mode 複製樣式調整
```

**注意**：Welcome.tsx 不 import `EditorContext` / `useEditor` / `bridge`，純粹用 `props.projectManager` 介面。

### App.tsx 重寫骨幹

```tsx
import { type Component, createSignal, onCleanup, Show } from 'solid-js';
import { Editor } from '../core/Editor';
import { ProjectManager } from '../core/project/ProjectManager';
import { RemoveNodeCommand } from '../core/commands/RemoveNodeCommand';
import { createEditorBridge, type EditorBridge } from './bridge';
import { EditorProvider } from './EditorContext';
import { AreaTreeRenderer } from './layout/AreaTreeRenderer';
import { Toolbar } from '../components/Toolbar';
import { WorkspaceTabBar } from './layout/WorkspaceTabBar';
import { GridHelpers } from '../viewport/GridHelpers';
import { Welcome } from './Welcome';

const App: Component = () => {
  // Singleton ProjectManager — survives across project open/close
  const projectManager = new ProjectManager();

  const [editor, setEditor] = createSignal<Editor | null>(null);
  const [bridge, setBridge] = createSignal<EditorBridge | null>(null);
  const [projectOpen, setProjectOpen] = createSignal(false);
  let sharedGrid: GridHelpers | null = null;

  const openProject = async (handle: FileSystemDirectoryHandle) => {
    const e = new Editor(projectManager);   // ← Editor ctor 改吃外部 projectManager（見下）
    await e.init();
    await projectManager.openHandle(handle);

    // 嘗試載入既有 scene
    try {
      const sceneFile = await projectManager.readFile('scenes/scene.erythos');
      const text = await sceneFile.text();
      e.loadScene(JSON.parse(text));
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        console.warn('[App] Could not load scene.erythos:', err);
      }
      // 留 SceneDocument 空（γ 狀態）
    }

    // GridHelpers 在 editor 已建後才 attach
    sharedGrid = new GridHelpers();
    e.threeScene.add(sharedGrid.grid);
    e.threeScene.add(sharedGrid.axes);
    const sharedGridObjects = [sharedGrid.grid, sharedGrid.axes];

    const onSceneReplaced = () => {
      if (!sharedGrid) return;
      e.threeScene.add(sharedGrid.grid);
      e.threeScene.add(sharedGrid.axes);
    };
    e.sceneDocument.events.on('sceneReplaced', onSceneReplaced);

    const b = createEditorBridge(e, sharedGridObjects);

    // Keybindings
    e.keybindings.registerMany([
      { key: 'z', ctrl: true, action: () => e.undo(), description: 'Undo' },
      { key: 'y', ctrl: true, action: () => e.redo(), description: 'Redo' },
      { key: 'z', ctrl: true, shift: true, action: () => e.redo(), description: 'Redo (alt)' },
      { key: 'Delete', action: () => {
        const uuid = e.selection.primary;
        if (uuid) e.execute(new RemoveNodeCommand(e, uuid));
      }, description: 'Delete selected' },
      { key: 'w', action: () => e.setTransformMode('translate'), description: 'Translate mode' },
      { key: 'e', action: () => e.setTransformMode('rotate'), description: 'Rotate mode' },
      { key: 'r', action: () => e.setTransformMode('scale'), description: 'Scale mode' },
    ]);
    e.keybindings.attach();

    setEditor(e);
    setBridge(b);
    setProjectOpen(true);
  };

  const closeProject = async () => {
    const e = editor();
    const b = bridge();
    if (!e || !b) return;
    // Flush autosave 若有 pending
    await e.autosave?.flushNow().catch(() => undefined);
    setProjectOpen(false);
    b.dispose();
    sharedGrid?.dispose();
    sharedGrid = null;
    e.dispose();
    projectManager.close();
    setBridge(null);
    setEditor(null);
  };

  onCleanup(() => { void closeProject(); });

  return (
    <Show when={projectOpen() && editor() && bridge()} fallback={
      <Welcome projectManager={projectManager} onOpenProject={openProject} />
    }>
      <EditorProvider bridge={bridge()!}>
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', 'flex-direction': 'column',
          background: 'var(--bg-app)',
        }}>
          <Toolbar />
          <WorkspaceTabBar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <AreaTreeRenderer />
          </div>
          <StatusBar bridge={bridge()!} />
        </div>
      </EditorProvider>
    </Show>
  );
};

// StatusBar 從原 App.tsx 內聯抽出（顯示 Saving / Saved / Save failed）

export default App;
```

**Editor.ts 變化**：constructor 改吃外部 ProjectManager（避免 App / Editor 各自持一個）。

```ts
export class Editor {
  constructor(public readonly projectManager: ProjectManager) {
    this.scene = new Scene();
    // ... 其餘不變，刪除原本 this.projectManager = new ProjectManager()
  }
}
```

### ProjectManager.openHandle()

```ts
// 加在 ProjectManager.ts，把 openRecent / addFromDisk 共用邏輯抽出
async openHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  this._handle = handle;
  this._files = await this.collectFiles(handle);
  this.emit();
}
```

`openRecent` / `addFromDisk` 內部呼叫 `openHandle` 後再 saveProject。原本 `openRecent` 直接賦值 `this._handle` + `collectFiles`，重構後走 `openHandle`。

### EditorContext.tsx 變化

`EditorProvider` 不變（已有 `bridge` prop 注入）。但 App.tsx 用 `Show when` 包圍 `EditorProvider`，Welcome 階段不會渲染 Provider。`useEditor()` 不變（只在 EditorShell 子樹被呼叫）。

### Steps

- [ ] **Step 1.1**: 改 `Editor.ts` constructor 吃外部 `projectManager` 參數；刪內部 `new ProjectManager()`。檢查 `Editor.test.ts`（若有測 ctor）— 補測試構造參數。
- [ ] **Step 1.2**: 改 `ProjectManager.ts` 抽 `openHandle(handle)` method；`openRecent` / `addFromDisk` 改呼叫 `openHandle`。確認原本行為不變（測試或手動）。
- [ ] **Step 1.3**: 建 `Welcome.tsx` 與其內部 sub-component（`RecentList` / `CreateProjectForm`）。樣式從 `ProjectPanel.tsx` Hub mode 複製（**複製不 import**，因為 Task 2 會砍 ProjectPanel Hub mode）。
- [ ] **Step 1.4**: 重寫 `App.tsx` 依上方骨幹：`projectManager` 為 App-level singleton；`editor` / `bridge` / `projectOpen` 為 signal；`openProject` / `closeProject` async 操作；條件渲染 `<Welcome>` 或 `<EditorShell>`。
- [ ] **Step 1.5**: 把原 App.tsx 的 status bar 抽出成 `StatusBar` 元件（避免 App.tsx 太大）。可以放在 `App.tsx` 同檔內部 component 或抽 `src/app/StatusBar.tsx`。
- [ ] **Step 1.6**: grep 確認 `src/app/Welcome.tsx` 的 transitive import 不含 `workspaceStore.ts`（避免 Welcome 階段觸發 workspace 持久化）。若觸發 → 先處理（lazy import 或挪 init 到 EditorShell onMount）。
- [ ] **Step 1.7**: `npm run build` 過。
- [ ] **Step 1.8**: 手動 QA：
  - 開 app → 看到 Welcome 全螢幕，editor 未掛載（F12 看不到 dockview / panel）
  - 點 Open Recent / Add Folder → editor 出現，scene 從 disk 還原（若有 scene.erythos）
  - 沒 scene.erythos → editor 出現但 viewport 為空（γ 狀態 — placeholder UI 在 Task 4 才補，本 task 看到空白即可）
  - 在 ProjectPanel 點 Close project → 回 Welcome
  - 再開同一專案 → 編輯一下 → Close → 再開 → 編輯內容仍在（autosave 仍寫舊 localStorage key，本 task 不動）
- [ ] **Step 1.9**: Commit + PR（PR title `[app] Wave 5-1: App lazy init + Welcome screen 骨架 (refs #613)`）

**Commit message**:
```
[app] App lazy init + Welcome screen 骨架 (closes #<issue>)

App.tsx 改成持 projectOpen signal、條件渲染 Welcome / EditorShell。
Editor lazy instantiation：openProject 流程才 new + init + 讀 scenes/scene.erythos。
ProjectManager 加 openHandle method。
新增 Welcome.tsx（複用 ProjectPanel Hub 視覺，獨立檔不 import）。
本 PR 暫保留 ProjectPanel Hub mode 分支（PR-B 才砍）。
AutoSave 仍寫 localStorage 舊 key（PR-C 才改）。
toy mode fallback 仍存在（PR-C 才清）。
```

---

## Task 2: PR-B — ProjectPanel 收斂為 file browser

**GitHub issue**: `[prefab-panel] Wave 5-2: ProjectPanel 砍 Hub mode 分支`

> 註：ProjectPanel 在 `src/panels/project/`，但模組對照表把 prefab/project 都歸 prefab-panel commit 前綴。實際提交時看模組 CLAUDE.md，若獨立則用 `[project]`。

**Files:**
- Modify: `src/panels/project/ProjectPanel.tsx`

**Depends on:** Task 1（merged）
**Blocks:** 無（PR-C / PR-D 可並行）

### 設計重點

刪除 ProjectPanel.tsx 的 `<Show when={bridge.projectOpen()} fallback={...Hub...}>` 整個 fallback 分支（line ~237-460，~220 行）。假設 panel 只在 EditorShell 內掛載，`bridge.projectOpen()` 永遠為真。

刪除以下 unused state（Hub mode 專用）：
- `recentProjects`
- `showCreate`
- `closing`
- `newName`
- `parentHandle`
- `nameConflict` resource
- `handleAdd` / `handlePickLocation` / `handleCreate` / `handleOpenRecent`
- `formatDate`（若僅 Hub 用）

保留 Browser mode：file 列表、TYPE_META、drag/drop import、Close project 按鈕、Asset selection、`isDragOver`、`handleAssetsDrop`、`handleClose`。

### Steps

- [ ] **Step 2.1**: 開 `ProjectPanel.tsx`，刪 `<Show when={bridge.projectOpen()} fallback={ ... }>` 的 fallback 內容。把外層 `<Show>` 整個拿掉，直接渲染 Browser mode。
- [ ] **Step 2.2**: 刪 unused state / handler / sub-component（見上「設計重點」清單）。
- [ ] **Step 2.3**: 刪 unused import（`createResource` / `For`（若 Browser mode 不用）/ `ConfirmDialog`（若 Hub 專用） — grep 確認後刪）
- [ ] **Step 2.4**: `npm run build` 過。檢查 TypeScript 是否抱怨 unused vars 或 dead branch。
- [ ] **Step 2.5**: 手動 QA：
  - 開 project 後 ProjectPanel 顯示 file browser
  - 拖 GLB 進 panel 仍 import 正常
  - 點 Close project 按鈕仍能回 Welcome
- [ ] **Step 2.6**: Commit + PR（PR title `[prefab-panel] Wave 5-2: ProjectPanel 砍 Hub mode (refs #613)`）

**Commit message**:
```
[prefab-panel] ProjectPanel 收斂為 file browser (closes #<issue>)

刪除 Hub mode <Show fallback> 分支（~220 行）。
panel 假設 projectOpen 永遠 true（只在 EditorShell 內掛載）。
Welcome.tsx (Task 1 已交付) 已獨立提供 Recent / New / Add 入口。
```

---

## Task 3: PR-C — AutoSave 重寫為純寫 disk + 清 toy mode fallback

**GitHub issue**: `[core] Wave 5-3: AutoSave 寫 disk + 清 toy mode fallback`

**Files:**
- Modify: `src/core/scene/AutoSave.ts`（重寫）
- Modify: `src/core/Editor.ts`（init() 移除 restoreSnapshot）
- Modify: `src/components/Toolbar.tsx`（handleSave 改 immediate flush）
- Modify: `src/utils/gltfLoader.ts`（砍 console.warn 分支）
- Modify: `src/panels/environment/EnvironmentPanel.tsx`（砍 projectOpen gate）
- Modify: `src/core/scene/__tests__/AutoSave.test.ts`（重寫測試）
- Modify: `src/core/CLAUDE.md`（一行慣例）

**Depends on:** Task 1（merged）
**Blocks:** Task 4

### 設計重點

AutoSave 改為純寫 `<project>/scenes/scene.erythos`。localStorage 在 AutoSave 系統中完全消失。Save button 從「另一條 IO 路徑」變成「立即觸發 autosave」（debounce → 0）。

**autosaveStatusChanged event** 增加 `'error'` 狀態（status bar 顯示 Save failed）。

**Editor.init() 簡化**：移除「restore autosave snapshot」步驟。Scene 載入由 App.tsx openProject 流程負責。

### AutoSave.ts 重寫骨幹

```ts
import type { Editor } from '../Editor';

const DEBOUNCE_DELAY = 2000;

export class AutoSave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly schedule: () => void;

  constructor(private readonly editor: Editor) {
    this.schedule = () => this.scheduleSnapshot();
    editor.sceneDocument.events.on('nodeAdded', this.schedule);
    editor.sceneDocument.events.on('nodeRemoved', this.schedule);
    editor.sceneDocument.events.on('nodeChanged', this.schedule);
    editor.sceneDocument.events.on('sceneReplaced', this.schedule);
  }

  private scheduleSnapshot(): void {
    this.editor.events.emit('autosaveStatusChanged', 'pending');
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flushNow(); }, DEBOUNCE_DELAY);
  }

  /** Clear pending timer + 立刻同步寫入 */
  async flushNow(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const json = JSON.stringify(this.editor.sceneDocument.serialize());
    try {
      await this.editor.projectManager.writeFile('scenes/scene.erythos', json);
      this.editor.events.emit('autosaveStatusChanged', 'saved');
    } catch (err) {
      console.warn('[AutoSave] writeFile failed:', err);
      this.editor.events.emit('autosaveStatusChanged', 'error');
    }
  }

  dispose(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.editor.sceneDocument.events.off('nodeAdded', this.schedule);
    this.editor.sceneDocument.events.off('nodeRemoved', this.schedule);
    this.editor.sceneDocument.events.off('nodeChanged', this.schedule);
    this.editor.sceneDocument.events.off('sceneReplaced', this.schedule);
  }
}

// 移除 export：STORAGE_KEY / hasSnapshot / saveSnapshot / restoreSnapshot
```

### Editor.ts init() 簡化

移除 line 65-72 的 restoreSnapshot 區段：

```ts
async init(): Promise<void> {
  // 0. Restore prefab assets from IndexedDB
  const prefabAssets = await PrefabStore.getAll();
  for (const asset of prefabAssets) this._prefabAssets.set(asset.id, asset);

  // 1. Restore GLB buffers from IndexedDB
  await this.resourceCache.hydrate();

  // (移除 2. localStorage restoreSnapshot 區段)

  // 4. Start autosave listener
  this.autosave = new AutoSave(this);

  // 5. Notify bridge signals
  this.events.emit('prefabStoreChanged');
}
```

也刪 `import` 中的 `restoreSnapshot, STORAGE_KEY`（只留 `AutoSave`）。

### Toolbar.tsx handleSave 改寫

```tsx
const handleSave = async () => {
  try {
    await editor.autosave.flushNow();
  } catch (e: any) {
    setErrorTitle('Save Failed');
    setErrorMsg(e.message || String(e));
  }
};
```

刪 line 50-57 的瀏覽器下載 fallback 段。刪 `editor.projectManager.isOpen` 檢查（panel 永遠在 project 開啟下渲染）。

### gltfLoader.ts 簡化

```ts
export async function loadGLTFFromFile(file: File, editor: Editor): Promise<string> {
  const path = await editor.projectManager.importAsset(file);
  // ... 後續不變
}
```

刪 line 9-16 的 `if (editor.projectManager.isOpen) { ... } else { ... toy mode ... }`，直接走 importAsset 路徑。

### EnvironmentPanel.tsx 簡化

刪 line 95 的 `<Show when={bridge.projectOpen()}>` 包覆，直接渲染內容（保留 `bridge.projectFiles()` 訂閱即可）。

### AutoSave 測試重寫

移除原本針對 localStorage round-trip 的測試，改測：
- `scheduleSnapshot` 觸發後 debounce 內呼 `editor.projectManager.writeFile`
- `flushNow()` 立即呼 writeFile（無 debounce 等待）
- writeFile 拋例外時 emit `'error'` 狀態
- `dispose()` 清 timer + 解 listener

mock `editor.projectManager.writeFile`（vi.fn()）+ mock `editor.events.emit`。

### Steps

- [ ] **Step 3.1**: 重寫 `AutoSave.ts` 依上方骨幹。`STORAGE_KEY` / `saveSnapshot` / `restoreSnapshot` / `hasSnapshot` 全 export 移除。
- [ ] **Step 3.2**: 改 `Editor.ts::init()`，移除 line 65-72 的 restoreSnapshot 區段；移除 `restoreSnapshot, STORAGE_KEY` import。
- [ ] **Step 3.3**: 改 `Toolbar.tsx::handleSave`，改成呼 `editor.autosave.flushNow()`；刪瀏覽器下載 fallback 段；刪 `editor.projectManager.isOpen` 檢查。
- [ ] **Step 3.4**: 改 `gltfLoader.ts::loadGLTFFromFile`，刪 toy mode 分支，直接走 importAsset。
- [ ] **Step 3.5**: 改 `EnvironmentPanel.tsx`，刪 `<Show when={bridge.projectOpen()}>` 包覆。
- [ ] **Step 3.6**: 重寫 `AutoSave.test.ts`：mock projectManager.writeFile，測 schedule 觸發、flushNow、error emit、dispose。
- [ ] **Step 3.7**: 改 `src/core/CLAUDE.md` 慣例段加：「AutoSave 寫 project file (`scenes/scene.erythos`)，不寫 localStorage」。
- [ ] **Step 3.8**: `npm run build` 過。`npm run test -- AutoSave` 全過。
- [ ] **Step 3.9**: 手動 QA：
  - 編輯 scene → 2 秒後 status bar 顯示 Saved；查 `<project>/scenes/scene.erythos` 內容已更新（File Explorer / 終端）
  - 按 Save 按鈕 → 立即顯示 Saved，無 debounce 等待
  - 在 project 內拖 GLB → 仍能 import 並複製到 `models/`
  - F12 看 localStorage：`erythos-autosave-v3` 不會新增（舊資料若存在不會被讀）
  - Close project（autosave pending 中）→ flushNow 跑完才 dispose
- [ ] **Step 3.10**: Commit + PR（PR title `[core] Wave 5-3: AutoSave 寫 disk + 清 toy mode fallback (refs #613)`）

**Commit message（建議分多 commit）**:

Commit 1（AutoSave + Editor.init）:
```
[core] AutoSave 重寫為純寫 disk

- AutoSave class 改 debounce 寫 projectManager.writeFile('scenes/scene.erythos')
- 加 flushNow() method（Toolbar Save 用）
- autosaveStatusChanged 加 'error' 狀態
- 移除 STORAGE_KEY / saveSnapshot / restoreSnapshot / hasSnapshot 全部 export
- Editor.init() 移除 restoreSnapshot 區段（scene 載入交由 App.tsx openProject）
- 重寫 AutoSave.test.ts（mock projectManager.writeFile）
```

Commit 2（Toolbar / gltfLoader / EnvironmentPanel）:
```
[core] 清 toy mode fallback 分支

- Toolbar.handleSave 改呼 editor.autosave.flushNow()，刪瀏覽器下載 fallback
- gltfLoader.loadGLTFFromFile 刪 toy mode console.warn 分支，直接走 importAsset
- EnvironmentPanel 刪 <Show when={bridge.projectOpen()}> 包覆（panel 永遠在 project 開啟下）
- 更新 src/core/CLAUDE.md 慣例：AutoSave 寫 project file
```

兩 commit 進同一 PR，QC review scope 隔離乾淨（記憶 `feedback_split_commit_literal`）。

---

## Task 4: PR-D — γ 狀態 viewport placeholder

**GitHub issue**: `[viewport] Wave 5-4: γ 狀態 viewport empty placeholder + New Scene`

**Files:**
- Modify: `src/panels/viewport/ViewportPanel.tsx`

**Depends on:** Task 1（merged）、Task 3（merged，需要 flushNow / writeFile 流程定）
**Blocks:** 無

### 設計重點

當 SceneDocument 為空（`bridge.nodes().length === 0`）時，viewport 中央顯示 placeholder：

```
┌────────────────────────────────────┐
│         No scene loaded            │
│       [+ New Scene]                │
│       [📁 Open Scene…]  (disabled) │
└────────────────────────────────────┘
```

- **New Scene** → 觸發 `editor.autosave.flushNow()`（內存空 SceneDocument → 寫 `scene.erythos`）。實際上空 SceneDocument 可能本來就會 trigger autosave debounce；New Scene 按鈕作為使用者明確「我要建場景」的信號，立即 flush 落地。
- **Open Scene…** → 第一階段 disabled。Multi-scene 支援屬於 β（未來 issue）。
- Placeholder 只在 `bridge.projectOpen() === true && bridge.nodes().length === 0` 時顯示。一旦使用者開始添節點（SceneTree 加 cube 等），nodes 數 > 0，placeholder 自動消失。

### Placeholder UI 骨幹

```tsx
// 加在 ViewportPanel.tsx 的 viewport canvas 容器內，position: absolute 浮在 canvas 上方
<Show when={bridge.nodes().length === 0}>
  <div style={{
    position: 'absolute', inset: 0,
    display: 'flex', 'flex-direction': 'column',
    'align-items': 'center', 'justify-content': 'center',
    background: 'rgba(0,0,0,0.4)',
    color: 'var(--text-muted)',
    'pointer-events': 'auto',
    'z-index': 10,
  }}>
    <div style={{ 'margin-bottom': 'var(--space-md)', 'font-size': 'var(--font-size-lg)' }}>
      No scene loaded
    </div>
    <button
      onClick={() => void handleNewScene()}
      style={{
        background: 'var(--accent-blue)', color: '#fff', border: 'none',
        padding: '6px 14px', 'border-radius': 'var(--radius-sm)',
        cursor: 'pointer', 'margin-bottom': 'var(--space-sm)',
      }}
    >+ New Scene</button>
    <button
      disabled
      style={{
        background: 'var(--bg-section)', color: 'var(--text-disabled)',
        border: '1px solid var(--border-subtle)',
        padding: '6px 14px', 'border-radius': 'var(--radius-sm)',
        cursor: 'default',
      }}
      title="Multi-scene support coming soon"
    >📁 Open Scene…</button>
  </div>
</Show>
```

### handleNewScene

```tsx
const handleNewScene = async () => {
  // SceneDocument 已是空態（version: 1, nodes: []），不需 reset。
  // 立即 flushNow 把空 scene 落地到 disk
  await editor.autosave.flushNow();
};
```

注意：本 task 不刻意 clear SceneDocument（因為進 γ 狀態時就已是空）。如果 viewport 已有節點再點此按鈕（理論上 placeholder 不會出現），不會走到此路徑。

### Steps

- [ ] **Step 4.1**: 在 `ViewportPanel.tsx` 找 viewport canvas 容器（line ~mount 後的 div），加 `position: relative`（若沒）。
- [ ] **Step 4.2**: 在容器內加 `<Show when={bridge.nodes().length === 0}>` 包裹的 placeholder UI（依骨幹）。
- [ ] **Step 4.3**: 加 `handleNewScene` 函式（呼 `editor.autosave.flushNow()`）。
- [ ] **Step 4.4**: `npm run build` 過。
- [ ] **Step 4.5**: 手動 QA：
  - 開新建 project（無 scene.erythos） → viewport 顯示 placeholder
  - 點 + New Scene → status bar 顯示 Saved（empty scene 已寫 disk）
  - 在 SceneTree 加 cube → placeholder 自動消失
  - 切到既有 project（有 scene.erythos）→ scene 載入 → placeholder 不顯示
  - Open Scene… 按鈕 disabled，hover 顯示 tooltip「Multi-scene support coming soon」
- [ ] **Step 4.6**: Commit + PR（PR title `[viewport] Wave 5-4: γ 狀態 viewport placeholder (closes #613)`）

> **Closes #613**：本 PR 是 epic 最後一塊，可直接 close epic issue。

**Commit message**:
```
[viewport] γ 狀態 viewport placeholder (closes #<issue>, closes #613)

當 SceneDocument 為空時 viewport 顯示 No scene loaded + New Scene 按鈕。
+ New Scene 觸發 autosave.flushNow() 把空 scene 落地到 scene.erythos。
Open Scene… 第一階段 disabled（multi-scene 屬於 β，未來 issue）。
```

---

## 依賴關係總覽

```
Task 1 (PR-A: App lazy + Welcome)
   │
   ├──→ Task 2 (PR-B: ProjectPanel 收斂)
   │
   ├──→ Task 3 (PR-C: AutoSave + toy mode 清理) ──┐
   │                                              │
   └─────────────────────────────────────────────→ Task 4 (PR-D: γ placeholder)
```

- Task 1 merged 後，Task 2 / 3 可並行（不衝突檔案）
- Task 4 依賴 Task 1 + Task 3（需要 flushNow / writeFile 流程）

---

## 已知限制（本 plan 不解，spec out-of-scope）

1. **β · Multi-scene picker** — 同 project 多 scene 切換（Open Scene… 按鈕第一階段 disabled）
2. **Auto-resume project** — 啟動跳過 Welcome 直接進上次 project（spec 「方案 1 每次都 Welcome」明確排除）
3. **Welcome 視覺品牌設計** — Logo / 過場 / 美術細節（後續 issue）
4. **Scene 縮圖預覽** — Recent 列表縮圖（後續 issue）
5. **Save As… 多 scene 路徑** — 寫到 user 指定的另一條路徑（後續 issue）
6. **AutoSave error 狀態的 retry UI** — 顯示 Save failed 但無 retry 按鈕（後續 issue）
7. **LocalStorage 既有 `erythos-autosave-v3` key 清理** — 一次性 migration 在 release notes 提；不在 code 內處理舊資料

---

## 風險與緩解（從 spec 沿用 + plan 補充）

1. **EditorContext lifecycle 重構** — Task 1 的核心風險。緩解：Welcome 完全不 import `EditorContext` / `useEditor`（type-system + grep 雙重把關）。
2. **workspaceStore 持久化誤觸** — Task 1 Step 1.6 grep 確認，若觸發則挪 init 到 EditorShell `onMount`。
3. **GridHelpers / sharedGrid lifecycle** — Task 1 已將 GridHelpers 創建挪到 openProject 流程，closeProject 流程拆解。注意 `e.sceneDocument.events.on('sceneReplaced', onSceneReplaced)` 的 listener 也要在 closeProject 時 off。
4. **autosave 寫 disk 失敗** — Task 3 已加 'error' 狀態 + status bar 顯示。retry UI 屬於後續 issue。
5. **Editor `autosave!` definite assignment** — `init()` 前若有人呼叫 `editor.autosave` 會 runtime crash。Task 1 的 openProject 流程確保 `await editor.init()` 在使用 autosave 之前完成。AD 實作時加 defensive console.warn（如：`if (!this.autosave) { console.warn('[Editor] autosave not initialized'); return; }`）— 視 review 意見決定是否保留。
6. **Close project 時 pending autosave** — Task 1 已加 `await e.autosave?.flushNow().catch(() => undefined)`，避免閃退丟資料。
7. **Editor ctor 接受外部 ProjectManager 的測試影響** — Step 1.1 補測試構造參數。

---

## Commit message 慣例

- 一個 task = 一個 GitHub issue = 一個 PR（multi-commit OK）
- PR title 格式：`[模組] Wave 5-N: <短描述> (refs #613)` 或 `(closes #613)`（Task 4）
- Commit message 用 `[模組] <主題>`，body 描述 why + what
- 結尾 `(closes #<issue>)` 連動關閉本 task issue
- Co-Authored-By 行（與既有專案慣例一致）

---

## Self-review note

- 全部 spec section 都對應到 task：A · Welcome（Task 1）/ α · 自動載 scene（Task 1）/ 方案 1 每次都 Welcome（Task 1）/ γ 空編輯器（Task 4）/ Editor lazy（Task 1）/ Welcome 元件拆分（Task 1）/ ProjectPanel 收斂（Task 2）/ Toy mode 清理（Task 3）/ AutoSave 純寫 disk（Task 3）/ Save immediate flush（Task 3）。
- Type / method 名一致：`flushNow()`、`openHandle(handle)`、`projectManager.writeFile/readFile`、`autosaveStatusChanged` 'pending'/'saved'/'error' 三態，全 plan 統一。
- 無 placeholder：每個 step 有具體 code 或具體命令；風險章節的緩解都有 specific action。
