# #104 PropertiesPanel UUID 適配備忘

## 移除的欄位

ObjectDraw 原本顯示 Type（`object.type`）和 Visible（`object.visible`），這兩個欄位在 SceneNode 中不存在。目前直接移除 UI。

如果要恢復：
- **Type**：可從 `node.components` 推導（例如有 MeshComponent → "Mesh"），或在 SceneNode 新增 `nodeType` 欄位
- **Visible**：可在 SceneNode 新增 `visible: boolean` 欄位，或放在 `userData` 中

## SetTransformCommand 的 oldValue

SetTransformCommand 需要呼叫端傳入 oldValue（與 SetNodePropertyCommand 自動讀取不同）。這是因為 SetTransformCommand 有 `canMerge`/`update` 機制，拖曳過程中會合併多次更新，oldValue 必須是拖曳開始時的快照。面板場景下每次修改都是單次操作，直接讀 `node.position` 作為 oldValue 即可。
