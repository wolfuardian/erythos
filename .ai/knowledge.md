# Knowledge Base

知識庫由主腦從備忘錄萃取歸檔，按主題組織。
只收非顯而易見的知識，每條標註來源與適用範圍。

**格式**：每條知識後方標註 `⏳ 適用至 <條件>`，條件滿足時主腦應移除該條目。

**清理時機**：
- merge 收尾時 — 檢查本次 merge 是否滿足某條知識的過期條件
- Phase 交接時 — 全面審查，移除所有已過期條目

---

## 事件系統過渡期注意事項（來源：#91 備忘錄）

- ~~`selectionChanged` payload 改為 `string[]`~~ — V2-2 已完成 ✅
- ~~EditorEventMap nodeChanged / Bridge 監聽策略~~ — V2-6 已定案：Bridge 分兩層監聽（editor.events 管 UI 狀態，sceneDocument.events 管場景資料） ✅
- ~~`autosaveStatusChanged` idle 狀態~~ — Phase 4 AutoSave 重構已定案：AutoSave 不需 emit `'idle'`，Bridge signal 初始值 `createSignal('idle')` 已覆蓋語意（來源：#111 備忘錄） ✅

## Command 設計慣例（來源：#93, #94 備忘錄）

- Command 內直接呼叫 `sceneDocument.addNode/removeNode`，不透過 `editor.addNode`，讓 Command 責務限於資料變更。後續若需 Editor 層事件，再統一決策 ⏳ 適用至 Command 層事件策略定案
- API 改動（如 Selection Object3D → UUID）前，主腦應 grep 所有呼叫點列進任務描述，避免 agent 漏改跨模組消費端 ⏳ 永久
- RemoveNodeCommand 子孫快照用 BFS 收集，execute 反向移除（葉先），undo 正向恢復（父先），確保 parent 參照永遠有效 ⏳ 永久
- 快照用 `structuredClone`（非 shallow spread），防止外部修改破壞 snapshot 不變性 ⏳ 永久
- `Vec3` 是 tuple `[number, number, number]`，複製用 `[...value] as Vec3`，不能用 `.clone()` ⏳ 永久
- `{ [property]: value }` 在 strict mode 推斷為 `{ [x: string]: T }`，需 `as Partial<SceneNode>` 轉型（安全的窄化） ⏳ 永久

## Bridge 架構（來源：#96 備忘錄）

- Bridge 分兩層監聯：`editor.events`（UI 狀態）+ `editor.sceneDocument.events`（場景資料）。新 Command 直接操作 SceneDocument，Bridge 必須監聽 SceneDocument 事件才能收到變更 ⏳ 永久
- `nodes` signal 在所有四個 SceneDocument 事件時都更新，面板只需讀 `nodes()` 即可。`sceneVersion` / `objectVersion` 保留供面板做細粒度最佳化 ⏳ 永久

## SceneNode 欄位缺口（來源：#103 備忘錄）

- SceneNode 無 `type` 欄位（Mesh/Group/Light 等），場景樹 badge 和 PropertiesPanel 都已移除 type/visible 顯示。恢復方式：components 推導或新增 `nodeType` / `visible` 欄位 ⏳ 適用至 Phase 5 GLTF Import（components.mesh 會被寫入）
- SetTransformCommand 的 oldValue 需呼叫端傳入（因 canMerge 合併機制，oldValue 必須是操作開始時的快照）。面板場景直接讀 `node.position` 即可，Gizmo 拖曳場景需用拖曳開始時的值 ⏳ 永久

## AutoSave / IO 架構（來源：#111 備忘錄）

- AutoSave 監聽 `sceneDocument.events`（nodeAdded/nodeRemoved/nodeChanged/sceneReplaced），不監聯 editor.events 的 deprecated 事件 ⏳ 永久
- `editor.clear()` 委派 `sceneDocument.deserialize({ version: 1, nodes: [] })`，由 SceneSync 自動清空 Three.js scene，不手動遍歷 `scene.children` ⏳ 永久
- Storage key `erythos-autosave-v3` 使用 SceneFile 格式（`{ version: 1, nodes: [...] }`），v2 格式（Three.js JSON envelope）自動廢棄 ⏳ 適用至下次格式變更

## UUID ↔ Object3D 轉換層（來源：#105 備忘錄）

- 轉換集中在 ViewportPanel（UI 層），core/Selection 和 bridge 完全不持有 Object3D，未來換 3D 引擎只需改 ViewportPanel ⏳ 永久
- `sceneSync.getUUID(obj)` 回傳 null 是正常情境（helper 物件不在 SceneSync 中），null guard 是語意過濾非錯誤防護 ⏳ 永久
- `.filter(Boolean)` 無法窄化 `(T | null)[] → T[]`，需用明確型別守衛 `.filter((o): o is T => o !== null)` ⏳ 永久
