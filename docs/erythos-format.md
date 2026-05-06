# Erythos File Format Spec — `.erythos` v1

> 本文件定義 `.erythos` 檔案格式的契約與不變量。實作層細節見 `src/core/`。

## 設計哲學

`.erythos` 檔案是場景的**人類可讀引用清單**,不是場景的完整快照。

- 場景 = 「**引用**哪些資產」 + 「**怎麼擺**它們」 + 「**環境**設定」
- vertex / texture pixel 不屬於「場景」,屬於「資產」 — 後者用 URL 引用,**不 inline 進 JSON**
- 目標:中型場景(100 物件)< 50KB,LLM 一個 prompt 吃得下
- 反指標:Three.js 原生 `toJSON()`(把 geometry buffer 倒進 JSON,10MB 模型變 40MB JSON)

## v1 Schema

```typescript
type ErythosSceneV1 = {
  v: 1;                         // 版本欄位,嚴格遞增
  env: SceneEnv;
  nodes: SceneNode[];
};

type SceneEnv = {
  hdri: AssetUrl | null;        // 環境貼圖
  intensity: number;            // 0..N
  rotation: number;             // radians
};

type SceneNode = {
  id: NodeId;                   // UUIDv4
  name: string;
  parent: NodeId | null;        // null = root
  order: number;                // sibling order(整數)
  asset: AssetUrl;              // 引用,禁止 inline geometry
  t: Vec3;                      // translation
  r: Vec3;                      // euler XYZ rad
  s: Vec3;                      // scale
  mat?: MaterialOverride;       // optional override,沒給就用 asset 自帶
};

type MaterialOverride = {
  color?: HexColor;             // "#ffffff"
  roughness?: number;           // 0..1
  metalness?: number;           // 0..1
  emissive?: HexColor;
  emissiveIntensity?: number;
  opacity?: number;             // 0..1
};

type Vec3 = [number, number, number];
type HexColor = string;         // #RRGGBB or #RRGGBBAA
type NodeId = string;           // UUIDv4
type AssetUrl = string;         // 見 URI Scheme 章節
```

範例 JSON:

```json
{
  "v": 1,
  "env": {
    "hdri": "assets://studio.hdr",
    "intensity": 1.0,
    "rotation": 0
  },
  "nodes": [
    {
      "id": "9c68e2e0-1234-4abc-9def-000000000001",
      "name": "Sphere",
      "parent": null,
      "order": 0,
      "asset": "assets://primitives/sphere",
      "t": [0, 0, 0],
      "r": [0, 0, 0],
      "s": [1, 1, 1],
      "mat": { "color": "#ffffff", "roughness": 0.5 }
    }
  ]
}
```

## URI Scheme

`AssetUrl` 分四個 scheme,語意嚴格區分:

| Scheme | 內容 | 範例 | 可變性 |
|---|---|---|---|
| `assets://` | 二進位資產(GLB / HDR / texture / primitive mesh) | `assets://studio.hdr` | 不可變(隱含 hash 由 resolver 補) |
| `prefabs://` | 場景片段(`.erythos` 引用 `.erythos`) | `prefabs://tree-pine` | 可變(原 prefab 更新時引用方跟著新) |
| `materials://` | 共用 PBR material | `materials://gold` | 可變 |
| `blob://` | 本機 IndexedDB 暫存(尚未 upload 的 anonymous user 資產) | `blob://abc123` | 不可變 |

**解析責任:`AssetResolver`(in `src/core/`)** — 統一抽象層,本機(IndexedDB)/ 專案資料夾 / CDN 三條路徑都走它。詳見 memory `feedback_url_first_principle.md`。

## Invariants(可機械驗)

下列規則寫成 lint rule / CI check / runtime assertion,**任何違反即拒絕儲存**:

1. **檔案大小** ≤ 1MB(典型 < 50KB)
2. **無 inline geometry / texture** — `nodes[].asset` 必為 `AssetUrl` 字串,**禁止** `geometry`、`vertices`、`positions`、`indices`、`uvs` 等 array 欄位
3. **版本嚴格遞增** — `v` 必為正整數;讀到 `v > CURRENT_VERSION` 拒絕載入(明確錯誤訊息,不嘗試「儘量讀」)
4. **node.parent 必須指向同檔內存在的 node id 或 null**(無孤兒、無外部 parent)
5. **nodes[].id 全域唯一**(在同一檔案內)
6. **無循環引用**(prefab 引用鏈用 DAG 環偵測,見 `erythos-architecture.md`)
7. **MaterialOverride 欄位上限**(超過 8 欄位的 mat 應抽出成 `materials://` asset)

## Material:引用 vs Inline Override

兩種模式並存,語意對應 Figma 的 local style vs override:

- **共用** — `node.asset` 直接指向 `materials://gold`(整個 material 是 asset,所有引用方共享)
- **局部 override** — `node.mat = { color: "#ff0000" }`(只覆寫指定欄位,其他繼承自 `node.asset` 自帶)

