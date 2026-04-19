# Scene Format Refactor — 計畫文件

**狀態：** 規劃完成，待啟動
**規格書：** [scene-format-spec.md](scene-format-spec.md)

---

## 1. 目標

將 source of truth 從 Three.js scene graph 遷移至自訂的 SceneFile 資料模型。

```
.scene 檔案 ←→ JSON.parse/stringify ←→ Runtime 資料模型（SceneFile）
                                              ↓ sync
                                        Three.js scene（純渲染層）
```

### 核心原則

- **Runtime = 檔案 = Context panel 顯示內容** — 資料一致性
- **IO 是純粹的 dump/load** — 不在 IO 過程中做格式轉換
- **Three.js 降為渲染層** — 不再是 source of truth

---

## 2. 現況

### 目前的 source of truth

Three.js `Scene` 物件。所有系統直接操作 Three.js 物件：

| 系統 | 依賴 Three.js 的方式 |
|------|---------------------|
| Selection | `Object3D` 參照 |
| Transform (Gizmo) | `TransformControls` 附著 `Object3D` |
| Undo/Redo | Command 模式操作 `Object3D` |
| Scene Tree panel | 遍歷 `scene.children` |
| Properties panel | 讀寫 `Object3D.position/rotation/scale/name` |
| Context panel | `scene.toJSON()` / `object.toJSON()` |
| AutoSave | `scene.toJSON()` + `ObjectLoader.parse()` |
| Save/Load (Toolbar) | `scene.toJSON()` + `restoreSnapshot()` |
| GLTF Import | `GLTFLoader` → `Group` → `scene.add()` |
| SceneLoader | 自訂 `SceneData` 格式（過渡設計） |

### 目前的檔案格式

- **AutoSave**: Three.js 原生 `toJSON` 格式（localStorage）
- **Save/Load**: Three.js 原生 `toJSON` 格式（.scene/.json 檔案）
- **SceneLoader.ts**: 自訂 `SceneData`（巢狀樹，Vite FS plugin）

---

## 3. 影響範圍分析

### 3.1 總覽

| 系統 | 檔案數 | 核心依賴 | 難度 |
|------|--------|----------|------|
| Editor | 1 | Scene 擁有者，所有 graph mutation 的入口 | **HIGH** |
| Commands | 9 | scene.add/remove, Vector3/Euler clone, reference equality | **HIGH** |
| GizmoManager | 1 | TransformControls, 多物體 transform 同步 | **HIGH** |
| SelectionPicker | 1 | Raycaster, parent chain walking | **HIGH** |
| AutoSave | 1 | scene.toJSON(), ObjectLoader.parse() | **HIGH** |
| GLTF Import | 2 | GLTFLoader 產出 Object3D 樹 | **HIGH** |
| Selection | 1 | Set\<Object3D\> reference equality | MEDIUM |
| EventEmitter | 1 | Object3D 作為 event payload | MEDIUM |
| Scene Tree | 1 | 遍歷 Object3D.children | MEDIUM |
| Properties | 3 | 讀寫 position/rotation/scale/name | MEDIUM |
| PostProcessing | 1 | Object3D.traverse() 找 Mesh | MEDIUM |
| Bridge | 1 | Signal\<Object3D[]\> 傳遞 | MEDIUM |
| Viewport | 1 | Scene 參照、gizmo attach | MEDIUM |

### 3.2 HIGH — 需重寫的系統

#### Editor（src/core/Editor.ts, 110 行）

架構核心。擁有 `readonly scene: Scene`，所有 scene graph 變更經由此類。

- `addObject(object, parent?)` → `target.add(object)` + emit events
- `removeObject(object)` → `parent.remove(object)` + 清 selection
- `clear()` → 遍歷 `scene.children` 逐一 remove

遷移策略：Editor 須持有 SceneFile（nodes 陣列）作為 source of truth，Three.js Scene 降為內部渲染用途。addObject/removeObject 改為操作 nodes 陣列 + 通知同步層更新 Three.js。

#### Commands（src/core/commands/*.ts, 9 個檔案）

所有 Command 直接持有 Object3D 參照並 mutate scene graph：

- **AddObjectCommand / ImportGLTFCommand**: `parent.add(object)` / `parent.remove(object)`
- **RemoveObjectCommand**: 記錄 `parent.children` index，undo 時插回原位
- **SetPosition/Rotation/ScaleCommand**: `Vector3.clone()` + `position.copy()` 直接修改 Object3D
- **SetValueCommand**: `(object as any)[property] = value` 動態屬性設定
- Command merging 依賴 `cmd.object === this.object`（reference equality）

