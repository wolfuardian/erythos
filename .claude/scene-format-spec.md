# Scene Format Specification

**Version:** 1

---

## 1. 頂層結構

```jsonc
{
  "version": 1,
  "nodes": [ ...Node ]
}
```

---

## 2. Node

扁平陣列，透過 `parent` 建構樹。所有欄位皆必填。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | string | UUID v4，節點建立時生成，永不改變 |
| `name` | string | 節點名稱 |
| `parent` | string \| null | 父節點的 UUID；根節點為 `null` |
| `order` | integer ≥ 0 | 同層排序 |
| `position` | [x, y, z] | 本地位移 |
| `rotation` | [x, y, z] | Euler 弧度，套用順序 XYZ |
| `scale` | [x, y, z] | 本地縮放 |
| `components` | object | 元件容器，無元件時為 `{}` |
| `userData` | object | 自訂資料，無資料時為 `{}` |

---

## 3. Components

鍵為元件類型，值為該元件的參數。可擴充。

### mesh

```jsonc
{ "source": "model/car.glb" }                                  // 掛載整個場景根
{ "source": "model/car.glb:root|CarParts|wheels|wheelLeft" }    // 掛載子樹
```

**source 格式：** `<filePath>` 或 `<filePath>:<nodePath>`
- `filePath` — GLB 檔案相對路徑
- `nodePath` — 以 `|` 分隔的節點路徑，省略時掛載整個場景根

---

## 4. 資源快取

同一個 `filePath` 只載入一次，多個 node 引用同一檔案的不同子樹時共用快取。

適用範圍：
- **GLB** — 載入一次，各 node 依 `nodePath` 從快取中 clone 子樹
- **Texture** — 同一張貼圖被多個材質引用時共用同一個 texture 實例

快取鍵為 `filePath`（不含 `nodePath`）。

---

## 5. 設計原則

- **扁平優先** — 節點以陣列儲存，避免巢狀遞迴。
- **全部寫出** — 每個節點必須包含所有欄位，不依賴隱含預設值。
- **元件可擴充** — `components` 以 key-value 承載任意元件（mesh、light、camera…）。
- **userData 不限制** — 開放欄位，schema 不約束內容。

---

## 6. TypeScript 型別定義

```typescript
type Vec3 = [number, number, number];

interface SceneNode {
  id: string;          // UUID v4
  name: string;
  parent: string | null; // parent UUID
  order: number;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  components: Record<string, unknown>;
  userData: Record<string, unknown>;
}

interface MeshComponent {
  source: string;
}

interface SceneFile {
  version: number;
  nodes: SceneNode[];
}
```

---

## 7. 最小範例

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "a1",
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
      "id": "b2",
      "name": "chair",
      "parent": "a1",
      "order": 0,
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "components": {
        "mesh": { "source": "model/chair.glb:root|frame" }
      },
      "userData": {}
    }
  ]
}
```
