# #119 GLB 持久化實作備忘

## 已實作

- `GlbStore.ts`：IndexedDB 薄封裝（put / get / remove / clear / keys）
- `ResourceCache.hydrate()`：啟動時從 IndexedDB 還原所有 GLB buffers
- `Editor.init()`：async 初始化，順序：hydrate → autosave restore → AutoSave 啟動

## 注意：App 層需同步修改

`Editor.autosave` 從 `readonly` 改為 `!` non-null assertion（`autosave!: AutoSave`）——
這是因為 `init()` 是 async，constructor 無法立即初始化。

**App 層（src/app/）必須在 `editor.init()` resolve 後才提供 context 給 UI，否則：**
1. `autosave` 為 undefined，呼叫 `editor.autosave.dispose()` 會 crash
2. autosave restore 尚未執行，UI 顯示空場景

建議 App 層改動：`await editor.init()` → 再 render / provide context。

## 已知限制

- `vitest` jsdom 無完整 IndexedDB，測試需 `fake-indexeddb` 或 mock。
  目前尚未補測試，留給後續處理。