遷移策略：Command 改為操作 node ID + SceneNode 資料。Transform commands 用 plain `[x, y, z]` 取代 Vector3/Euler。Merge 比對改用 ID equality。

#### GizmoManager（src/viewport/GizmoManager.ts, 175 行）

TransformControls 必須附著 Object3D。多物體模式建立 pivot Object3D，拖曳時對所有 Object3D 做 delta transform。

- `attach(object)` → `controls.attach(object)`
- `attachMulti(objects)` → 計算包圍盒中心、建 pivot、逐一 `position.copy().add(delta)`

遷移策略：重構時暫時移除 TransformControls（D7）。後續作為獨立功能重建，屆時可評估自研或重新整合 Three.js addon。

#### SelectionPicker（src/viewport/SelectionPicker.ts, 120 行）

Raycaster 射線檢測必須對 Three.js mesh 做 intersect，再沿 parent chain 走到頂層。

- `raycaster.intersectObjects(scene.children, true)` → hit.object
- 沿 parent chain 走到 `obj.parent === scene` 找頂層物體

遷移策略：Raycasting 無法脫離 Three.js（需要 geometry 資料）。保留 Three.js scene 供 picking 用，hit 結果透過 Object3D ↔ node ID 對應表轉為 node ID。

#### AutoSave（src/core/scene/AutoSave.ts, 102 行）

- `saveSnapshot()`: `JSON.stringify(editor.scene.toJSON())` — Three.js 原生序列化
- `restoreSnapshot()`: `ObjectLoader.parse()` → 重建 Object3D 樹 → 移植 children

遷移策略：改為直接 dump/load SceneFile（`JSON.stringify(editor.sceneFile)`）。restoreSnapshot 改為設定 editor.sceneFile + 通知同步層重建 Three.js scene。

#### GLTF Import（src/utils/gltfLoader.ts + ImportGLTFCommand.ts）

GLTFLoader 產出 `gltf.scene`（Object3D 樹）。目前直接 add 到場景。

遷移策略：GLTFLoader 產出的 Object3D 樹需轉換為 SceneNode 陣列。每個 mesh 節點的 component 記錄 `{ source: "path/to/file.glb:nodePath" }`。轉換後丟棄原始 Object3D，由同步層從 SceneNode 重建渲染用的 Three.js 物件。

### 3.3 MEDIUM — 可適配的系統

#### Selection（src/core/Selection.ts, 100 行）

`Set<Object3D>` 改為 `Set<string>`（node ID）。所有方法的 Object3D 參數改為 string ID。Events payload 改為 `string[]`。

#### EventEmitter（src/core/EventEmitter.ts, 71 行）

EditorEventMap 中 6 個事件攜帶 Object3D。改為攜帶 node ID（`string`）。

#### Scene Tree（src/panels/scene-tree/SceneTreePanel.tsx, 160 行）

從遍歷 `Object3D.children` 改為從 SceneFile nodes 陣列依 parent ID 建構樹。讀取 `name`、`type` 改為從 SceneNode 讀取。

#### Properties（src/panels/properties/, 3 個檔案）

讀取 `object.position.x` 改為 `node.position[0]`。Command 執行介面不變（已透過 editor 解耦）。

#### PostProcessing（src/viewport/PostProcessing.ts, 78 行）

`collectMeshes()` 改為從 node ID 查找對應的 Three.js Object3D（透過同步層的 ID ↔ Object3D 對應表）。

#### Bridge（src/app/bridge.ts, 85 行）

`Accessor<Object3D[]>` 改為 `Accessor<string[]>`（node IDs）。最乾淨的遷移點。

### 3.4 關鍵設計決策

| # | 決策 | 結論 | 理由 |
|---|------|------|------|
| D1 | AutoSave 格式 | **跟著換 SceneFile** | 資料一致性。先讓舊格式失效 → 移除舊架構 → 設計新架構 → 逐步建置。避免用舊思維設計新格式 |
| D2 | 同步層方向 | **純單向驅動**（SceneNode → Three.js） | TransformControls 暫時移除，重構後獨立重建。無 gizmo = 無例外 = 最乾淨架構 |
| D3 | mesh source 路徑基準 | **專案根目錄** | 場景檔搬移不影響引用 |
| D4 | 向後相容 | **不相容，直接破壞** | 使用者少，舊格式是 Three.js toJSON，留著是債 |
| D5 | 遷移策略 | **一次全換，垂直切片** | 避免雙 source of truth 的隱藏 bug。先垂直建最小 loop → 適時展開水平 → 收攏後再垂直，需主腦縝密規劃 |
| D6 | ID ↔ Object3D 對應 | **Map\<string, Object3D\> 在同步層** | 乾淨隔離，不污染 Three.js 物件 |
| D7 | TransformControls | **重構時暫時移除，後續獨立重建** | 滾動式建置，重構後沒有移動物件手段也沒關係 |
| D8 | Raycasting | **留在 Three.js 上做** | geometry + world transform 與渲染共用，命中後透過 D6 對應表轉 node ID |

