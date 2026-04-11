# #103 SceneTreePanel UUID 適配備忘錄

## 主要改動

- `TreeNodeProps.object: Object3D` → `node: SceneNode`
- 選取狀態從 `bridge.selectedObjects().includes(obj)` 改為 `bridge.selectedUUIDs().includes(node.id)`
- 建樹從 `editor.scene.children` 改為 `bridge.nodes().filter(n => n.parent === id).sort()`
- `SceneTreePanel` 消除了 `createEffect` + `createSignal(children)`，直接用 derived computation `rootNodes()`

## 發現的問題

**SceneNode 無 type 欄位**：原本的 `typeBadge` 依賴 `Object3D.type`（"Mesh"、"Group" 等）。SceneNode 只有 `components: Record<string, unknown>`，目前所有 Command 寫入時 components 都是 `{}`，無法從 components 判斷節點類型。

目前暫時用結構啟發式（有子節點 → G，否則 → O）。若 core 模組日後在 components 寫入 `mesh`、`light`、`camera` 等鍵，scene-tree 可以用 `'mesh' in node.components` 等方式恢復完整的 badge 類型顯示。

建議 core 新增 `nodeType` 欄位或統一 components 鍵名規範。