**禁止 inline 整個 material 定義**(超過 8 欄位的 mat 應抽出成 `materials://` asset,投影到 invariant #7)。

## Prefab 引用機制

預設**引用**(reference),非注入(inject)。

```json
{
  "id": "...",
  "name": "Tree #1",
  "asset": "prefabs://tree-pine",
  "t": [10, 0, 0],
  "mat": { "color": "#3a5f1c" }
}
```

行為:

- prefab 內容**不展開進當前場景檔** — 只記引用 + override
- 原 prefab(`prefabs://tree-pine`)更新 → 所有引用方下次載入時看到新版
- 想脫鉤 → 使用者明確指令 `Bake / Flatten` → 把 prefab 內容展平進當前場景,從此跟原 prefab 脫鉤(對應 AE 的 `Import as Composition` → `Detach`)

DAG 環偵測:見 `erythos-architecture.md` § Reference Cycle Detection。

## Broken Reference 處理

當 `AssetUrl` 解析失敗(原始檔被刪、CDN 404、prefab id 被回收):

| 層 | 行為 |
|---|---|
| 3D viewport | 不顯示該 node(避免錯亂幾何) |
| Scene tree | 該 node **標紅**(視覺警示) |
| 全局 | toolbar 顯示「本場景有 N 個掉檔」警告 chip,點開列出 |
| 檔案本身 | **不刪 node、不修改引用 URL** — 等使用者手動修(資料安全 > 自動清理) |

## Migration 規則

`v` 欄位嚴格遞增 → migration registry 線性鏈接。

```typescript
const migrations: Record<number, (data: any) => any> = {
  1: (v0) => { /* upgrade v0 → v1 */ },
  2: (v1) => { /* upgrade v1 → v2 */ },
  // ...
};

function loadScene(raw: { v: number; ... }): ErythosSceneCurrent {
  if (raw.v > CURRENT_VERSION) {
    throw new UnsupportedVersionError(
      `這個檔案是用較新版本的 Erythos 建立的(格式 v${raw.v}),` +
      `你的版本只支援到 v${CURRENT_VERSION}。請更新 Erythos。`
    );
  }
  let data = raw;
  for (let v = raw.v; v < CURRENT_VERSION; v++) {
    data = migrations[v + 1](data);
  }
  return data;
}
```

**讀取時 migrate ≠ 寫入時 migrate**:

- **讀取** — 任何版本進來 → memory 升 latest → 操作。**Prefab 被引用時也 migrate,但不寫回磁碟**(prefab 可能被多人共用,等使用者主動編輯時才升版寫回)
- **寫入** — 永遠寫 latest 版本。**不提供「另存為舊版」**選項(避免支援噩夢)

每個 `migrations[N]` 寫的當下就要存 fixture:`fixtures/v{N-1}_sample.erythos` + 預期輸出。CI 跑「fixture → migrate → 等於預期」。

### Backup

每次 migration 前留 `.erythos.bak.v{原版本}`(IndexedDB 存一份 raw)。**永遠不主動清** — 由使用者手動。空間便宜,信任貴。

## 砍掉的東西(對照 Three.js `toJSON()`)

以下 Three.js 原生欄位**不進** `.erythos`:

- `geometries[]` / `materials[]` / `textures[]` / `images[]` — 通通變引用
- `metadata` 區塊 — 一個 `v` 欄位夠了
- `userData` 自由欄位 — 暫不開放(避免使用者塞整個應用狀態進場景檔)

## 機械驗收清單(供 lint rule / CI 實作)

下列 check 應有 invariant runner script(對應 `initiatives.md` § B):

- [ ] 檔案大小 ≤ 1MB → fail
- [ ] schema validate(zod / ajv 對 `ErythosSceneV1`)
- [ ] 任何 nodes[i] 含 `geometry` / `vertices` / `positions` / `indices` / `uvs` 欄位 → fail
- [ ] node.parent 指向不存在的 id → fail
- [ ] 同 nodes[].id 重複 → fail
- [ ] 解析所有 `AssetUrl`:404 → 警告(非 fail,broken ref 是合法狀態)
- [ ] DAG 環偵測:任何 prefab 鏈含環 → fail
- [ ] 版本欄位:`v` 為正整數 → fail otherwise
- [ ] MaterialOverride 欄位數 > 8 → fail(應抽 `materials://`)

## 開放議題(v1 暫不決,留路)

- **動畫存** — keyframe / timeline 暫不進 `.erythos`(動畫是 GLB 內部的事 OR 走 `.eanim` 引用 — 待第一個動畫需求出現時決定)
- **座標系與單位** — 預設 Y-up + 公尺(對齊 GLB 規範),但 schema 暫不寫死。若引用的 asset 來自 Z-up / 公分,由 `AssetResolver` 在解析時轉換
- **field-level 衝突合併** — node 級衝突由同步協定處理(見 `erythos-architecture.md`)。同 node 同欄位由兩人同時改,v1 走 last-write-wins on full file,v2 再考慮 CRDT