### 3.5 ID 策略 — ✅ 已定案

**結論：UUID 唯一 + Path 查詢（策略 B）**

詳見 [id-strategy.md](id-strategy.md)。

- `id` 欄位 = UUID v4，節點建立時生成，永不改變
- `parent` 引用 parent 的 UUID
- Path（`Scene/props/chair`）為 runtime 計算的查詢 API，不存檔
- 所有系統統一使用 UUID — 無雙軌複雜度
- 雙軌方案（確定性 ID + UUID）已廢案：rename 連鎖失效問題無法根治

### 3.6 資源管理策略

- Import GLB 時**複製一份到專案目錄**
- 重複檔名 → 略過，跳出訊息提醒使用者
- mesh component 的 source 引用專案目錄內的相對路徑

### 3.7 重構前置作業

在正式重構前需完成：

| # | 項目 | 說明 |
|---|------|------|
| P1 | **AutoSave localStorage 失效** | version-gate localStorage key，偵測舊格式時靜默丟棄 |
| P2 | **ID 策略設計文件** | ✅ 已定案 — UUID 唯一 + Path 查詢，見 [id-strategy.md](id-strategy.md) |
| P3 | **基礎測試覆蓋** | 對核心 loop 寫 snapshot test（save → load → 比對 nodes），預先覆蓋再滾動追加，適時 sync 到各 worktree |

---

## 4. 架構設計

### 4.1 整體資料流

```
User action
  → Command
    → SceneDocument.mutate()
      → emit nodeAdded / nodeRemoved / nodeChanged
        ├→ SceneSync  → Three.js Scene update（渲染 + raycasting）
        ├→ Bridge     → SolidJS signals（UI 更新）
        └→ AutoSave   → localStorage（持久化）

Raycasting (click/hover):
  Raycaster.intersect(threeScene)
    → hit Object3D
      → SceneSync.getUUID(object3d)
        → Selection.select(uuid)

Save:  JSON.stringify(sceneDocument.serialize())  → .scene 檔案
Load:  .scene 檔案 → JSON.parse → sceneDocument.deserialize(data)
         → SceneSync.rebuild()
```

### 4.2 新增模組

| 模組 | 路徑 | 職責 |
|------|------|------|
| **SceneDocument** | `src/core/scene/SceneDocument.ts` | 持有 `SceneNode[]`，提供 CRUD，發事件 |
| **SceneSync** | `src/core/scene/SceneSync.ts` | 監聽 SceneDocument 事件 → 維護 Three.js Scene |
| **ResourceCache** | `src/core/scene/ResourceCache.ts` | GLB 快取，同一檔案只載入一次 |

### 4.3 SceneDocument — source of truth

```
SceneDocument
├── nodes: Map<string, SceneNode>     // UUID → SceneNode
├── addNode(node: SceneNode): void
├── removeNode(uuid: string): void
├── updateNode(uuid: string, patch: Partial<SceneNode>): void
├── getNode(uuid: string): SceneNode | null
├── getChildren(uuid: string): SceneNode[]
├── getRoots(): SceneNode[]           // parent === null
├── findByPath(path: string): SceneNode | null
├── getPath(uuid: string): string
├── serialize(): SceneFile            // dump，純 JSON
├── deserialize(data: SceneFile): void // load，替換全部 nodes
└── events: nodeAdded / nodeRemoved / nodeChanged / sceneReplaced
```

不依賴 Three.js。純資料操作。

### 4.4 SceneSync — 單向同步層

```
SceneSync
├── uuidToObject3D: Map<string, Object3D>   // UUID → Three.js 物件
├── object3DToUUID: Map<Object3D, string>    // 反查（raycasting 用）
├── threeScene: Scene                         // Three.js 渲染場景
├── resourceCache: ResourceCache              // GLB 快取
│
├── 監聽 SceneDocument 事件：
│   ├── nodeAdded   → 建立 Object3D，加入 threeScene，載入 mesh component
│   ├── nodeRemoved → 從 threeScene 移除，清理 Map
│   ├── nodeChanged → 更新 Object3D 的 transform / name / visible
│   └── sceneReplaced → rebuild()，清空 threeScene 全部重建
│
├── getUUID(object3d: Object3D): string | null    // raycasting 反查
├── getObject3D(uuid: string): Object3D | null    // outline / 渲染查詢
└── rebuild(): void                                // 全量重建
```

