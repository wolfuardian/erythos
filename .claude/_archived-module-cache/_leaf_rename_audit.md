# Leaf → Prefab 改名 Audit（issue #526）

_Last updated: 2026-04-25 by EX_
_Scope: 全 codebase leaf/Leaf/LEAF 引用完整盤點_

---

## 1. UI 顯示文字（使用者看得到的字串）

面向使用者的詞彙，改名時需同步改為 Prefab/prefab/prefabs。

| 字串 | 檔案 | 行 | 分類 |
|------|------|----|------|
| `Leaves (${...})` — panel header title | `src/panels/leaf/LeafPanel.tsx` | 168 | **改** |
| `No leaves saved.` — empty state fallback | `src/panels/leaf/LeafPanel.tsx` | 190 | **改** |
| `Select a leaf` — preview overlay | `src/panels/leaf/LeafPanel.tsx` | 275 | **改** |
| `Right-click a node in Scene tree.` — empty state hint（不含 leaf 詞）| `src/panels/leaf/LeafPanel.tsx` | 191-193 | 不改 |
| `label: 'Leaf'` — EditorDef（panel 切換器顯示名） | `src/panels/leaf/index.ts` | 8 | **改** → `'Prefab'` |
| `label: 'Leaf'` — ProjectPanel file type chip | `src/panels/project/ProjectPanel.tsx` | 15 | **改** → `'Prefab'` |
| `pill: 'LEA'` — ProjectPanel badge | `src/panels/project/ProjectPanel.tsx` | 15 | **改** → `'PRE'`（或保留，按 UX 決策） |
| `Save as Leaf` — SceneTree 右鍵選單 | `src/panels/scene-tree/SceneTreePanel.tsx` | 417 | **改** → `'Save as Prefab'` |
| `leaves/` — ProjectPanel 新建專案目錄樹預覽 | `src/panels/project/ProjectPanel.tsx` | 426 | **改** → `prefabs/` |
| `hdris/, leaves/, or other/ folders.` — 說明文字 | `src/panels/project/ProjectPanel.tsx` | 609 | **改** → `prefabs/` |
| `data-devid="leaf-panel"` — devtools 識別字（非使用者可見，但建議改） | `src/panels/leaf/LeafPanel.tsx` | 154 | 建議改 `prefab-panel` |
| `application/erythos-leaf` — drag MIME type（API，非顯示文字） | `src/panels/leaf/LeafPanel.tsx` | 204, `src/panels/viewport/ViewportPanel.tsx` 128 | 見 §2 |

---

## 2. 識別字串（持久化敏感）

**這些是最高風險**：改名後舊資料會無法讀取，需要 migration。

### 2-A. workspaceStore editorTypes（localStorage 持久化）

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/app/workspaceStore.ts` | 66 | `createDebugPreset()` 中 `editorTypes: { ..., 'leaf': 'leaf' }` |
| `src/app/areaTree.ts` | 124 | `createDebugPresetTree()` 中 area `id: 'leaf'` |

**持久化路徑**：`workspaceStore.ts` → `saveStore()` → `localStorage.setItem('erythos-workspaces-v1', ...)` → 包含 `editorTypes: { 'leaf': 'leaf' }`。

**讀取路徑**：`loadStore()` 讀 localStorage → 反序列化 `Workspace.editorTypes`；`AreaShell` / `EditorSwitcher` 用此字串查 `editorDef.id`。

**risk**：若 editorDef.id 改為 `'prefab'`，舊 localStorage 中 `editorTypes['leaf'] = 'leaf'` 會無法解析，導致面板空白。需 migration。

### 2-B. editorDef.id（editorDef 內部識別符，間接持久化）

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/panels/leaf/index.ts` | 7 | `id: 'leaf'` — EditorDef 識別符 |
| `src/app/editors.ts` | 5,15 | import + 加入 editors array |
| `src/components/EditorSwitcher.tsx` | 43, 98 | switch case `'leaf'`（icon），hotkey `'leaf': 'Shift F2'` |

**risk**：editorDef.id 同時作為 editorType 字串儲存於 localStorage，見 2-A。

