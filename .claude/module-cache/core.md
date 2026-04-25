# Core Module Cache

_Last updated: 2026-04-25 by EX_
_Module path: src/core/, src/utils/_
_Commit 前綴: [core]_

## 檔案速覽

| 檔案 | 職責 |
|------|------|
| `Editor.ts` | 核心編輯器類別，統籌所有子系統並提供統一 API |
| `EventEmitter.ts` | 型別安全的事件系統，定義 15 種 Editor 事件型別 |
| `Command.ts` | Command 抽象基類，所有可 undo/redo 操作的基礎 |
| `History.ts` | undo/redo 堆疊管理，支援 Command 合併 |
| `Selection.ts` | 場景選取狀態（多選、hover、interaction mode） |
| `Clipboard.ts` | 場景節點複製 / 剪下 / 貼上，支援 UUID 重新產生 |
| `KeybindingManager.ts` | 全域鍵盤快捷鍵管理器 |
| `commands/*.ts` | 9 種 Command 實作（AddNode, RemoveNode, MoveNode, ImportGLTF, InstantiatePrefab, SaveAsPrefab, SetNodeProperty, SetTransform, MultiCmds） |
| `scene/SceneDocument.ts` | 場景記憶體資料結構與 CRUD，管理節點樹並發事件 |
| `scene/SceneFormat.ts` | 場景格式型別定義（純 interface） |
| `scene/SceneSync.ts` | 單向同步 SceneDocument → Three.js Scene hierarchy |
| `scene/SceneLoader.ts` | 透過 Vite FS plugin 讀寫 `.scene` 檔案 |
| `scene/PrefabFormat.ts` | .prefab 資產格式定義（localId 取代 UUID） |
| `scene/PrefabSerializer.ts` | SceneNode[] ↔ PrefabAsset 序列化轉換 |
| `scene/PrefabStore.ts` | IndexedDB 包裝層，存取 PrefabAsset 元資料；DB_NAME 固定為 `'erythos-leaf'`（IndexedDB 永久保留） |
| `scene/ResourceCache.ts` | 記憶體內 GLB/GLTF 模型快取，支援 hydrate 復原 |
| `scene/GlbStore.ts` | IndexedDB 快取 GLB 的 ArrayBuffer |
| `scene/AutoSave.ts` | 場景變更 debounce 2 秒後寫 localStorage |
| `scene/EnvironmentSettings.ts` | 環境光照設定型別與預設值 |
| `scene/inferNodeType.ts` | 依 components 推斷節點型別（Mesh/幾何/燈光/相機/Group） |
| `project/ProjectManager.ts` | 管理專案開關、檔案掃描、資產匯入、recent list |
| `project/ProjectFile.ts` | 專案檔案型別與副檔名推斷 |
| `project/ProjectHandleStore.ts` | IndexedDB 持久化專案 handle（ProjectEntry） |
| `utils/gltfConverter.ts` | Three.js Group → 扁平化 SceneNode[] |
| `utils/gltfLoader.ts` | 從 File / GlbStore 載入 GLTF 並建立 ImportGLTFCommand |
| `utils/hdriLoader.ts` | 載入 .hdr 檔案為 DataTexture |

## 關鍵 Types / Interfaces

- `SceneNode`：場景節點結構（id, name, parent, order, position/rotation/scale, components, userData）
- `Vec3 = [number, number, number]`
- `Command`：抽象基類（type, editor, updatable, execute(), undo()）
- `EditorEventMap`：15 種事件（nodeAdded/Removed/Changed, sceneReplaced, selectionChanged, historyChanged, transformModeChanged 等）
- `PrefabAsset`：.prefab 資產格式（version, id, name, modified, nodes[]），nodes 用 localId 整數取代 UUID
- `ProjectEntry`：專案元資料（id, name, handle, lastOpened, status）
- `TransformMode = 'translate' | 'rotate' | 'scale'`

## 常用 Pattern

- **Command 模式**：所有場景變更必須透過 Command + editor.execute()，確保 undo/redo
- **事件驅動**：SceneDocument 發事件 → SceneSync 同步 Three.js → Bridge signal → UI 重渲
- **Fractional order**：MoveNodeCommand 用 fractional order 算插入位置（空陣列→0，頭→-1，尾→+1，中間→平均）
- **UUID ↔ localId 轉換**：PrefabSerializer 序列化時剝 UUID 改整數 localId，反序列化時生成新 UUID
- **Command 合併**：SetTransformCommand 連續同節點同屬性會自動合併成單一 undo entry（updatable + canMerge + update）
- **Orphan resolution**：SceneSync 處理子節點先於父節點加入時，暫掛 scene root 並登記 pendingChildren，父節點 add 時 re-attach

