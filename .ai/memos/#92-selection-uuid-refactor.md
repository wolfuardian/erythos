# #92 Selection UUID 重構備忘

## 範圍比預期大

任務描述只提到修改 `Selection.ts`，但實際上 `src/core/` 內有五個地方直接傳 Object3D 給 selection 方法：

- `Editor.removeObject()` — `has(object)` / `remove(object)` / `hovered === object`
- `AddObjectCommand.execute()` / `undo()`
- `RemoveObjectCommand.execute()`
- `ImportGLTFCommand.execute()` / `undo()`

下次類似的 API 改動，主腦應提前 grep `selection\.` 的所有呼叫點，直接列進任務描述，避免 agent 漏改。

## 測試策略選擇

Selection 測試直接用 `new EventEmitter()` 而不是透過 `new Editor()`，避免引入 fake timers / localStorage 清理等無關前置條件。純 unit test 效果更好。

## backward compat 測試移除

`EventEmitter.test.ts` 中原本有兩個 backward compat 測試（`objectHovered`, `objectSelected`）。這次把它們移除（連同 EventMap 中的事件定義），而不是保留。移除前確認了沒有其他 core/ 外的測試依賴這兩個事件（只有下游消費端的程式碼，由後續 Phase 處理）。

## downstream 破壞確認

build 後確認下游錯誤都在 `src/core/` 之外：
- `src/app/App.tsx` — `selection.selected` deprecated getter 被移除
- `src/panels/scene-tree/SceneTreePanel.tsx` — 傳 Object3D 給 `select()` / `toggle()` / `has()`
- `src/panels/viewport/ViewportPanel.tsx` — 傳 Object3D 給 `select()` / `hover()`

這些由 V2-6 及後續 Phase 處理。
