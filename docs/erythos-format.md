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
  version: 1;                   // 版本欄位,literal,嚴格遞增
  env: SceneEnv;
  nodes: SceneNode[];
};

type SceneEnv = {
  hdri: AssetUrl | null;        // 環境貼圖
  intensity: number;            // 0..N
  rotation: number;             // radians
};

type NodeType = 'mesh' | 'light' | 'camera' | 'prefab' | 'group';

type SceneNode = {
  id: NodeId;                   // UUIDv4
  name: string;
  parent: NodeId | null;        // null = root
  order: number;                // sibling order(整數)
  nodeType: NodeType;           // 決定 asset / light / camera 哪些欄位有意義
  position: Vec3;               // translation
  rotation: Vec3;               // euler XYZ rad
  scale: Vec3;                  // scale
  asset?: AssetUrl;             // mesh / prefab 必有;light / camera / group 不寫
  mat?: MaterialOverride;       // 只 mesh / prefab 可選 override;沒給就用 asset 自帶
  light?: LightProps;           // 只 nodeType === 'light' 寫
  camera?: CameraProps;         // 只 nodeType === 'camera' 寫
  userData?: Record<string, unknown>; // 保留欄位,v1 規定為 `{}`(見「砍掉的東西」)
};

type LightProps = {
  type: 'directional' | 'ambient' | 'point' | 'spot';
  color: HexColor;              // 持久化 hex string,runtime 邊界轉 number
  intensity: number;
};

type CameraProps = {
  type: 'perspective';          // v1 僅支援 perspective,orthographic 留待後續 bump
  fov: number;                  // degrees
  near: number;
  far: number;
};

type MaterialOverride = {
  color?: HexColor;             // "#ffffff"
  roughness?: number;           // 0..1
  metalness?: number;           // 0..1
  emissive?: HexColor;
  emissiveIntensity?: number;
  opacity?: number;             // 0..1
  transparent?: boolean;        // Three.js 渲染需求(opacity < 1 時必開)
  wireframe?: boolean;          // debug 用
};

type Vec3 = [number, number, number];
type HexColor = string;         // #RRGGBB or #RRGGBBAA
type NodeId = string;           // UUIDv4
type AssetUrl = string;         // 見 URI Scheme 章節
```

**Color 表面 vs Runtime**:`HexColor` 是**持久化外觀**(JSON 友好、git diffable、LLM 看得懂)。Runtime 與 Three.js 邊界用 `number`(`0xffffff`)。轉換責任歸 serialize / deserialize 層,Editor / Command / Panel 內部全程操作 `number`。

**`nodeType` 決定欄位有效性**:

| nodeType | asset 必填 | mat | light | camera |
|---|---|---|---|---|
| `mesh` | ✅(`assets://` / `project://` / `materials://` / `blob://`) | optional override | — | — |
| `prefab` | ✅(`prefabs://`) | optional override | — | — |
| `light` | — | — | ✅ | — |
| `camera` | — | — | — | ✅ |
| `group` | — | — | — | — |

範例 JSON:

```json
{
  "version": 1,
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
      "nodeType": "mesh",
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "asset": "assets://primitives/sphere",
      "mat": { "color": "#ffffff", "roughness": 0.5 }
    },
    {
      "id": "9c68e2e0-1234-4abc-9def-000000000002",
      "name": "Key Light",
      "parent": null,
      "order": 1,
      "nodeType": "light",
      "position": [5, 5, 5],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1],
      "light": { "type": "directional", "color": "#ffffff", "intensity": 1.0 }
    }
  ]
}
```

## URI Scheme

`AssetUrl` 分五個 scheme,語意嚴格區分:

| Scheme | 內容 | 範例 | 可變性 |
|---|---|---|---|
| `assets://` | Cloud 二進位資產,content-addressed | `assets://<sha256>/studio.hdr` | **不可變**(hash 顯式於 URL,內容改 = 新 hash = 新 URL) |
| `project://` | 本機 project file 引用(尚未 upload 至雲端 / 純離線專案) | `project://models/chair.glb` | 可變(專案資料夾內檔案被改,URL 字面不變) |
| `prefabs://` | 場景片段(`.erythos` 引用 `.erythos`) | `prefabs://tree-pine` | 可變(原 prefab 更新時引用方跟著新) |
| `materials://` | 共用 PBR material | `materials://gold` | 可變 |
| `blob://` | 本機 IndexedDB 暫存(尚未持久化的 anonymous user 資產) | `blob://abc123` | 不可變(in-memory snapshot) |

