# ID 策略設計

**狀態：** 已定案
**關聯：** [scene-format-refactor.md](scene-format-refactor.md) §3.5

---

## 1. 結論：UUID 唯一 + Path 查詢（策略 B）

每個 SceneNode 只有一個 ID 欄位：**UUID**。

```
UUID  — 唯一資料結構，支撐整個場景
Path  — 查詢用 API，runtime 計算，不存檔
```

### 決策過程

雙軌方案（確定性 ID + UUID）被廢案，原因：
- 確定性 ID 受 rename / reparent 影響，會連鎖失效
- undo/redo 中的 command 引用確定性 ID 時，rename 後找不到節點
- 雙軌 mapping 增加複雜度，卻沒有 UUID 單獨解決不了的問題
- 「根據場景結構找節點」是查詢需求，不需要是 ID 欄位

---

## 2. UUID

### 2.1 特性

- 全域唯一、建立即生成、永不改變
- rename、reparent、reorder 都不影響
- 存檔時直接序列化，讀檔時直接還原
- 跨場景可追溯（prefab 關係）

### 2.2 生成時機

**節點建立時**（不是存檔時），確保：
- 建立後立刻可用於 Selection、Command、Event 等系統
- 不存在「還沒有 ID」的空窗期

### 2.3 生命週期

| 事件 | UUID 行為 |
|------|----------|
| 建立節點 | 生成新 UUID |
| rename | 不變 |
| reparent | 不變 |
| reorder | 不變 |
| 修改 transform / components | 不變 |
| 刪除節點 | UUID 從場景中移除 |
| undo 刪除 | 恢復原 UUID |
| 複製節點 | 生成新 UUID（副本是新節點） |
| save / load | 保留原 UUID |

---

## 3. Path 查詢 API

Path 不是 ID，是 runtime 計算的查詢工具。

### 3.1 用途

- **Debug**：`getNodePath(uuid)` → `"Scene/props/chair"`（人類可讀）
- **結構查詢**：`findNodeByPath("Scene/props/chair")` → `SceneNode | null`
- **套用 components**：按結構位置批次操作（例如「所有 Scene/lights/* 套用某設定」）

### 3.2 計算方式

```typescript
function getNodePath(nodes: SceneNode[], uuid: string): string {
  const parts: string[] = [];
  let current = nodes.find(n => n.id === uuid);
  while (current) {
    parts.unshift(current.name);
    current = current.parent
      ? nodes.find(n => n.id === current!.parent)
      : null;
  }
  return parts.join('/');
}
```

### 3.3 注意事項

- Path 可能不唯一（同層兩個節點同名）→ 查詢應回傳陣列或首個匹配
- Path 是即時快照，不快取（結構變更後自動反映）

---

## 4. 場景檔案中的表示

```jsonc
{
  "version": 1,
  "nodes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",  // UUID
      "name": "Scene",
      "parent": null,
      "order": 0,
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "components": {},
      "userData": {}
    },
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "name": "chair",
      "parent": "550e8400-e29b-41d4-a716-446655440000",  // parent 的 UUID
      "order": 0,
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "components": {
        "mesh": { "source": "model/chair.glb" }
      },
      "userData": {}
    }
  ]
}
```

- `id` 欄位即為 UUID
- `parent` 引用 parent 的 UUID
- 不存在第二個 ID 欄位

---

## 5. 與各系統的關係

所有系統統一使用 UUID：

| 系統 | 使用方式 |
|------|---------|
| Selection | `Set<string>`（UUID 集合） |
| Command / Undo | command 存 UUID，undo 時以 UUID 查找節點 |
| EventEmitter | event payload 攜帶 UUID |
| Bridge / UI | `Accessor<string[]>`（UUID 陣列） |
| 同步層 Map | `Map<string, Object3D>`（UUID → Object3D） |
| Save/Load | 直接序列化/還原 UUID |
| Prefab | UUID 作為追溯鍵 |
| 結構查詢 | `findNodeByPath()` / `getNodePath()` API |

---

## 6. 對 scene-format-spec.md 的修訂

原 spec `id` 欄位定義為 `string`（唯一識別碼），需明確為 UUID：

| 欄位 | 原定義 | 修訂 |
|------|--------|------|
| `id` | string — 唯一識別碼 | string — UUID v4，建立時生成，永不改變 |
| `parent` | string \| null — 父節點 ID | string \| null — 父節點的 UUID |

---

## 7. 變更紀錄

| 日期 | 內容 |
|------|------|
| 2026-04-11 | 建立設計文件（雙軌方案） |
| 2026-04-11 | 廢案雙軌，改為策略 B：UUID 唯一 + Path 查詢 |
