# Project-Gated Editing — Design Spec

**Date**: 2026-04-27
**Status**: Draft (pending user approval)
**Scope**: 廢除 toy mode，App 啟動進 Welcome，必須開 project 才能編輯；scene 從 project 目錄持久化；AutoSave 直寫 disk

---

## 背景

目前架構：App 啟動 → `new Editor()` → 預設空 scene → 可編輯（toy mode）。Project 是擴充功能，autosave 寫 localStorage 全域 key。

問題：
1. Toy mode 與「project 為 source of truth」哲學衝突，gltfLoader / Toolbar 各有 fallback 分支，dead code 漂移風險。
2. Autosave 走 localStorage 全域 key，多 project 互相覆蓋。
3. `bridge.projectOpen` signal 已存在但只被零星使用，沒形成統一 gate。

目標：**設定 project 之前不能編輯，沒讀取 project 就沒場景可讀取**。Project 目錄 = scene 唯一持久層；localStorage 在 AutoSave 系統中完全消失。

---

## 範圍決策（brainstorm 結論）

| 項目 | 決策 |
|------|------|
| 入口形態 | **A · Welcome Screen** — 全螢幕入口，沒專案時 editor / dockview / panel 都不掛載 |
| 進專案後 | **α · 自動載最近 scene** — 從 `<project>/scenes/scene.erythos` 還原 |
| 啟動策略 | **方案 1 · 每次都 Welcome** — 不嘗試 auto-resume，啟動永遠進 Welcome |
| Scene 不存在 | **γ · 空編輯器** — Editor init 完成但 SceneDocument 空，viewport 顯示 New / Open Scene 入口 |
| Editor 生命週期 | **Lazy init** — Welcome 階段不創 Editor；project open 才 `new Editor()` + `await init()` |
| Welcome / ProjectPanel | **拆兩個獨立檔** — 新 `src/app/Welcome.tsx`（全螢幕），現有 `ProjectPanel.tsx` 收斂為 project-open file browser，刪 Hub mode 分支 |
| Toy mode fallback | **完全清乾淨** — `gltfLoader.ts` console.warn 分支、`Toolbar.tsx` 瀏覽器下載 fallback 全砍 |
| AutoSave 持久化 | **方案 B · 純寫 disk** — debounce 寫 `<project>/scenes/scene.erythos`；localStorage 在 AutoSave 中完全移除 |
| 手動 Save 語意 | **Immediate flush** — Save button 立即觸發 autosave（debounce → 0），不再走另一條 IO 路徑 |

---

## 整體架構

```
App.tsx
├─ <Show when={!projectOpen}>
│    <Welcome>                       ← 全螢幕，無 EditorContext、無 dockview
│      ProjectHub UI（Recent / New / Add）
└─ <Show when={projectOpen}>
     <EditorProvider bridge={bridge}>  ← bridge 在 project open 後才創建
       <EditorShell>
         <Toolbar />
         <WorkspaceTabBar />
         <AreaTreeRenderer />          ← Dockview / panels
         <StatusBar />
       </EditorShell>
     </EditorProvider>
```

`projectOpen` signal 是 App 層獨立持有的 `createSignal<boolean>`，**不依賴 Editor instance**（Editor 在 Welcome 階段不存在）。

---

## 啟動流程

```
[App 啟動]
   │
   ▼
[渲染 <Welcome>]
   │  讀 ProjectHandleStore.loadProjects() 顯示 Recent
   │  使用者操作：New / Open Recent / Add
   ▼
[onProjectOpened(handle)]
   │  1. new Editor()
   │  2. await editor.init()   ← prefab + GLB hydrate
   │  3. 嘗試讀 scenes/scene.erythos
   │     ├─ 成功 → editor.loadScene(parsed)
   │     └─ 失敗 (NotFoundError) → 留 SceneDocument 空 = γ 狀態
   │  4. createEditorBridge(editor) → 提供給 EditorProvider
   │  5. setProjectOpen(true)
   ▼
[渲染 <EditorShell>]
   │  ✓ 進入正常編輯流程
   │
   │  使用者按 Close project：
   ▼
[onProjectClosed]
   │  1. setProjectOpen(false)
   │  2. await editor.dispose()
   │  3. bridge.dispose()
   │  4. editor / bridge ref 清為 null
   ▼
[回 <Welcome>]
```

**關鍵不變式**：
- Welcome 階段：`editor === null`、`bridge === null`、`projectOpen === false`
- EditorShell 階段：`editor !== null`、`bridge !== null`、`projectOpen === true`
- 兩階段切換之間沒有「半開」中間態（同步 swap）

---

## 元件職責

### `src/app/App.tsx`（重寫）

