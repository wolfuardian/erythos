# #106 ContextPanel 適配 SceneDocument — 觀察筆記

## 主要發現

V2-6 Bridge 重構（PR #102）已做了初步適配，ContextPanel.tsx 在
feat/bridge-refactor 分支中已改用 `selectedUUIDs` + `bridge.getNode(uuid)`。

到 feat/context-scenedata 時，實際需要的改動非常小：
- 只缺少 `bridge.sceneVersion()` 作為 reactive dep
- 沒有任何 `Object3D.toJSON()` 殘留（早已移除）

## bridge.ts 的事件覆蓋矩陣

| SceneDocument 事件 | setNodes | sceneVersion bump | objectVersion bump |
|--------------------|----------|-------------------|-------------------|
| nodeAdded          | ✅       | ❌                | ❌                |
| nodeRemoved        | ✅       | ❌                | ❌                |
| nodeChanged        | ✅       | ❌                | ✅                |
| sceneReplaced      | ✅       | ✅                | ❌                |

`nodes()` 已涵蓋全部四個事件，`sceneVersion` 只有在 `sceneReplaced` 時才有
專屬的 bump。所以兩個 dep 同時宣告有輕微冗餘，但明確性更好，且能抵擋
未來 bridge 實作變更。

## 建議

未來如果 bridge 有 `sceneMetadataChanged` 之類的新事件（只改 metadata、
不動 nodes），這時 `sceneVersion` 才會真的獨立發揮作用。目前兩者並列是
「防禦性宣告」，值得保留。