**nodeAdded 時的 mesh component 處理：**
1. 讀取 `node.components.mesh.source`（例如 `"model/chair.glb"`）
2. 透過 ResourceCache 載入 GLB（已快取則直接取）
3. 從 GLB scene 中 clone 子樹（如有 nodePath 則取子樹）
4. 將 clone 出的 Mesh 附加到對應的 Object3D 下

### 4.5 Editor 重構

```
Editor（重構後）
├── sceneDocument: SceneDocument       // 取代 scene: Scene
├── sceneSync: SceneSync               // 新增
├── selection: Selection               // Set<string>（UUID）
├── history: History                   // 不變，Command 改用 UUID
├── events: EventEmitter               // payload 改為 UUID
├── keybindings: KeybindingManager     // 不變
│
├── execute(cmd): void                 // 不變
├── undo() / redo(): void              // 不變
├── addNode(node): void                // 取代 addObject
├── removeNode(uuid): void             // 取代 removeObject
├── clear(): void                      // sceneDocument.deserialize(空場景)
│
│  // 給 Viewport 用（渲染 + raycasting）
├── get threeScene(): Scene            // sceneSync.threeScene
└── dispose(): void
```

### 4.6 Command 重構

所有 Command 從操作 Object3D 改為操作 SceneDocument：

| 現有 Command | 重構後 | 變化 |
|---|---|---|
| AddObjectCommand | **AddNodeCommand** | `sceneDocument.addNode(node)` |
| RemoveObjectCommand | **RemoveNodeCommand** | `sceneDocument.removeNode(uuid)` + 儲存 node snapshot 供 undo |
| SetPositionCommand | **SetTransformCommand** | 統一處理 position/rotation/scale，用 `Vec3` 取代 `Vector3` |
| SetRotationCommand | ↑ 合併 | |
| SetScaleCommand | ↑ 合併 | |
| SetValueCommand | **SetNodePropertyCommand** | `sceneDocument.updateNode(uuid, { name: newValue })` |
| ImportGLTFCommand | **ImportGLTFCommand** | GLB → 轉換為 SceneNode[] → `sceneDocument.addNode()` 逐一加入 |
| MultiCmdsCommand | **不變** | 純 command 組合器 |

Command 不再持有 Object3D 參照，只持有 UUID + 資料 snapshot。

### 4.7 各面板適配

```
Scene Tree panel
  Before: editor.scene.children → 遞迴渲染 Object3D
  After:  bridge.nodes() → 用 parent UUID 建樹 → 渲染 SceneNode

Properties panel
  Before: object.position.x → 顯示
  After:  node.position[0]  → 顯示
  修改:   editor.execute(new SetTransformCommand(editor, uuid, 'position', newVec3))

Context panel
  Before: scene.toJSON() → JSON.stringify
  After:  sceneDocument.serialize() → JSON.stringify
  完美對齊！Runtime = 檔案 = Context 顯示

Bridge
  Before: Accessor<Object3D[]>
  After:  Accessor<string[]> (UUIDs) + Accessor<SceneNode[]> (全部 nodes)
```

### 4.8 暫時移除的功能（重構後獨立重建）

| 功能 | 原因 | 重建方式 |
|------|------|---------|
| TransformControls (Gizmo) | 直接 mutate Object3D，與單向同步衝突 | 獨立 issue，可自研或重新整合 addon |
| Box Select | 依賴 Gizmo 的多物體 transform | 隨 Gizmo 一起重建 |
| PostProcessing outline | 依賴 Object3D 參照，但透過 SceneSync 查詢可快速恢復 | 重構後優先重建 |

---

## 5. API 設計

型別定義來自 [scene-format-spec.md](scene-format-spec.md) §6。

### 5.1 SceneDocument