### 2-C. areaTree area id（localStorage 持久化）

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/app/areaTree.ts` | 124 | `{ id: 'leaf', ... }` — debug preset area 節點 ID |
| `src/app/workspaceStore.ts` | 66 | `editorTypes: { 'leaf': 'leaf' }` — 同一個 key |
| `src/app/__tests__/areaTree.test.ts` | 77, 282, 338, 534 | 測試中 `expect(...).toBe('leaf')` / `toContain('leaf')` |

**risk**：areaTree area id 在 workspace grid 中作為 area 識別符，也儲存於 localStorage。改名後 grid JSON 裡的 `id: 'leaf'` 無法對應新 editorType `'prefab'`。

### 2-D. IndexedDB DB_NAME（核心持久化）

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/core/scene/LeafStore.ts` | 3 | `const DB_NAME = 'erythos-leaf'` |
| `src/core/scene/LeafStore.ts` | 4 | `const STORE_NAME = 'assets'` |

**持久化路徑**：`indexedDB.open('erythos-leaf')` → LeafAsset 以 `JSON.stringify(asset)` 存入。DB 名稱不在 JSON 結構裡，但改名後舊 IndexedDB 資料庫 `erythos-leaf` 不會自動遷移。

**migration 方案**：`LeafStore.ts` 加舊 DB 名稱偵測，若 `'erythos-prefab'` 不存在但 `'erythos-leaf'` 存在則 migrate 資料並刪舊 DB。或保持 `DB_NAME = 'erythos-leaf'` 不動（字串改名但 DB 不改，減少 migration 複雜度）。

### 2-E. LeafAsset.version 及格式 key（IndexedDB 內容持久化）

`LeafAsset` 本身無 type 字串。`components.leaf` 是 **SceneNode** 的 component key（存於 scene file / autosave），見 2-F。

### 2-F. SceneNode components.leaf key（scene 持久化敏感）

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/core/commands/InstantiateLeafCommand.ts` | 31 | `leaf: { id: this.asset.id }` — 寫入 SceneNode |
| `src/core/commands/SaveAsLeafCommand.ts` | 32, 46 | `leaf: { id: ... }` 設定 / `const { leaf: _leaf, ... }` 移除 |
| `src/core/scene/LeafSerializer.ts` | 24 | `delete components['leaf']` |
| `src/core/scene/SceneFormat.ts` | 40-42 | `interface LeafComponent { id: string }` 型別定義 |

**持久化路徑**：場景節點透過 AutoSave 或 scene export 序列化時，`components.leaf` 鍵名寫入 JSON。若 scene 檔案（`.erythos`）已存在，改名後讀取的節點 component key 變成 `prefab`，舊 scene 裡的 `leaf` 無法辨識。

**risk 等級：高**。這是 scene file 向後相容性問題。

### 2-G. ProjectFile type `'leaf'` 及副檔名（project 磁碟持久化）

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/core/project/ProjectFile.ts` | 4 | `type: 'glb' \| 'leaf' \| ...` union |
| `src/core/project/ProjectFile.ts` | 13-14 | `case 'leaf': return 'leaf'` — 副檔名 `.leaf` |
| `src/core/project/ProjectManager.ts` | 167 | `case 'leaf': return 'leaves'` — 目錄 `leaves/` |
| `src/panels/project/ProjectPanel.tsx` | 159 | `ALL_TYPES` 陣列含 `'leaf'` |

**磁碟格式**：`inferFileType` 依副檔名 `.leaf` 分類為 `'leaf'` 類型，`folderForType` 將 `'leaf'` 對應存放目錄 `leaves/`。若改名為 `.prefab`/`prefabs/`，舊 project 目錄裡的 `.leaf` 檔案和 `leaves/` 子目錄將被 `rescan` 分類為 `'other'`。

**risk 等級：高**。影響現有 project 的檔案系統資料。