- 持有 `projectOpen`、`editor`、`bridge` 三個 ref（用 `createSignal` / `Show`）
- 監聽 `editor.projectManager.onChange` 同步 `projectOpen`
- 提供 `openProject(handle)` / `closeProject()` 兩個操作
- 條件渲染 Welcome / EditorShell

### `src/app/Welcome.tsx`（新增）

- 從 `ProjectHandleStore.loadProjects()` 取 Recent
- UI 元素：Logo、Recent 列表、New Project 按鈕、Add Existing Folder 按鈕、New Project create form
- 使用者操作觸發 `props.onOpenProject(handle)` / `props.onCreateProject(name, parent)`
- **不持有 EditorContext**，純 SolidJS 元件 + ProjectManager 介面
- UI 結構複用既有 ProjectPanel Hub mode 的視覺（樣式 / 排版搬過來），但全螢幕 layout 不複用 PanelHeader chrome

### `src/panels/project/ProjectPanel.tsx`（縮減）

- **刪除** `<Show when={bridge.projectOpen()} fallback={...Hub mode...}>` 整個 fallback 分支
- 假設 `bridge.projectOpen() === true` 永遠成立（panel 只在 EditorShell 內掛載）
- 只保留 Browser mode：file 列表、TYPE_META、drag/drop import、Close project 按鈕、Asset selection
- 預估行數：641 → ~340

### `src/app/EditorContext.tsx`（重構）

- `EditorProvider` 變成只在 `editor !== null` 時 wrap children
- `useEditor()` 假設一定有 editor（於 EditorShell 內呼叫）
- Welcome 元件不應呼叫 `useEditor()`

### `src/core/Editor.ts`（修改）

`init()` 移除 autosave restore：

```ts
async init(): Promise<void> {
  await PrefabStore.getAll().then(assets => /* populate _prefabAssets */);
  await this.resourceCache.hydrate();
  this.autosave = new AutoSave(this);   // ← 不再 restoreSnapshot
  this.events.emit('prefabStoreChanged');
}
```

Scene 從 disk 載入由 `App.tsx` 在 `openProject` 流程中呼叫 `editor.loadScene(...)`，不在 `init()` 內隱式還原。

### `src/core/scene/AutoSave.ts`（重寫）

- 移除 `STORAGE_KEY`、`hasSnapshot`、`saveSnapshot`、`restoreSnapshot` 全部 export
- AutoSave 類別 schedule 改寫到 project file：

```ts
this.timer = setTimeout(async () => {
  this.timer = null;
  const json = JSON.stringify(this.editor.sceneDocument.serialize());
  try {
    await this.editor.projectManager.writeFile('scenes/scene.erythos', json);
    this.editor.events.emit('autosaveStatusChanged', 'saved');
  } catch (err) {
    console.warn('[AutoSave] writeFile failed:', err);
    this.editor.events.emit('autosaveStatusChanged', 'error');
  }
}, DEBOUNCE_DELAY);
```

- 保留 debounce 2 秒
- `autosaveStatusChanged` 多一個 `'error'` 狀態（status bar 顯示警示）
- 新增 `flushNow()` method：clear pending timer + 立刻同步寫一次

```ts
async flushNow(): Promise<void> {
  if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
  const json = JSON.stringify(this.editor.sceneDocument.serialize());
  await this.editor.projectManager.writeFile('scenes/scene.erythos', json);
  this.editor.events.emit('autosaveStatusChanged', 'saved');
}
```

### `src/components/Toolbar.tsx`（修改）

- `handleSave` 移除瀏覽器下載 fallback（line 50-57）
- `handleSave` 改成「立即 flush autosave」：呼叫 `editor.autosave.flushNow()` 觸發即時寫入（AutoSave 加新 method）
- `editor.projectManager.isOpen` 檢查可移除（Toolbar 只在 EditorShell 渲染，必為 true）

### `src/utils/gltfLoader.ts`（修改）

- 移除 line 12-16 的 toy mode 分支與 console.warn
- 直接 `path = await editor.projectManager.importAsset(file)`，假設 projectManager.isOpen 永遠為真

### `src/panels/environment/EnvironmentPanel.tsx`（簡化）

- `<Show when={bridge.projectOpen()}>` gate 可移除（panel 只在 EditorShell 渲染）

---

## Scene Loading 流程

### Project 開啟時

```ts
// App.tsx::openProject(handle)
const editor = new Editor();
await editor.init();
await editor.projectManager.openHandle(handle);   // 內部 setHandle + scan files

const sceneFile = await editor.projectManager
  .readFile('scenes/scene.erythos')
  .catch(() => null);

if (sceneFile) {
  const text = await sceneFile.text();
  editor.loadScene(JSON.parse(text));
}
// else: SceneDocument 維持空（γ 狀態）

const bridge = createEditorBridge(editor, sharedGridObjects);
setEditorRef(editor);
setBridgeRef(bridge);
setProjectOpen(true);
```