**`assets://` vs `project://`**:`assets://` 是 cloud-backed 不可變(hash-pinned),`project://` 是 project file system 內可變引用。寫入時偏好 `assets://`(跨裝置 / 跨帳號可重現);`project://` 留給尚未上傳或無雲端帳號的本機專案。Asset sync Phase B 上線後 client 才開始產 `assets://`,在那之前所有引用都是 `project://`。詳見 `docs/asset-sync-protocol.md` § 跟 local project files 共存。

**v1 範例字面相容**:本文件 v1 schema 範例(下方 § v1 Schema)使用 `assets://<path>` 形式,係 schema v1 歷史寫法。v2 schema bump 將 rewrite 為 `project://<path>`,實作於 asset sync Phase B(對應 issue #840 / `assets://` 重新定義為 cloud-only)。

**解析責任:`AssetResolver`**(`src/core/io/AssetResolver.ts`)— 統一抽象層,將任何 scheme 的 URL 解到 runtime blob URL。

## Invariants(可機械驗)

下列規則寫成 lint rule / CI check / runtime assertion,**任何違反即拒絕儲存**:

1. **檔案大小** ≤ 1MB(典型 < 50KB)
2. **無 inline geometry / texture** — mesh / prefab node 的 `asset` 必為 `AssetUrl` 字串,**禁止** `geometry`、`vertices`、`positions`、`indices`、`uvs` 等 array 欄位
3. **版本嚴格遞增** — `version` 必為正整數;讀到 `version > CURRENT_VERSION` 拒絕載入(明確錯誤訊息,不嘗試「儘量讀」)
4. **node.parent 必須指向同檔內存在的 node id 或 null**(無孤兒、無外部 parent)
5. **nodes[].id 全域唯一**(在同一檔案內)
6. **無循環引用**(prefab 引用鏈用 DAG 環偵測,見 `erythos-architecture.md`)
7. **MaterialOverride 欄位上限** — 超過 8 欄位(扣除 `transparent` / `wireframe` 渲染輔助欄位)的 mat 應抽出成 `materials://` asset
8. **`nodeType` 與輔助欄位一致性** — 例如 `nodeType: 'light'` 必有 `light` 欄位;`nodeType: 'mesh' | 'prefab'` 必有 `asset`(見 v1 Schema 表)
9. **`userData` 必為空 `{}`** — v1 不開放使用者自由欄位(見「砍掉的東西」)
10. **無 prefab 子樹展開** — `nodeType: 'prefab'` node 在 SceneFile 中必為純引用(不含子節點)。Runtime hydrate 才展開,不寫回磁碟
11. **`upAxis` 必為 `'Y'`**(v3+) — 頂層欄位必填,唯一合法值為 `'Y'`;缺少或為其他值 → `SceneInvariantError`(見 § v2 → v3 Migration)

## Material:引用 vs Inline Override

兩種模式並存,語意對應 Figma 的 local style vs override:

- **共用** — `node.asset` 直接指向 `materials://gold`(整個 material 是 asset,所有引用方共享)
- **局部 override** — `node.mat = { color: "#ff0000" }`(只覆寫指定欄位,其他繼承自 `node.asset` 自帶)

**禁止 inline 整個 material 定義**(超過 8 欄位的 mat 應抽出成 `materials://` asset,投影到 invariant #7)。

### Color 表面型 vs Runtime 型

`HexColor`(`"#ffffff"`)是**持久化外觀** — JSON 友好、git diffable、LLM 看得懂、人類可手寫。

`number`(`0xffffff`)是 **Three.js / runtime 型** — Editor / Command / Panel / Viewport 一律用 number。

**邊界規則**:`SceneFormat` serialize / deserialize 函式負責雙向轉換。**Runtime code 任何地方都不操作 hex string**(避免大量 `parseInt('0x' + ...)` 散在 codebase)。同樣適用於 `LightProps.color` 與 `MaterialOverride.emissive`。

## Prefab 引用機制

預設**引用**(reference),非注入(inject)。

```json
{
  "id": "9c68e2e0-...",
  "name": "Tree #1",
  "parent": null,
  "order": 0,
  "nodeType": "prefab",
  "position": [10, 0, 0],
  "rotation": [0, 0, 0],
  "scale": [1, 1, 1],
  "asset": "prefabs://tree-pine",
  "mat": { "color": "#3a5f1c" }
}
```

行為(嚴格):

- prefab 內容**不展開進當前場景檔的 `nodes[]`** — SceneFile 只記**一個** `nodeType: 'prefab'` 的 SceneNode + 引用 URL + 可選 override。**禁止** prefab 子樹的 nodes 出現在父 SceneFile 的 `nodes[]` 中
- prefab 子樹只在 **runtime hydrate 時**才展開(從 `prefabs://` 解析回原 `.erythos` 檔讀出子節點,instantiate 進場景圖,但**不寫入磁碟**)
- 原 prefab(`prefabs://tree-pine`)更新 → 所有引用方下次載入時看到新版
- 想脫鉤 → 使用者明確指令 `Bake / Flatten` → 把 prefab 子樹複製進當前 SceneFile 的 `nodes[]`(每個子節點變獨立 SceneNode 帶新 UUID),從此跟原 prefab 脫鉤(對應 AE 的 `Import as Composition` → `Detach`)。**Bake 是 explicit destructive op**,使用者要主動觸發

DAG 環偵測:見 `erythos-architecture.md` § Reference Cycle Detection。

**為什麼嚴格**:Spec 設計哲學「中型場景 < 50KB」依賴 prefab 引用不展開。一旦 SceneFile 內含 prefab 子樹副本,場景檔會隨 prefab 節點數線性膨脹,`.erythos` 檔在 git diff / LLM 輸入 / 雲端同步上的價值失守。

## Broken Reference 處理

當 `AssetUrl` 解析失敗(原始檔被刪、CDN 404、prefab id 被回收):

| 層 | 行為 |
|---|---|
| 3D viewport | 不顯示該 node(避免錯亂幾何) |
| Scene tree | 該 node **標紅**(視覺警示) |
| 全局 | toolbar 顯示「本場景有 N 個掉檔」警告 chip,點開列出 |
| 檔案本身 | **不刪 node、不修改引用 URL** — 等使用者手動修(資料安全 > 自動清理) |

**適用範圍**:僅 `nodeType: 'mesh' | 'prefab'`(有 `asset` 引用)及 `mat.color = "materials://..."`(若日後支援)。`light` / `camera` / `group` node 沒有外部引用,不適用此章節。

## Migration 規則

`version` 欄位嚴格遞增 → migration registry 線性鏈接。

```typescript
const migrations: Record<number, (data: any) => any> = {
  1: (v0) => { /* upgrade v0 → v1 */ },
  2: (v1) => { /* upgrade v1 → v2 */ },
  // ...
};

function loadScene(raw: { version: number; ... }): ErythosSceneCurrent {
  if (raw.version > CURRENT_VERSION) {
    throw new UnsupportedVersionError(
      `這個檔案是用較新版本的 Erythos 建立的(格式 v${raw.version}),` +
      `你的版本只支援到 v${CURRENT_VERSION}。請更新 Erythos。`
    );
  }
  let data = raw;
  for (let v = raw.version; v < CURRENT_VERSION; v++) {
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

### v1 → v2(已實作,asset sync Phase B)

對應 issue #840:`assets://` scheme 重新定義為 cloud content-addressed,既有 local 用法搬遷至 `project://`(見 § URI Scheme)。v2 schema 將執行 scheme rename:

- 所有 `node.asset` 字面 `assets://<path>` rewrite 為 `project://<path>`
- 所有 `env.hdri` 字面 `assets://<path>` rewrite 為 `project://<path>`
- `materials://` / `blob://` / `prefabs://` 不變
- `assets://<sha256>/<filename>` 形式 v2 起新增,Phase B client 上線後才會出現於 scene file

實作於 `src/core/scene/io/migrations/v1_to_v2.ts` + 對應 fixture `fixtures/v1_sample.erythos` → `v2_sample.erythos`。

### v2 → v3(已實作,Y-up axis schema invariant)

來源:`.claude/編輯器的核心功能設計.md` 第 8 輪 Q5「現在不寫進 schema,未來資產一爛全爛」拍板。

Erythos 採 **Y-up + 公尺**(對齊 GLB/glTF 規範)。v2 以前這是 viewport 約定,沒寫入 schema。v3 補上成不可改的頂層欄位:

```typescript
type ErythosSceneV3 = {
  version: 3;
  upAxis: 'Y';   // 必填,不可改。唯一合法值:'Y'
  env: SceneEnv;
  nodes: SceneNode[];
};
```

Migration 行為:

- 讀到 v2 record → v2→v3 migration 補 `upAxis: 'Y'`(unambiguous:Erythos 從未支援其他 axis)
- 讀到 `upAxis` 存在但 ≠ `'Y'` → **拒絕載入**(`SceneInvariantError`「Erythos only supports Y-up」)
- IndexedDB DB_VERSION 同步升至 3,`onupgradeneeded` cursor-walk 直接在 body 補 `upAxis: 'Y'`

**為何不讓 upAxis 可設定**:asset pipeline(GLB 規格、Three.js 預設、AssetResolver 轉換邏輯)全部硬綁 Y-up。開放 Z-up 選項 = 全鏈要加 if/else,維護成本遠超過使用者效益。Z-up asset → 由 `AssetResolver` 在 import 時轉軸,不進 schema。

實作於 `src/core/scene/io/migrations/v2_to_v3.ts` + fixture `fixtures/v2_sample.erythos` → `v3_sample.erythos`。


## 砍掉的東西(對照 Three.js `toJSON()`)

以下 Three.js 原生欄位**不進** `.erythos`:

- `geometries[]` / `materials[]` / `textures[]` / `images[]` — 通通變引用
- `metadata` 區塊 — 一個 `version` 欄位夠了
- `userData` 自由欄位 — v1 規定 `userData: {}`(保留欄位佔位、避免將來 schema bump 但不開放使用者塞應用狀態進場景檔。Editor / Command / Panel 不得寫入 `userData`)

## 機械驗收清單(供 lint rule / CI 實作)

下列 check 應有 invariant runner script(對應 `initiatives.md` § B):

- [ ] 檔案大小 ≤ 1MB → fail
- [ ] schema validate(zod / ajv 對 `ErythosSceneV1`)
- [ ] 任何 nodes[i] 含 `geometry` / `vertices` / `positions` / `indices` / `uvs` 欄位 → fail
- [ ] node.parent 指向不存在的 id → fail
- [ ] 同 nodes[].id 重複 → fail
- [ ] 解析所有 `AssetUrl`:404 → 警告(非 fail,broken ref 是合法狀態)
- [ ] DAG 環偵測:任何 prefab 鏈含環 → fail
- [ ] 版本欄位:`version` 為正整數 → fail otherwise
- [ ] MaterialOverride 欄位數 > 8(扣除 `transparent` / `wireframe`)→ fail(應抽 `materials://`)
- [ ] `nodeType` 與輔助欄位一致性(`nodeType: 'mesh' \| 'prefab'` 必有 `asset`;`light` 必有 `light` 欄位;`camera` 必有 `camera` 欄位)→ fail otherwise
- [ ] 任何 `userData` 非空 `{}` → fail
- [ ] 父 SceneFile 內含 prefab 子樹 nodes(不是只有一個 `nodeType: 'prefab'` reference node)→ fail

## 開放議題(v1 暫不決,留路)

- **動畫存** — keyframe / timeline 暫不進 `.erythos`(動畫是 GLB 內部的事 OR 走 `.eanim` 引用 — 待第一個動畫需求出現時決定)
- ~~**座標系與單位** — schema 暫不寫死~~ → **已決(v3)**:Y-up + 公尺(對齊 GLB 規範),schema 層寫死 `upAxis: 'Y'`。若引用的 asset 來自 Z-up / 公分,由 `AssetResolver` 在解析時轉換。見 § v3 Schema / § Invariants #11。
- **field-level 衝突合併** — node 級衝突由同步協定處理(見 `erythos-architecture.md`)。同 node 同欄位由兩人同時改,v1 走 last-write-wins on full file,v2 再考慮 CRDT