### 2-H. drag-and-drop MIME type

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/panels/leaf/LeafPanel.tsx` | 204 | `setData('application/erythos-leaf', ...)` |
| `src/panels/viewport/ViewportPanel.tsx` | 128 | `getData('application/erythos-leaf')` |

**純記憶體**：瀏覽器 drag session，不持久化。兩端必須同步改，否則 drag 功能壞。

### 2-I. bridge leafAssets / leafStoreChanged（純記憶體，非持久化）

| 位置 | 行 | 詳情 |
|------|----|------|
| `src/app/bridge.ts` | 36 | `leafAssets: Accessor<LeafAsset[]>` |
| `src/app/bridge.ts` | 65, 126-127, 153, 173 | signal 建立 / event 訂閱 / cleanup / export |
| `src/core/EventEmitter.ts` | 32 | `leafStoreChanged: []` — event type 定義 |
| `src/core/Editor.ts` | 33, 55-78, 93-105 | `_leafAssets` map / init / registerLeaf / unregisterLeaf / getAllLeafAssets |

**純記憶體**：這些都是 runtime signal 和事件，不持久化。可與程式碼識別字同步改名，無 migration 需求。

---

## 3. 程式碼識別字（純改名，無 migration）

### 型別 / Interface
| 識別字 | 檔案 |
|--------|------|
| `LeafAsset` | `src/core/scene/LeafFormat.ts`, `LeafSerializer.ts`, `LeafStore.ts`, `InstantiateLeafCommand.ts`, `SaveAsLeafCommand.ts`, `Editor.ts`, `bridge.ts` |
| `LeafNode` | `src/core/scene/LeafFormat.ts`, `LeafSerializer.ts` |
| `LeafComponent` | `src/core/scene/SceneFormat.ts` |

### 類別 / 函數
| 識別字 | 檔案 |
|--------|------|
| `InstantiateLeafCommand` | `src/core/commands/InstantiateLeafCommand.ts`, `commands/index.ts`, `ViewportPanel.tsx` |
| `SaveAsLeafCommand` | `src/core/commands/SaveAsLeafCommand.ts`, `commands/index.ts`, `SceneTreePanel.tsx` |
| `serializeToLeaf` | `src/core/scene/LeafSerializer.ts`, `SaveAsLeafCommand.ts` |
| `deserializeFromLeaf` | `src/core/scene/LeafSerializer.ts`, `InstantiateLeafCommand.ts` |
| `loadLeafPreview`（local fn） | `src/panels/leaf/LeafPanel.tsx` |
| `registerLeaf` | `src/core/Editor.ts`, `SaveAsLeafCommand.ts` |
| `unregisterLeaf` | `src/core/Editor.ts`, `SaveAsLeafCommand.ts` |
| `getAllLeafAssets` | `src/core/Editor.ts`, `bridge.ts` |
| `leafDef` | `src/app/editors.ts` |
| `editorDef` 中的 `leafDef` | `src/app/editors.ts` |

### Signal / 事件
| 識別字 | 檔案 |
|--------|------|
| `leafAssets`（signal） | `src/app/bridge.ts` |
| `setLeafAssets` | `src/app/bridge.ts` |
| `onLeafStoreChanged`（local fn） | `src/app/bridge.ts` |
| `leafStoreChanged`（event key） | `src/core/EventEmitter.ts`, `bridge.ts`, `Editor.ts` |
| `_leafAssets`（private field） | `src/core/Editor.ts` |

### Import 別名
| 識別字 | 檔案 |
|--------|------|
| `import * as LeafStore from ...` | `src/core/Editor.ts`, `src/panels/viewport/ViewportPanel.tsx` |
| `import { editorDef as leafDef }` | `src/app/editors.ts` |

---

## 4. 檔案 / 目錄路徑

| 路徑 | 改名建議 |
|------|---------|
| `src/panels/leaf/` | → `src/panels/prefab/` |
| `src/panels/leaf/LeafPanel.tsx` | → `PrefabPanel.tsx` |
| `src/panels/leaf/index.ts` | → `index.ts`（保持檔名） |
| `src/panels/leaf/CLAUDE.md` | → `src/panels/prefab/CLAUDE.md` |
| `src/core/commands/InstantiateLeafCommand.ts` | → `InstantiatePrefabCommand.ts` |
| `src/core/commands/SaveAsLeafCommand.ts` | → `SaveAsPrefabCommand.ts` |
| `src/core/scene/LeafFormat.ts` | → `PrefabFormat.ts` |
| `src/core/scene/LeafSerializer.ts` | → `PrefabSerializer.ts` |
| `src/core/scene/LeafStore.ts` | → `PrefabStore.ts` |

---

## 5. 文件 / Spec / DB 盤點

### 需與 code 同步改（改 code 時一起改）

| 檔案 | 摘要 | 動作 |
|------|------|------|
| `CLAUDE.md`（根） | 模組清單 `leaf-panel` | → `prefab-panel` |
| `src/panels/leaf/CLAUDE.md` | 整個檔案 | 隨目錄移動 / 全改 |
| `.claude/module-cache/core.md` | LeafAsset、LeafStore、InstantiateLeafCommand 等大量 leaf 字樣 | 改名後刷新 |
| `.claude/module-cache/app.md` | `leafAssets`, `leafStoreChanged` | 改名後刷新 |

### 設計文件（design history，不改內容）

| 檔案 | 說明 |
|------|------|
| `.claude/codebase-spec/final/ARCHITECTURE.md` | 記載 Leaf 格式設計決策，屬 design history |
| `.claude/codebase-spec/final/DATA-MODELS.md` | 詳細型別定義，改 code 後可選擇性刷新 |
| `.claude/codebase-spec/final/COMPONENTS.md` | 若含 leaf panel 說明，改後刷新 |
| `.claude/codebase-spec/final/PUBLIC-API.md` | 改後刷新 |
| `.claude/specs/2026-04-21-area-editor-refactor-wave1.md` | 歷史 spec，不改 |
| `docs/superpowers/plans/2026-04-22-area-split-system.md` | 歷史 plan，不改 |
| `docs/superpowers/plans/2026-04-22-workspace-tabs.md` | 歷史 plan，不改 |
| `docs/superpowers/plans/2026-04-23-area-corner-split-merge.md` | 歷史 plan，不改 |
| `docs/superpowers/specs/2026-04-22-area-split-merge-design.md` | 歷史 spec，不改 |
| `docs/superpowers/specs/2026-04-22-workspace-tabs-design.md` | 歷史 spec，不改 |

---

## 6. Commit prefix

根 `CLAUDE.md` 模組清單（第 46 行）：

```
| leaf-panel | src/panels/leaf/ | `[leaf-panel]` |
```

改為：

```
| prefab | src/panels/prefab/ | `[prefab]` |
```

---

## Migration 影響專章

### M-1. workspace JSON migration（localStorage）

**觸點**：`editorTypes: { 'leaf': 'leaf' }` 在 debug preset 中。使用者 localStorage 若存了舊值，loadStore 時 `editorTypes['leaf']` 不能再對應到新 `editorDef.id = 'prefab'`。

**建議寫法**（在 `src/app/workspaceStore.ts` 的 `loadStore()` migration 段落新增）：

```typescript
// Migration: 'leaf' editorType → 'prefab'（issue #526）
const editorTypeMigratedWorkspaces = panelStatesMigratedWorkspaces.map(w => {
  const newEditorTypes: Record<string, string> = {};
  for (const [areaId, editorType] of Object.entries(w.editorTypes)) {
    newEditorTypes[areaId] = editorType === 'leaf' ? 'prefab' : editorType;
  }
  return { ...w, editorTypes: newEditorTypes };
});
return { ...parsed, workspaces: editorTypeMigratedWorkspaces };
```

**加入位置**：`panelStatesMigratedWorkspaces` 之後、`return` 之前。

同樣，areaTree 的 area id `'leaf'` 若持久化在 `Workspace.grid` 中，需確認 `createDebugPresetTree()` 回傳的 area id 是否也需要更新。由於 area id 用於 `editorTypes` 的 key，兩者必須同步。

**建議**：area id 也改成 `'prefab'`，並在 migration 段落加 `areaId` 的 rename：

```typescript
// migration for areaTree area ids（'leaf' → 'prefab'）
const renamedAreaId = areaId === 'leaf' ? 'prefab' : areaId;
newEditorTypes[renamedAreaId] = editorType === 'leaf' ? 'prefab' : editorType;
```

**注意**：`Workspace.grid` 本身的 `AreaNode.id` 欄位也需要 migrate（grid 是序列化 `AreaTree` JSON，包含 area id `'leaf'`）。這需要遍歷 grid JSON，較複雜，建議 debug preset 由 `createDebugPreset()` 重建（目前 `loadStore` 中 validateTree 失敗時已走 `createDebugPreset()` fallback）。**簡化方案**：在 migration 後對 debug preset 強制 reset（`createDebugPreset()` 重建 grid + editorTypes），無需遍歷 JSON。

### M-2. SceneNode components key migration（scene file 向後相容）

**觸點**：`SceneNode.components['leaf']` 鍵名。改名後新 code 寫 `components['prefab']`，但舊 `.erythos` scene 仍是 `components['leaf']`。

**建議寫法**（在 `src/core/scene/SceneFormat.ts` 或 scene loader）：

AutoSave restore 或 scene import 讀到節點後，加 migration：

```typescript
// 在 SceneDocument.loadFromJSON() 或 AutoSave restore 處
function migrateNode(node: SceneNode): SceneNode {
  const comp = node.components as Record<string, unknown>;
  if ('leaf' in comp && !('prefab' in comp)) {
    const { leaf, ...rest } = comp;
    return { ...node, components: { ...rest, prefab: leaf } };
  }
  return node;
}
```

**加入位置**：需查 `src/core/scene/SceneDocument.ts` 的 `loadNodes` / `fromJSON` 方法，在 nodes array 處理時加 `migrateNode`（本次 audit 未讀此檔，建議 AD 開工前再查）。

### M-3. IndexedDB `erythos-leaf` → `erythos-prefab`（可選）

**分析**：LeafStore 的 DB_NAME `'erythos-leaf'` 是 IndexedDB 資料庫名稱，儲存 LeafAsset 物件。LeafAsset 結構本身無 `type: 'leaf'` 字串（純資料 version/id/name/modified/nodes），所以 IndexedDB 內容不需格式轉換。

**三個選項**：
1. **保留 `DB_NAME = 'erythos-leaf'`**：最簡單，舊資料自動繼續使用。只改 TypeScript 識別字，不需 migration。推薦。
2. **改 `DB_NAME = 'erythos-prefab'`**：一次性遷移，需在 `openDb()` 加偵測：若 `erythos-prefab` 不存在但 `erythos-leaf` 存在，讀舊 DB 資料 → 寫入新 DB → 刪舊 DB。
3. **同時支援兩個 DB**：複雜度最高，不建議。

### M-4. Project 磁碟檔案（`.leaf` 副檔名 / `leaves/` 目錄）

**分析**：`inferFileType` 用副檔名 `.leaf` 判斷類型，`folderForType` 對應 `leaves/` 目錄。若改為 `.prefab` / `prefabs/`：

- 舊 project 的 `leaves/*.leaf` 檔案在 rescan 後會被歸類為 `'other'`，不再顯示為 prefab 類型。
- 這影響實際 disk 上的使用者 project。

**建議**：`inferFileType` 同時認識舊副檔名：

```typescript
case 'leaf':   // legacy alias
case 'prefab':
  return 'prefab';
```

`folderForType` 加相容（讀取時可接受舊路徑，新存儲用 `prefabs/`）：

```typescript
case 'prefab': return 'prefabs';
```

`ProjectPanel` 在 `ALL_TYPES` 和 icon switch 更新即可。

**加入位置**：`src/core/project/ProjectFile.ts` 的 `inferFileType`；`src/core/project/ProjectManager.ts` 的 `folderForType`。

---

## PR 拆分建議

### PR 1：Core 改名（純識別字，無 migration）

**風險等級：低**

- 改名：`LeafFormat.ts` → `PrefabFormat.ts`，`LeafSerializer.ts` → `PrefabSerializer.ts`，`LeafStore.ts` → `PrefabStore.ts`（DB_NAME 維持 `'erythos-leaf'`，不觸發 migration）
- 改名：`InstantiateLeafCommand.ts` → `InstantiatePrefabCommand.ts`，`SaveAsLeafCommand.ts` → `SaveAsPrefabCommand.ts`
- 更新所有 TypeScript 識別字：`LeafAsset` → `PrefabAsset`、`LeafNode` → `PrefabNode`、`LeafComponent` → `PrefabComponent`、`registerLeaf` → `registerPrefab` 等
- 更新 `EventEmitter.ts` event key：`leafStoreChanged` → `prefabStoreChanged`
- 更新 `commands/index.ts` re-export
- **不動**：`components['leaf']` → 這個 scene 持久化 key 放 PR 3
- **不動**：editorDef.id `'leaf'` → 放 PR 2（與 workspace migration 一起）
- 預估檔案數：~12 檔

### PR 2：Panel + workspace migration（含持久化字串）

**風險等級：高**

- 目錄：`src/panels/leaf/` → `src/panels/prefab/`
- 改 `LeafPanel.tsx` → `PrefabPanel.tsx` + editorDef.id `'leaf'` → `'prefab'`、label `'Leaf'` → `'Prefab'`
- 改 `workspaceStore.ts`：`createDebugPreset()` editorTypes + migration 段落（M-1）
- 改 `areaTree.ts`：debug preset area id `'leaf'` → `'prefab'`
- 改 `editors.ts`：import leafDef → prefabDef
- 改 `components/EditorSwitcher.tsx`：switch case + hotkey map
- 改 `bridge.ts`：`leafAssets` → `prefabAssets`、event 訂閱（搭配 PR 1）
- 改 `src/app/__tests__/areaTree.test.ts`：area id 字串
- 根 `CLAUDE.md` commit prefix 表
- **必須在 PR 1 merge 後才能開**（依賴新識別字）
- 預估檔案數：~10 檔

### PR 3：Scene 向後相容 migration（components key）

**風險等級：中高**

- `SceneDocument.ts`（或 AutoSave restore 入口）加 `migrateNode` 處理 `components['leaf']` → `components['prefab']`
- `SceneFormat.ts`：`LeafComponent` → `PrefabComponent`（已在 PR 1 改）；確認 SceneNode 使用處
- `ProjectFile.ts`：`type: 'leaf'` → `type: 'prefab'`；`inferFileType` 加舊副檔名相容
- `ProjectManager.ts`：`case 'leaf': return 'leaves'` → `case 'prefab': return 'prefabs'`（同時兼容）
- `ProjectPanel.tsx`：ALL_TYPES、icon switch、UI text（`leaves/` → `prefabs/`、pill `'LEA'` → `'PRE'`）
- SceneTreePanel、ViewportPanel UI 文字（`Save as Leaf` → `Save as Prefab`、drag MIME type 兩端同步）
- **可與 PR 2 並行**，依賴 PR 1
- 預估檔案數：~8 檔

### 建議執行順序

```
PR 1（core 識別字）
  └─> PR 2（panel + workspace migration）
  └─> PR 3（scene migration + ProjectFile）
```

PR 2 和 PR 3 在 PR 1 merge 後可並行開發，但因兩者都觸碰 SceneTreePanel（PR 3）和 ViewportPanel（PR 3），建議由同一 AD 處理以避免衝突。

---

## 最大風險點摘要

1. **workspace editorTypes + area id（localStorage）**：debug preset 的 `'leaf'` 必須加 migration，否則舊使用者 reload 後 panel 空白。PR 2 的核心工作。
2. **SceneNode components `'leaf'` key（scene file）**：已存在的 `.erythos` 場景檔案含 `components.leaf`，loader 需加 migration。PR 3 核心。
3. **drag-and-drop MIME type 兩端**：`application/erythos-leaf` 在 LeafPanel 和 ViewportPanel 兩端，必須原子性同改（同一 PR）。
4. **PR 1 先於 PR 2/3**：bridge、Commands 等識別字在 PR 2/3 都被引用，PR 1 必須先 merge。
