# #117 ResourceCache + SceneSync mesh component

## 設計決策

### node 層級分離
SceneSync 替每個 SceneNode 建立 `new Object3D()` 作為 entity；
cloned GLTF 子樹掛在它下面作為 child（visual representation）。
這樣 transform、命名、parent-child 關係都由 SceneDocument 主導，
渲染內容由 ResourceCache 提供，兩者互不干擾。

### MeshComponent.source 解析位置
`filePath:nodePath` 的切割邏輯放在 SceneSync，而非 ResourceCache。
ResourceCache 只知道「filePath 為快取鍵」，解析屬於業務邏輯範圍。

### Injectable parser for testing
GLTFLoader 在 jsdom 環境沒有 WebGL，改採 module-level `_mockParser` / `_clearParser`
讓測試注入 mock，比 class constructor 注入更輕量（不需改動 ResourceCache 構造式）。

### rebuild() 不需特別處理 mesh
`rebuild()` 直接 loop 呼叫 `onNodeAdded`，mesh component 邏輯已在 `onNodeAdded` 中，
rebuild 自然繼承 — 不需重複程式碼。

## 已知限制
- ResourceCache 為 page reload 後清空的純記憶體快取（intentional）
- 未實作快取 eviction 策略（容量上限），需求明確後再補