**ProjectManager 需要新增 method**：`openHandle(handle)` 把 `addFromDisk` / `openRecent` 共用的「設 handle + collectFiles + emit」抽出來，讓 App.tsx 在已有 handle 時直接設定。

### γ 狀態（無 scene）

`SceneDocument` 保持空 (`{ version: 1, nodes: [] }`)，Viewport 中央顯示 placeholder：

```
┌────────────────────────────────────┐
│                                    │
│         No scene loaded            │
│                                    │
│       [+ New Scene]                │
│       [📁 Open Scene…]             │
│                                    │
└────────────────────────────────────┘
```

- **New Scene** → 直接觸發 autosave（內存空 scene → 寫 `scenes/scene.erythos`）
- **Open Scene** → 開啟 file picker 從 project 內選別的 .erythos 檔（多 scene 支援屬於 β，未來 issue）

第一階段只做 New Scene；Open Scene 按鈕可先以 `disabled` 留 placeholder。

---

## Save / AutoSave / Manual Save 語意

| 動作 | 行為 |
|------|------|
| 編輯 scene（addNode 等） | 觸發 SceneDocument event → AutoSave schedule（debounce 2s）→ 寫 `scenes/scene.erythos` |
| Toolbar Save 按鈕 | `editor.autosave.flushNow()` — 立刻 clear timer + 同步寫 disk |
| Toolbar Save As… | （未來功能）寫到 user 指定的另一條路徑，目前不在範圍 |
| Close project | 等待 pending autosave flush（如有） → editor.dispose() |
| App 關閉前 | 不做特殊處理（debounce 2s 是已知 trade-off；崩潰最壞丟 2 秒） |

**關鍵**：scene = file 是單一 source of truth。autosave / manual save 只是「立即 vs 延遲」的時序差異，不是兩條獨立路徑。

---

## 邊界 / 邊緣案例

| 情境 | 處置 |
|------|------|
| Project 開啟時 `scenes/scene.erythos` 不存在 | γ 狀態（空 SceneDocument，viewport 顯示入口按鈕） |
| Project 開啟時 scene 檔損毀（JSON parse 失敗） | console.warn + γ 狀態（不阻擋使用者） |
| Project 開啟時 scene 檔 `version !== 1` | console.warn + γ 狀態 |
| AutoSave 寫入失敗（disk 滿 / 權限失效） | `autosaveStatusChanged` emit `'error'`，status bar 顯示「Save failed」標示，不阻擋編輯 |
| Project 在編輯中被 OS 層刪除 | autosave write 會失敗 → 顯示 error 狀態；下次 open 顯示 Welcome |
| 切換 project（Close → Open 另一個） | 同步 swap，避免「兩個 Editor 並存」狀態；Close 流程須確保 autosave flush 完成 |
| 第一次新建 project | `createProject` 完成 → 自動進入該 project（即觸發 onProjectOpened）；scene 檔不存在 → γ |
| Close project 時有 pending autosave | `editor.autosave.flushNow()` 等待寫完再 dispose |

---

## 風險與緩解

1. **EditorContext lifecycle 重構** — 現在 panel 普遍假設 `useEditor()` 永遠回傳 editor。Welcome 不該呼叫；EditorShell 內可呼叫。**緩解**：Welcome 與 EditorShell 兩棵子樹完全分離，Welcome 不 import `useEditor`，type-system 可在 build time 攔到誤用。

2. **`workspaceStore` 持久化** — 目前在 module 載入時就讀 localStorage 還原 workspace tree。Welcome 階段是否會被誤觸（Welcome 不 import workspaceStore 即安全）。**緩解**：plan 階段先 grep 確認 Welcome.tsx 的 transitive import 不含 workspaceStore；若不含則 OK；若含則挪初始化到 EditorShell `onMount`。具體方案 plan 階段定。

3. **`GridHelpers` / `sharedGrid`** — 目前在 App.tsx 頂層創建並掛 `editor.threeScene`。Editor lazy init 後要移到 EditorShell。**緩解**：將 GridHelpers 創建移到 `openProject` 流程中（在 `new Editor()` 之後、`createEditorBridge` 之前）；onCleanup 時 dispose。

4. **AutoSave write 頻率與大 scene** — 大 scene（>5MB JSON）每 2 秒寫 disk 可能出現可感延遲。**緩解**：debounce 已經吸收連續編輯；單次 write 預估 < 100ms。若日後問題出現，調 debounce 或加 incremental save，不在此 spec 範圍。

