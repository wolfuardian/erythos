# Erythos Asset Sync Protocol — Asset Sync v0

> 本文件定義 Erythos 雲端 asset 同步協定。Scene sync 見 `docs/sync-protocol.md`。
>
> 來源:`.claude/編輯器的核心功能設計.md` 第 7、8、12 輪顧問對談決策。

## 設計哲學

Asset = scene 引用的二進位資源(HDR / GLB / texture / material / prefab JSON 等)。**asset 不混進 `.erythos` 場景檔**,scene 只記 URL 引用。

- **Content-addressed,不可變**:URL 帶 sha256 hash,內容改 = 新 hash = 新 URL。**舊 URL 永遠指向同一份內容**。
- **離 Postgres BYTEA**:asset 體積大(HDR ~10MB / GLB ~50MB),Postgres 不適合;走 Linode Object Storage(S3-compatible)。
- **Server-side dedup**:client 上傳前先算 sha256,server 已存 → 跳過上傳;節省頻寬與儲存。
- **Runtime 用 blob URL**:client 載入後在記憶體建 `blob:` URL 給 Three.js 用,**永不寫回 `.erythos`**(scene 永遠存 `assets://`)。

反指標:asset 直接 inline 進 scene、URL 不帶 hash 導致內容偷偷變動、asset 走 Postgres BYTEA、client 重複上傳同檔案、asset 同 URL 多版本。

## 架構選擇(已拍板)

| 項目 | 選項 | 理由 |
|------|------|------|
| 儲存 | Linode Object Storage(S3-compatible) | asset 大;Postgres BYTEA 不適合 |
| 不可變性 | URL 帶 sha256 hash | 顧問 Q4 「git 思維」選項;asset 改 = 新 URL,絕不偷變 |
| Dedup | content-addressing | 上傳前算 hash,server 已存即跳過;省頻寬 |
| URL scheme | `assets://<sha256>/<filename>` | 場景檔內 stable identifier;server 解析時 map 到 Object Storage 真實 URL |

## URL Scheme

```
assets://<sha256>/<filename>

範例:
  assets://a3f9b2c8d4e5.../studio.hdr
  assets://7e1d4f5a9b3c.../tree.glb
```

- `<sha256>`:64 字元 hex
- `<filename>`:原檔名,純展示用,真正識別靠 hash

**為什麼 hash 在 URL 不在 metadata**:hash 在 URL = 自證身份;不在 URL = 必須查 metadata 才知道內容,違反不可變承諾。

## 跟 local project files 共存

`assets://` 專指 cloud content-addressed asset。本機 project 內的 file 引用走 `project://<path>`(scheme 規範見 `docs/erythos-format.md` § URI Scheme)。

兩 scheme 切換時機:

| 階段 | scene file 內字面 |
|------|------------------|
| Anonymous / offline mode(無帳號) | 全 `project://` |
| Phase B 之前(本 spec 未實作) | 全 `project://` |
| 登入 + 上傳成功後 | 該 asset 字面從 `project://<path>` 改寫為 `assets://<sha256>/<filename>` |
| 既有 v1 專案 migrate 至 v2 | `assets://<path>` 全 rewrite 為 `project://<path>`(見 `erythos-format.md` § v1 → v2) |

**為什麼分兩個 scheme**:

- `assets://` — 內容不可變、hash 顯式 = 跨裝置 / 跨帳號可重現
- `project://` — 內容可變、無 hash = 純本機,沒上傳沒不可變承諾

一個 namespace 表「兩種語意」會撞 parser:`assets://abc123/sphere.glb` 既能 parse 成 `hash=abc123 / file=sphere.glb`,也能 parse 成 `path=abc123/sphere.glb`。早期 spec 草案嘗試用「first segment 是不是 64 hex chars」啟發式 disambiguate,被推翻(違反 URL 自證身份哲學;且 64 hex chars 的合法 filename 會誤判)。**scheme 一刀分明,parser 不依靠啟發式**。

## Scene 內承載 asset URL 的欄位

upload + URL rewrite 流程(Phase B `uploadSceneBinaries`)需要走訪 scene 取出所有 asset URL。當前 v2 SceneFormat 對齊 `src/core/scene/SceneFormat.ts`,以下欄位承載 asset URL:

| 欄位 | 型別 | 承載 scheme | 備註 |
|------|------|-------------|------|
| `SceneNode.asset` | `string \| undefined` | `project://` / `assets://` / `prefabs://` / `blob://` / `materials://` | mesh / prefab nodeType 必填;light / camera / group 無 |
| `SceneEnv.hdri` | `string \| null` | `project://` / `assets://` / `blob://` | scene 環境 HDRI;`null` = 無環境 |

未來新增 asset 欄位(spec 演進)時必須同步更新:

- 本 spec 此表
- `src/core/sync/asset/uploadSceneBinaries.ts`(pre-push walk 範圍 + URL rewrite)
- `src/core/io/AssetResolver.ts`(runtime blob URL resolve 範圍)

漏一處 = 該 asset 永遠不上傳 / 永遠不解析,直到下次有人 grep `SceneFormat.ts` 抓到才修。

## 資料模型

```sql
CREATE TABLE assets (
  hash         TEXT PRIMARY KEY,            -- sha256 hex,64 字元
  filename     TEXT NOT NULL,               -- 原檔名,展示用
  mime_type    TEXT NOT NULL,
  size         BIGINT NOT NULL,             -- byte
  storage_url  TEXT NOT NULL,               -- Object Storage 真實 URL(後台用)
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- nullable: spec § Open Questions 推薦 GDPR 刪帳號改 NULL,refs PR #961
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ref_count    INTEGER NOT NULL DEFAULT 0   -- 給未來 GC,v0 不啟用
);

CREATE INDEX assets_uploader_idx ON assets(uploaded_by);
```