## 跨檔依賴

- `Editor` 統籌 SceneDocument, History, Selection, Clipboard, KeybindingManager, ProjectManager, AutoSave, ResourceCache
- `Commands` 直接操作 `sceneDocument` API（addNode/removeNode/updateNode），不透過 Editor wrapper
- `SceneSync` 監聽 SceneDocument 事件，單向同步到 Three.js Scene
- `ResourceCache` 依賴 `GlbStore`（IndexedDB 持久化 ArrayBuffer）
- `PrefabSerializer` 處理 SceneNode[] ↔ PrefabAsset 轉換，InstantiatePrefabCommand 加 `components.prefab` 標記（注意：SceneDocument migration 偵測 `'leaf' in comp` 歷史相容鍵仍有效）

## 已知地雷

- **gltfConverter 巢狀 Mesh 雙 clone 地雷（#330）**：`buildNodes` 對所有 Object3D 遞迴建 SceneNode；只有 `instanceof Mesh` 節點才加 `components.mesh`（非 Mesh 的中間 Group 只建空 `components: {}`）。SceneSync `onNodeAdded` mesh 分支呼叫 `cloneSubtree(filePath, nodePath)`，而 `cloneSubtree` 固定是 `target.clone(true)`（**深 clone**，含全部子孫）。結果：若 GLB 有 `Arm(Mesh) → Hand(Mesh)` 的巢狀結構，SceneDocument 中兩者皆為獨立 SceneNode 且各有 `components.mesh`。SceneSync 重建時 Arm 深 clone 已包含 Hand 幾何，Hand SceneNode 又額外深 clone 一次 Hand 節點，Hand 在 Three.js scene 中出現兩次 → 重複渲染。
- **Editor.init() 必須 await**：確保 ResourceCache hydrate 和 AutoSave restore 完成，否則 UI 取得空資料（#387 fix：init() 末尾 emit prefabStoreChanged）
- **RemoveNodeCommand 反向刪除**：BFS 收集子樹，execute 時反向刪除（葉節點先刪），避免父節點先刪導致子節點失聯
- **SceneSync mesh clone transform reset**：mesh component 的 clone 根節點 transform 重置為 identity（避免與 applyTransform 雙重疊加）
- **MoveNodeCommand cycle check**：execute 時向上追溯 parent 檢查是否移入自己的後代，違反拋 Error
- **SaveAsPrefabCommand 剝 components.prefab**：序列化時移除 root 的 components.prefab，避免 prefab 資產自我引用
- **AutoSave debounce 2 秒**：場景變更 emit `autosaveStatusChanged('pending')`，靜默 2 秒後寫入並 emit `'saved'`
- **ProjectManager.openRecent() requestPermission**：使用者拒絕權限回傳 false 而非拋錯，呼叫方需檢查
- **Vec3 是 tuple 不是 class**：複製用 `[...value] as Vec3`，不能 `.clone()`；tuple 無方法
- **strict mode `{ [property]: value }` 型別推斷**：推出 `{ [x: string]: T }`，需 `as Partial<SceneNode>` 安全窄化（#128 教訓）
- **Command 快照用 `structuredClone`**：非 shallow spread，防 snapshot 不變性被外部修改破壞
- **FSA API TS 型別缺口**：`FileSystemDirectoryHandle.entries()/.values()` 必須 `(handle as any).entries()` 強制轉型（TS DOM lib 不含 FSAA）；permission / abort error 一律 try/catch
- **ProjectManager.writeFile 不自動 rescan**：純粹寫檔，新增資產後需明確 `await this.rescan()` 否則 `bridge.projectFiles()` 不更新
- **onDragOver preventDefault + dragleave child 過濾**：drop event 觸發需 preventDefault；dragleave 子元素連動觸發父層，用 `e.currentTarget.contains(e.relatedTarget)` 過濾（#328 教訓）
- **SetTransformCommand oldValue 需呼叫端傳入**：canMerge 合併機制要求 oldValue 為操作開始時快照；Gizmo 拖曳場景須用拖曳開始時的值

## 最近 PR

- #388：Editor.init() 末尾新增 emit prefabStoreChanged，確保 UI 初始狀態同步
- #526：Leaf → Prefab 重命名（三批 PR），所有 Leaf* 識別字、type/key、副檔名 / 目錄 / drag MIME 改為 prefab*；IndexedDB DB_NAME `'erythos-leaf'` 永久保留