5. **Toolbar `handleImport` flow** — Import GLTF 目前依賴 `editor.projectManager.isOpen`；Toy mode 廢除後 Import 永遠在 project 開啟下執行，但 gltfLoader 內仍有檢查需要清除。**緩解**：spec 已點名 `gltfLoader.ts:12-16` 砍除。

6. **AutoSave 從 IndexedDB / cache 來的 GLB 引用一致性** — 廢除 toy mode 不影響 GlbStore（仍是 IndexedDB），scene 引用的 GLB path 已是 project-relative（#610 完成）。**確認 OK**，無需額外處理。

---

## In-scope / Out-of-scope

### In-scope

- App.tsx 條件渲染 Welcome / EditorShell
- 新建 Welcome.tsx
- ProjectPanel.tsx 收斂為 file browser（刪 Hub mode 分支）
- Editor lazy instantiation 流程
- ProjectManager 新增 `openHandle(handle)` method
- Scene auto-load `scenes/scene.erythos`
- γ 狀態 viewport empty placeholder（New Scene 按鈕）
- AutoSave 重寫為純寫 disk
- Toolbar handleSave 改 immediate flush
- 清 toy mode fallback：`gltfLoader.ts` console.warn 分支、`Toolbar.tsx` 瀏覽器下載分支
- EnvironmentPanel `projectOpen` gate 移除
- Bridge `projectOpen` / `projectName` / `projectFiles` signal 在 EditorShell 階段仍維持（panel 內仍可訂閱）

### Out-of-scope（後續另開 issue）

- β · Multi-scene picker（同 project 多個 scene 檔切換）
- Auto-resume project（啟動跳過 Welcome 直接進上次 project）
- Welcome 視覺品牌設計、Logo、過場動畫
- Scene 縮圖預覽
- Save As… 多 scene 路徑
- Open Scene… 從 project 內選別的 .erythos 檔（γ 階段先 disabled）
- AutoSave error 狀態的 retry UI / 衝突解決
- LocalStorage 既有 `erythos-autosave-v3` key 的清理（一次性 migration 可在 release notes 提；不在 code 內處理舊資料）

---

## 後續 PR 切點建議

預估拆 4 個 issue / PR，依賴鏈如下：

1. **PR-A · App lazy + Welcome 骨架**
   - App.tsx 條件渲染 + projectOpen 信號
   - 新 Welcome.tsx（複用 ProjectPanel Hub mode 視覺）
   - Editor lazy instantiation
   - EditorContext provider 條件 wrap
   - GridHelpers 移到 EditorShell
   - workspaceStore lazy init（如需）
   - 暫時保留 ProjectPanel Hub mode 分支（PR-B 才砍）

2. **PR-B · ProjectPanel 收斂**
   - 刪 ProjectPanel `<Show fallback={...Hub...}>` 分支
   - 假設 projectOpen 永遠 true
   - 依賴 PR-A merged

3. **PR-C · AutoSave 重寫 + toy mode fallback 清理**
   - AutoSave 改寫到 project file
   - Editor.init 移除 restoreSnapshot
   - openProject 流程加 readFile scene
   - Toolbar handleSave 改 immediate flush + 砍下載 fallback
   - gltfLoader.ts 砍 console.warn 分支
   - EnvironmentPanel 砍 projectOpen gate
   - 依賴 PR-A merged

4. **PR-D · γ 狀態 viewport placeholder**
   - Viewport 偵測 SceneDocument 空 → 顯示 New Scene / Open Scene 按鈕
   - Open Scene 暫 disabled
   - 依賴 PR-A、PR-C merged（autosave 流程定，才能保證 New Scene 行為）

PR-B / C / D 在 PR-A merged 後可並行開發（互相不衝突檔案）。

---

## 驗收

- 開啟 app → 看到 Welcome 全螢幕，無 dockview / panel
- 點 Open Recent → editor 出現、scene 從 disk 還原（含 GLB）
- 編輯 scene → 2 秒後 status bar 顯示 Saved；查 `<project>/scenes/scene.erythos` 內容已更新
- 按 Save → 立即顯示 Saved，無 debounce 等待
- Close project → 回 Welcome
- 開新 project（無 scene 檔） → editor 出現但 viewport 顯示「No scene loaded / + New Scene」
- 點 New Scene → SceneDocument 變空可編輯，2 秒後 `scene.erythos` 出現在 disk
- 開啟 app 時無 project：localStorage `erythos-autosave-v3` 內容不會被讀取（邏輯路徑已移除）
- 拖 GLB 進來無 project（不可能，因為 Welcome 不掛 panel）— 不需驗證
- 在 project 內拖 GLB import：仍能正常 import 並複製到 `models/` 目錄（PR-C 移除 toy mode 分支後行為等同既有「project open」分支）
- Status bar 顯示 `Saved` / `Saving...` / `Save failed`（autosaveStatusChanged 事件對應三狀態）