```typescript
// src/core/scene/SceneDocument.ts

import { EventEmitter } from '../EventEmitter';

interface SceneDocumentEventMap {
  nodeAdded:      [node: SceneNode];
  nodeRemoved:    [node: SceneNode];
  nodeChanged:    [uuid: string, changed: Partial<SceneNode>];
  sceneReplaced:  [];
}

class SceneDocument {
  private nodes: Map<string, SceneNode>;
  readonly events: EventEmitter<SceneDocumentEventMap>;

  // ── CRUD ──────────────────────────────────

  addNode(node: SceneNode): void;
  removeNode(uuid: string): void;
  updateNode(uuid: string, patch: Partial<SceneNode>): void;

  // ── Query ─────────────────────────────────

  getNode(uuid: string): SceneNode | null;
  getChildren(parentUuid: string): SceneNode[];  // 依 order 排序
  getRoots(): SceneNode[];                        // parent === null
  getAllNodes(): SceneNode[];

  // ── Path 查詢 API ────────────────────────

  getPath(uuid: string): string;                          // "Scene/props/chair"
  findByPath(path: string): SceneNode | null;             // 首個匹配
  findAllByPath(pattern: string): SceneNode[];            // glob 或多匹配

  // ── 序列化（IO 是純 dump/load）───────────

  serialize(): SceneFile;          // { version, nodes: [...] }
  deserialize(data: SceneFile): void;  // 替換全部 → emit sceneReplaced

  // ── 工具 ──────────────────────────────────

  createNode(name: string, parent?: string): SceneNode;   // 生成 UUID + 預設值
  hasNode(uuid: string): boolean;
}
```

### 5.2 SceneSync

```typescript
// src/core/scene/SceneSync.ts

import type { Scene, Object3D } from 'three';

class SceneSync {
  readonly threeScene: Scene;
  private uuidToObj: Map<string, Object3D>;
  private objToUuid: Map<Object3D, string>;
  private resourceCache: ResourceCache;

  constructor(document: SceneDocument, resourceCache: ResourceCache);

  // ── 查詢（Raycasting + Outline 用）───────

  getObject3D(uuid: string): Object3D | null;
  getUUID(object3d: Object3D): string | null;

  // ── 生命週期 ──────────────────────────────

  rebuild(): void;     // 全量重建（deserialize 後呼叫）
  dispose(): void;     // 清理 listener + Three.js 物件

  // ── 內部（由 SceneDocument 事件驅動）──────
  // private onNodeAdded(node: SceneNode): void;
  // private onNodeRemoved(node: SceneNode): void;
  // private onNodeChanged(uuid: string, changed: Partial<SceneNode>): void;
  // private onSceneReplaced(): void;
}
```

### 5.3 ResourceCache

```typescript
// src/core/scene/ResourceCache.ts

import type { Group } from 'three';

interface CachedGLTF {
  scene: Group;    // 原始 GLB scene（唯讀，不直接加入場景）
}

class ResourceCache {
  private cache: Map<string, CachedGLTF>;

  // 載入 GLB（已快取則直接回傳）
  async load(filePath: string): Promise<CachedGLTF>;

  // 從快取中 clone 子樹
  cloneSubtree(filePath: string, nodePath?: string): Object3D | null;

  // 清理
  clear(): void;
  evict(filePath: string): void;
}
```

### 5.4 EventEmitter（重構）

```typescript
// src/core/EventEmitter.ts

// EventEmitter class 不變，泛型化以支援不同 event map

interface EditorEventMap {
  // ── 節點事件（UUID）────────────────────
  nodeAdded:              [uuid: string];
  nodeRemoved:            [uuid: string];
  nodeChanged:            [uuid: string];
  sceneReplaced:          [];

  // ── 選取事件（UUID）────────────────────
  selectionChanged:       [uuids: string[]];
  hoverChanged:           [uuid: string | null];

  // ── 不變的事件 ─────────────────────────
  historyChanged:         [];
  interactionModeChanged: [mode: InteractionMode];
  transformModeChanged:   [mode: TransformMode];
  editorCleared:          [];
  autosaveStatusChanged:  [status: 'idle' | 'pending' | 'saved'];
}

// 移除的事件：
// - objectAdded / objectRemoved / objectChanged → 改為 nodeAdded / nodeRemoved / nodeChanged
// - objectSelected / objectHovered → 改為 selectionChanged / hoverChanged
// - sceneGraphChanged → 改為 sceneReplaced（整場景替換時）或 nodeAdded/Removed（單節點變更時）
```

### 5.5 Selection（重構）

```typescript
// src/core/Selection.ts — Object3D → string (UUID)

class Selection {
  private _selected: Set<string>;
  private _hovered: string | null;

  get all(): readonly string[];
  get count(): number;
  get primary(): string | null;
  get hovered(): string | null;

  select(uuid: string | null): void;   // null = clear
  add(uuid: string): void;
  remove(uuid: string): void;
  toggle(uuid: string): void;
  has(uuid: string): boolean;
  clear(): void;
  hover(uuid: string | null): void;
}
```

