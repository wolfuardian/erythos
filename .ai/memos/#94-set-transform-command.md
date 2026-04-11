# #94 SetTransformCommand 設計備忘

## 舊 vs 新的層次差異

SetPositionCommand（舊）直接操作 `Object3D.position`，跳過 SceneDocument：

```ts
execute() { this.object.position.copy(this.newPosition); }
```

SetTransformCommand（新）透過 sceneDocument.updateNode()：

```ts
execute() { this.editor.sceneDocument.updateNode(uuid, { position: newValue }); }
```

這讓 SceneSync 負責把資料同步到 Three.js，Command 不需要知道 Three.js 的存在。

## Vec3 是 tuple，不是物件

`Vec3 = [number, number, number]` 是 primitive tuple，不能用 `.clone()`。
用 spread 複製：`[...value] as Vec3`，避免多個 Command 共用同一個陣列引用。

## canMerge 的辨識條件

同一個節點（uuid）+ 同一個屬性（property）才能合併。
如果只判斷 uuid 不判斷 property，連續改 position 和 rotation 會錯誤合併。

## TypeScript computed key 的型別轉換

`{ [this.property]: value }` 在 strict mode 下推斷為 `{ [x: string]: Vec3 }`，
不直接相容 `Partial<SceneNode>`，需要 `as Partial<SceneNode>`。
這個 cast 是安全的，因為 `property` 的型別已限縮為三個合法 key。
