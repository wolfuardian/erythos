# #96 Bridge 重構備忘：SceneDocument 事件所有權

## 核心發現

Bridge 現在分兩層監聽事件：

1. **`editor.events`** — UI 狀態（selection、hover、transform mode、history、autosave）
2. **`editor.sceneDocument.events`** — 場景資料（nodeAdded/nodeRemoved/nodeChanged/sceneReplaced）

這個分離很關鍵，因為 Phase 3 的新 Command 直接呼叫 `sceneDocument.addNode()` 等方法，不再透過 `editor.addObject()`。如果 Bridge 繼續監聽 `editor.events.sceneGraphChanged`，就會對這些新 Command 的改動視而不見。

## 舊 Bridge 的潛在 bug

`objectHovered` 事件在舊 bridge.ts 中仍被訂閱，但 EventEmitter 已換成 `hoverChanged`。這意味著在本次重構前，hover 信號從未被更新過（事件名稱不匹配）。已在此次重構中一併修正。

## `nodes` signal 的設計決策

`nodes` signal 在 **所有四個 SceneDocument 事件** 時都更新（nodeAdded/nodeRemoved/nodeChanged/sceneReplaced），而不是只在結構改變時更新。這讓面板元件只需讀取 `nodes()` 就能獲得統一的響應式依賴，不需要分別訂閱 `sceneVersion` 和 `objectVersion`。

`sceneVersion` 只在 `sceneReplaced` 時 bump（全場景替換）；`objectVersion` 在 `nodeChanged` 時 bump（屬性變更）。保留這兩個版本號是為了讓面板可以做粒度更細的最佳化（例如只在場景結構改變時才重建樹狀視圖）。