### 5.6 Commands（重構）

```typescript
// ── AddNodeCommand ────────────────────────

class AddNodeCommand extends Command {
  readonly type = 'AddNode';
  private node: SceneNode;   // 完整 snapshot

  execute(): void {
    this.editor.sceneDocument.addNode(this.node);
  }
  undo(): void {
    this.editor.sceneDocument.removeNode(this.node.id);
  }
}

// ── RemoveNodeCommand ─────────────────────

class RemoveNodeCommand extends Command {
  readonly type = 'RemoveNode';
  private uuid: string;
  private snapshot: SceneNode;    // undo 用
  private childSnapshots: SceneNode[];  // 遞迴子節點，undo 時一起恢復

  execute(): void {
    // 先快照自己 + 所有子孫
    this.editor.sceneDocument.removeNode(this.uuid);
  }
  undo(): void {
    // 恢復自己 + 所有子孫
    this.editor.sceneDocument.addNode(this.snapshot);
    for (const child of this.childSnapshots) {
      this.editor.sceneDocument.addNode(child);
    }
  }
}

// ── SetTransformCommand（合併 3 個）───────

type TransformProperty = 'position' | 'rotation' | 'scale';

class SetTransformCommand extends Command {
  readonly type = 'SetTransform';
  updatable = true;

  private uuid: string;
  private property: TransformProperty;
  private oldValue: Vec3;
  private newValue: Vec3;

  execute(): void {
    this.editor.sceneDocument.updateNode(this.uuid, {
      [this.property]: this.newValue,
    });
  }
  undo(): void {
    this.editor.sceneDocument.updateNode(this.uuid, {
      [this.property]: this.oldValue,
    });
  }
  canMerge(cmd: Command): boolean {
    return cmd instanceof SetTransformCommand
      && cmd.uuid === this.uuid
      && cmd.property === this.property;
  }
  update(cmd: Command): void {
    this.newValue = (cmd as SetTransformCommand).newValue;
  }
}

// ── SetNodePropertyCommand ────────────────

class SetNodePropertyCommand extends Command {
  readonly type = 'SetNodeProperty';
  private uuid: string;
  private property: keyof SceneNode;
  private oldValue: unknown;
  private newValue: unknown;

  execute(): void {
    this.editor.sceneDocument.updateNode(this.uuid, {
      [this.property]: this.newValue,
    });
  }
  undo(): void {
    this.editor.sceneDocument.updateNode(this.uuid, {
      [this.property]: this.oldValue,
    });
  }
}

// ── ImportGLTFCommand ─────────────────────

class ImportGLTFCommand extends Command {
  readonly type = 'ImportGLTF';
  private nodes: SceneNode[];   // GLB 轉換後的扁平節點陣列

  execute(): void {
    for (const node of this.nodes) {
      this.editor.sceneDocument.addNode(node);
    }
  }
  undo(): void {
    // 反向移除
    for (const node of [...this.nodes].reverse()) {
      this.editor.sceneDocument.removeNode(node.id);
    }
  }
}
```

### 5.7 Bridge（重構）

```typescript
// src/app/bridge.ts

interface EditorBridge {
  editor: Editor;

  // ── UUID-based signals ────────────────
  selectedUUIDs: Accessor<string[]>;
  hoveredUUID: Accessor<string | null>;
  nodes: Accessor<SceneNode[]>;       // 全場景 nodes snapshot

  // ── 不變 ──────────────────────────────
  interactionMode: Accessor<InteractionMode>;
  transformMode: Accessor<TransformMode>;
  canUndo: Accessor<boolean>;
  canRedo: Accessor<boolean>;
  autosaveStatus: Accessor<'idle' | 'pending' | 'saved'>;
  confirmBeforeLoad: Accessor<boolean>;

  // ── 便捷查詢（UI 用）─────────────────
  getNode: (uuid: string) => SceneNode | null;

  dispose: () => void;
}
```

### 5.8 GLTF 轉換工具

```typescript
// src/utils/gltfConverter.ts

// 將 GLTFLoader 產出的 Object3D 樹轉換為 SceneNode[]
function convertGLTFToNodes(
  gltfScene: Group,
  parentUuid: string,       // 掛載到哪個場景節點下
  filePath: string,         // 例如 "model/chair.glb"
): SceneNode[];
```