`ref_count` 是給未來 garbage collection 用的:0 ref + 30 天無人引用 = 候選清除。**v0 不啟用 GC**,空間便宜信任貴。

## REST API

### `HEAD /assets/:hash`

查 asset 是否已存在。client 上傳前先 HEAD,200 = 已存(不必上傳),404 = 不存。

```
Response 200:                       # 已存,client 跳過上傳
  Headers:
    Content-Length: <size>
    ETag: "<hash>"

Response 404:                       # 未存,client 應 POST
```

### `POST /assets`

上傳。multipart form-data 帶 file + 預期 hash(client 算好)。server 驗證 hash 對不上 → 400。

```
Request:
  Content-Type: multipart/form-data
  Body:
    file:          <binary>
    expected_hash: <sha256 hex>

Response 201 Created:               # 新建
  Body: { "hash": "...", "url": "assets://<hash>/<filename>" }

Response 200 OK:                    # 已存,直接回 URL(idempotent)
  Body: { "hash": "...", "url": "..." }

Response 400:                       # hash 對不上 client 宣告值
Response 413:                       # 超過 quota / 單檔上限
```

### `GET /assets/:hash`

下載。client 拿到後在記憶體建 blob URL,**不存回 `.erythos`**。

```
Response 200:
  Headers:
    Content-Type:  <mime>
    Cache-Control: public, max-age=31536000, immutable
    ETag:          "<hash>"
  Body:
    <binary>
```

`Cache-Control: immutable` 是 hash-based URL 的天然好處 — browser、CDN 全可永久 cache。內容改了會是新 URL,絕不會 stale。

## Quota

| Plan | Asset 總空間 | 單檔上限 |
|------|-------------|---------|
| free | 500 MB | 50 MB |
| pro  | 50 GB   | 500 MB |

(數字 v0 暫定,Phase D 上線時再校準。)

`storage_used` 欄位 day 1 起就在 `users` 表(已釘進 sync-protocol.md「資料模型」),計費時直接讀。

## Broken Reference

asset 對應的 hash 從 server 拿 404 時(已實作於 schema v1 phase 3,PR #822):

- scene tree 該 node 標紅
- 3D 空間不顯示該 node 的 mesh
- toolbar `BrokenRefsBadge` 顯示總數
- **不阻擋場景載入**,其他 node 仍正常

刪除路徑:**asset 永不主動刪**(content-addressed,刪了就破壞所有引用)。GDPR「刪除帳號」時清自己上傳的 asset,但其他人若已引用該 asset,其引用斷裂(這是當前 broken-ref UI 已涵蓋的場景)。

## 砍掉的東西

- ❌ **asset inline 進 scene** — 違反設計哲學第一條;Three.js `toJSON()` 的反指標
- ❌ **URL 不帶 hash 的可變 asset** — 顧問 Q4 (b);使用者改 asset 內容會偷偷影響所有引用該 URL 的場景
- ❌ **asset 走 Postgres BYTEA** — 大檔不適合;Object Storage 是正解
- ❌ **client 重複上傳同檔案** — HEAD 預檢省頻寬;hash dedup 在 server 端最終 enforce
- ❌ **asset 版本管理(同 URL 多版本)** — content-addressing 跟版本管理是兩個世界,不混用;要新版 = 新檔 = 新 hash = 新 URL
- ❌ **自動 GC 0-ref asset(v0)** — 留人工或長 cron + 30 天緩衝再考慮;空間便宜信任貴

## Open Questions

### Public 預設 asset

HDR 範例庫、primitive(sphere / cube)— 站方提供的公共 asset 怎麼處理?

- 推薦:`assets://public/<hash>/<name>` 不同 namespace,不計入使用者 quota
- 站方專屬上傳通道,使用者只讀

### CDN 前置

Linode Object Storage 沒 CDN,直接 serve 大檔慢。Cloudflare 在前面當 CDN proxy?

- v0 不做;規模小直接 Object Storage 夠
- ~100 active users 後考慮加 CDN

### 跨帳號 dedup vs GDPR

A 上傳 `studio.hdr` 拿到 hash X,B 上傳同檔案 → 也拿 X(content dedup,storage 只存一份)。但 A 刪帳號時 B 的引用該倖存還是斷?

- 推薦:**asset 永不主動刪**(已釘);GDPR 刪除帳號時把該 user 的 `assets.uploaded_by` 改 null,storage 不動 — `ref_count > 0` 就保留。完全孤兒(0 ref + 上傳者已刪)再進 GC 候選。
- 這條會在 Phase D GDPR 流程細化時再敲定 SQL。

## 實作里程碑

- **Phase A** — Spec 凍結(本文件 review)
- **Phase B** — client 加 `AssetResolver` 抽象層,接 mock asset server(server 用 in-memory map);客戶端側打通流程
- **Phase C** — Linode Object Storage bucket 開設 + S3-compatible SDK 接入
- **Phase D** — `POST /assets` / `HEAD /assets/:hash` / `GET /assets/:hash` 三 endpoint + Postgres `assets` 表
- **Phase E** — GDPR 流程(導出 + 刪除帳號連帶 asset 處理)

Phase A–B 可平行 scene sync 的 Phase A–B(共用同一份 client SyncEngine 抽象)。
