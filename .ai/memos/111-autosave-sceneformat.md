# Memo — Issue #111: AutoSave 重構為 SceneDocument 格式

## `autosaveStatusChanged` idle 狀態評估

**結論：AutoSave constructor 不需 emit `'idle'`。**

原因：
- Bridge 使用 `createSignal<'idle' | 'pending' | 'saved'>('idle')` 初始化 signal，UI 開啟時已是 `'idle'` 狀態。
- AutoSave 只有在 `scheduleSnapshot()` 被呼叫時才切換到 `'pending'`，再於存檔完成時切換到 `'saved'`。
- 目前設計沒有「從 saved 回到 idle」的轉換，所以 `'idle'` 只代表「尚未有任何變更觸發自動存檔」，由 signal 初始值語意覆蓋即可。
- 若未來需要 idle（例如：顯示上次儲存後超過 N 分鐘），才有必要從 AutoSave 主動 emit。

## sceneReplaced 事件分層

- `sceneDocument.events.emit('sceneReplaced')` → SceneSync + Bridge + AutoSave 監聽（場景資料層）
- `editor.events.emit('sceneReplaced')` → 先前 `clear()` 手動 emit，現已移除
- `clear()` 改呼叫 `sceneDocument.deserialize({ version: 1, nodes: [] })`，由 SceneSync 自動清空 Three.js scene，比手動遍歷 `scene.children` 更乾淨

## 老快照相容性

Storage key 從 `v2` 升至 `v3`。舊快照（Three.js JSON envelope 格式）不會被讀取，讓使用者從乾淨狀態重新開始。`loadScene()` 驗證 `version !== 1` 時 throw，Editor constructor 中有 try/catch 保護，不會崩潰。