轉換邏輯：
1. 遞迴遍歷 GLB scene 的 Object3D 樹
2. 每個節點建立 SceneNode（生成 UUID、提取 transform）
3. Mesh 節點的 `components.mesh.source` = `filePath:nodePath`
4. 回傳扁平 SceneNode 陣列

---

## 6. 需求清單（Issue 拆分）

### 6.1 推進策略

```
Phase 0  前置作業（清場）
    ↓
Phase 1  垂直切片：最小 loop（SceneDocument → SceneSync → 渲染）
    ↓
Phase 2  垂直切片：核心操作（Command + Selection + Undo/Redo）
    ↓
Phase 3  水平展開：UI 面板適配（可平行）
    ↓
Phase 4  垂直切片：IO（Save/Load + AutoSave）
    ↓
Phase 5  垂直切片：GLTF Import + ResourceCache
    ↓
Phase 6  重建暫移功能（Raycasting + Outline + Gizmo）
```

### 6.2 Phase 0 — 前置作業

在 master 上直接處理（非程式碼改動或防禦性改動），不走 feature branch。

| # | Issue | 模組 | 說明 |
|---|-------|------|------|
| P0-1 | AutoSave localStorage 失效 | core | version-gate localStorage key，舊格式靜默丟棄 |
| P0-2 | 基礎測試框架建立 | core | 引入 vitest，對現有 save → load → 比對寫 snapshot test |

### 6.3 Phase 1 — 最小 loop

**目標：** SceneDocument 持有資料 → SceneSync 渲染到 Three.js → 畫面上看到物件。

此階段結束時：空場景可渲染，手動 addNode 可出現在 viewport。

| # | Issue | 模組 | 說明 | 依賴 |
|---|-------|------|------|------|
| V1-1 | SceneNode 型別定義 | core | `Vec3`, `SceneNode`, `SceneFile`, `MeshComponent` 從 spec 搬入 `src/core/scene/SceneFormat.ts` | 無 |
| V1-2 | SceneDocument 實作 | core | CRUD + 事件 + serialize/deserialize + Path 查詢 | V1-1 |
| V1-3 | SceneSync 實作（基礎） | core | 監聽 SceneDocument → 建立/移除/更新 Object3D，維護 UUID↔Object3D Map。先不處理 mesh component | V1-2 |
| V1-4 | Editor 重構 | core | 持有 SceneDocument + SceneSync 取代 Scene。暫時保留舊 API 空殼（compile 通過但不運作） | V1-3 |
| V1-5 | Viewport 適配 | viewport | 從 `editor.threeScene`（SceneSync 提供）取得渲染場景 | V1-4 |

### 6.4 Phase 2 — 核心操作

**目標：** 可透過 Command 新增/移除/修改節點，undo/redo 正常運作。

| # | Issue | 模組 | 說明 | 依賴 |
|---|-------|------|------|------|
| V2-1 | EventEmitter 重構 | core | 事件 payload 從 Object3D → UUID string，新事件名稱 | V1-4 |
| V2-2 | Selection 重構 | core | `Set<Object3D>` → `Set<string>`，API 改用 UUID | V2-1 |
| V2-3 | AddNodeCommand + RemoveNodeCommand | core | 操作 SceneDocument，存 node snapshot 供 undo | V2-1 |
| V2-4 | SetTransformCommand | core | 合併 Position/Rotation/Scale 三個 command，用 Vec3 | V2-1 |
| V2-5 | SetNodePropertyCommand | core | name / visible 等屬性 | V2-1 |
| V2-6 | Bridge 重構 | app | `Accessor<string[]>` + `Accessor<SceneNode[]>` | V2-1, V2-2 |

### 6.5 Phase 3 — UI 面板適配（可平行）

**目標：** 所有面板改讀 SceneDocument 資料，不再讀 Object3D。

Phase 2 完成後，以下可平行開發：

| # | Issue | 模組 | 說明 | 依賴 |
|---|-------|------|------|------|
| H3-1 | Scene Tree 適配 | scene-tree | 從 bridge.nodes() 依 parent UUID 建樹 | V2-6 |
| H3-2 | Properties 適配 | properties | 讀寫 SceneNode 屬性，透過新 Command 修改 | V2-5, V2-6 |
| H3-3 | Context 適配 | app | `sceneDocument.serialize()` → 直接顯示 | V2-6 |

### 6.6 Phase 4 — IO

**目標：** Save/Load + AutoSave 完整運作，.scene 格式。

| # | Issue | 模組 | 說明 | 依賴 |
|---|-------|------|------|------|
| V4-1 | Save/Load 重構 | components | Toolbar Save → `sceneDocument.serialize()` dump；Load → `sceneDocument.deserialize()` | V2-6 |
| V4-2 | AutoSave 重構 | core | `sceneDocument.serialize()` → localStorage | V1-2, V2-1 |
| V4-3 | ProjectPanel Load 適配 | app | 雙擊 .scene → `sceneDocument.deserialize()` | V4-1 |

### 6.7 Phase 5 — GLTF Import

**目標：** 可匯入 GLB，mesh 在 viewport 顯示，save/load 保留 mesh 引用。

| # | Issue | 模組 | 說明 | 依賴 |
|---|-------|------|------|------|
| V5-1 | ResourceCache 實作 | core | GLB 快取 + clone 子樹 | V1-1 |
| V5-2 | GLTF 轉換工具 | core | `convertGLTFToNodes()` — Object3D 樹 → SceneNode[] | V1-1, V5-1 |
| V5-3 | SceneSync mesh component | core | nodeAdded 時偵測 `components.mesh` → 透過 ResourceCache 載入 + clone | V1-3, V5-1 |
| V5-4 | ImportGLTFCommand 重構 | core | 使用 convertGLTFToNodes + addNode | V2-3, V5-2 |
| V5-5 | GLB 複製到專案目錄 | core | import 時複製檔案，重複檔名跳訊息 | V5-4 |
| V5-6 | Toolbar Import 適配 | components | 觸發新 ImportGLTFCommand | V5-4 |
| V5-7 | Viewport 拖放適配 | viewport | 拖放 GLB 觸發新 ImportGLTFCommand | V5-4 |

### 6.8 Phase 6 — 重建暫移功能

**目標：** 恢復 raycasting 選取、outline 高亮，最後重建 gizmo。

| # | Issue | 模組 | 說明 | 依賴 |
|---|-------|------|------|------|
| R6-1 | SelectionPicker 重建 | viewport | raycasting → `SceneSync.getUUID()` → Selection | V2-2, V1-3 |
| R6-2 | PostProcessing outline 重建 | viewport | `SceneSync.getObject3D(uuid)` → 取 mesh → outline | R6-1 |
| R6-3 | Gizmo 重建 | viewport | 獨立設計，可自研或重新整合 TransformControls | R6-1 |
| R6-4 | Box Select 重建 | viewport | 依賴 Gizmo 的多物體 transform | R6-3 |

### 6.9 Issue 總覽

| Phase | Issue 數 | 開發模式 | 預估 |
|-------|---------|---------|------|
| 0 前置 | 2 | 循序 | 小 |
| 1 最小 loop | 5 | 循序 | 中 |
| 2 核心操作 | 6 | 循序 | 中 |
| 3 面板適配 | 3 | **平行** | 小 |
| 4 IO | 3 | 循序 | 小 |
| 5 GLTF | 7 | 混合（V5-1~3 循序，V5-5~7 可平行） | 大 |
| 6 重建功能 | 4 | 循序 | 大 |
| **合計** | **30** | | |

### 6.10 里程碑

| 里程碑 | 完成 Phase | 可驗證行為 |
|--------|-----------|-----------|
| **M1 — 能看見** | 1 | 空場景渲染，SceneDocument 運作 |
| **M2 — 能操作** | 2 | 新增/移除/修改節點，undo/redo，selection |
| **M3 — 能觀察** | 3 | Scene Tree、Properties、Context 面板全部運作 |
| **M4 — 能存取** | 4 | Save/Load .scene，AutoSave |
| **M5 — 能匯入** | 5 | GLB import，mesh 顯示，save/load 保留引用 |
| **M6 — 能互動** | 6 | 點選、框選、拖曳移動、outline |

---

## 7. 變更紀錄

| 日期 | 內容 |
|------|------|
| 2026-04-11 | 建立計畫文件，列出現況和影響範圍框架 |
| 2026-04-11 | 完成影響範圍分析：6 個 HIGH、7 個 MEDIUM |
| 2026-04-11 | 確定 8 項設計決策（D1-D8）、ID 策略方向、資源管理策略、3 項前置作業 |
| 2026-04-11 | ID 策略定案：UUID 唯一 + Path 查詢（策略 B），雙軌方案廢案。同步更新 spec |
| 2026-04-11 | 完成架構設計：SceneDocument + SceneSync + Editor 重構 + Command 重構 + 面板適配 |
| 2026-04-11 | 完成 API 設計：8 個模組的 interface 定義 |
| 2026-04-11 | 完成需求清單：7 個 Phase、30 個 issue、6 個里程碑 |
