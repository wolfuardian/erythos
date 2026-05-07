# Erythos Sync Protocol — Cloud Sync v0

> 本文件定義 Erythos 雲端同步協定的契約。實作層細節見 `src/core/sync/`(尚未建立)。
>
> Asset(HDR / GLB / texture)同步另見 `docs/asset-sync-protocol.md`。
>
> 來源:`.claude/編輯器的核心功能設計.md` 第 11–12 輪顧問對談決策。

## 設計哲學

Erythos 是 **local-first** 編輯器。雲端負責「多裝置同步」與「分享連結」,**不負責**讓使用者能不能工作。

- **雲端壞 ≠ 編輯不能**:本機 IndexedDB 是 source of truth 的副本,離線完整可編輯。
- **整檔上傳,非增量**:`.erythos` 檔案 < 50KB,優化 incremental sync 不划算;LWW per file 心智簡單。
- **Optimistic Concurrency**:server 永不默默覆蓋。client 帶過時版本 → 409 Conflict + UI 跳對話框。
- **不做 server-side merge**:不打 CRDT、不做欄位級合併。衝突一律使用者拍板。
- **Multi-device sync only**:同一帳號跨裝置。多人協作(不同帳號同檔)是 v2 議題,本 spec 不涵蓋。

反指標:server-side 自動 merge / CRDT / pessimistic lock(編輯前 acquire lock)。三條都會把 solo dev 拖進泥沼,且不符 local-first 哲學。

## 架構選擇(已拍板)

| 項目 | 選項 | 理由 |
|------|------|------|
| Hosting | 單一 Linode VPS 全包 | solo dev 起手最快;Postgres + Node API + 靜態檔同機器,省一個服務、省一次 round-trip |
| Scene blob 儲存 | Postgres `BYTEA` | scene < 50KB,Postgres 直接存最快;Asset(HDR / GLB)才用 Object Storage |
| 同步協定 | Optimistic concurrency + 整檔 PUT | 90% local-first 系統的起手式,撐到 1000 用戶沒問題 |
| 衝突偵測 | HTTP `If-Match` etag(RFC 7232) | 標準 header,不自訂;`fetch()`、Express、Fastify 全認得 |

## 帳管(已決)

源於 11–12 輪對談。

| # | 題目 | 拍板 |
|---|------|------|
| 1 | 沒登入能用嗎 | 可用,本機 IndexedDB 存;要分享 / 同步才登入(降低首次體驗摩擦) |
| 2 | 帳號識別 | email-only 起手;URL 用 user_id 短 hash,handle 後續再加(不為未來美感增加今天的摩擦) |
| 3 | 多裝置同步 vs 多人協作 | v0 只做前者;後者(衝突解決 / CRDT / presence)是 v2 議題 |
| 4 | 計費時機 | ~500 active users 或 cloud 費 > $50/mo 時上 Stripe;day 1 預留 `plan` / `storage_used` 欄位但 UI 不出現付費 |
| 5 | GDPR | day 1 上「導出我的資料」「刪除帳號」兩個按鈕 |
| 6 | 共享場景所有權 | Figma / GitHub fork model:A 擁有,B 只能 fork 出新場景 |
| 7 | Anonymous → Registered 轉換 | 註冊時 UI 提示「以下本機 N 個場景會加入你的帳號」讓使用者勾選 |

## 認證實作(已決)

| 層 | 選型 | 理由 |
|----|------|------|
| Auth library | **Better Auth** | OSS、框架無關;Postgres adapter / GitHub OAuth / session cookie 一份 config 全包;Lucia 2024 已 deprecated 不選 |
| 登入方式 | **GitHub OAuth only(v0)** | Erythos 受眾多為設計師 + 開發者,GitHub 帳號是合理預設;省去寄信 service 第三方依賴(Resend / SPF / DKIM / IP warmup) |
| Token 形式 | **Session cookie**(server-side state) | 單一 VPS、Postgres 已在,JWT 的 stateless 優勢用不到;`Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax`;Postgres `sessions` 表加 index → query < 1ms |
| Magic link + Resend | **v0.1 後加題** | 等真有非 GitHub 使用者抱怨再加;Better Auth 換 adapter 1 天搞定 |

OAuth flow:`Sign in with GitHub` → redirect to github.com → 授權 → 帶 `code` 回 callback → server 換 access token + 取 user `id` / `email` / `avatar_url` → 寫 `users` row(若 first time)+ 開 `sessions` row + 回寫 cookie。

## 資料模型

server-side schema(Postgres):

```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id    BIGINT UNIQUE NOT NULL,         -- GitHub OAuth 主識別
  email        TEXT UNIQUE NOT NULL,           -- 必須要 email scope
  github_login TEXT NOT NULL,                  -- GitHub username,展示用
  avatar_url   TEXT,                           -- GitHub avatar URL
  handle       TEXT UNIQUE,                    -- 內部短 hash,URL 識別用;v0 用 user_id 即可,handle 後加
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan         TEXT NOT NULL DEFAULT 'free',   -- 計費預留欄位,v0 全 'free'
  storage_used BIGINT NOT NULL DEFAULT 0       -- 計費預留;byte 數
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                -- random opaque token,寫進 cookie
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);  -- 給過期 cleanup cron

CREATE TABLE scenes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 0,   -- 嚴格遞增,衝突偵測用
  body        BYTEA NOT NULL,               -- .erythos JSON 二進位
  body_size   INTEGER NOT NULL,             -- 給計費 / quota
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scenes_owner_idx ON scenes(owner_id);

CREATE TABLE scene_versions (    -- append-only 歷史,給「scene history = git-like」做基礎
  scene_id    UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  body        BYTEA NOT NULL,
  body_size   INTEGER NOT NULL,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by    UUID NOT NULL REFERENCES users(id),
  PRIMARY KEY (scene_id, version)
);
```

**為什麼 `scenes` + `scene_versions` 雙表**:`scenes` 永遠拿最新版(熱路徑 1 row lookup);`scene_versions` 是 append-only history,給未來「命名版本 / time travel」用。冷資料,不影響熱路徑效能。

**為什麼 `version` 是 INTEGER 不是 timestamp**:單調遞增整數比 timestamp 簡單(無時鐘漂移問題),etag 直接序列化整數即可。

## REST API

### `GET /scenes/:id`

取場景。匿名可呼叫公開場景,登入可呼叫自己擁有 + 公開場景。

```
Response 200:
  Headers:
    ETag: "5"                       # 當前 version,雙引號是 RFC 7232 規定
    Content-Type: application/json
  Body:
    {
      "id": "...",
      "owner_id": "...",
      "name": "My Scene",
      "version": 5,
      "body": { ... .erythos JSON ... }
    }

Response 404:                       # 不存在或無權限(統一回 404,不洩露存在性)
```

### `PUT /scenes/:id`

寫回場景。**必須帶 `If-Match` header**,否則 428。

```
Request:
  Headers:
    If-Match: "5"                   # client 上次拉到的 version
    Content-Type: application/json
  Body:
    { ... 整個 .erythos JSON ... }

Response 200:                       # 接受,version + 1
  Headers:
    ETag: "6"
  Body:
    { "version": 6 }

Response 409 Conflict:              # base_version 不符,雲端有更新
  Headers:
    ETag: "7"                       # 雲端目前版本
  Body:
    {
      "current_version": 7,
      "current_body": { ... 雲端版本 .erythos ... }
    }

Response 428 Precondition Required: # 沒帶 If-Match
Response 412 Precondition Failed:   # If-Match 但格式錯誤
Response 413 Payload Too Large:     # body 超過 1MB 上限(.erythos 規範)
```

### `POST /scenes`

建立新場景。

```
Request:
  Body:
    {
      "name": "My Scene",
      "body": { ... 初始 .erythos ... }
    }

Response 201:
  Headers:
    Location: /scenes/<new_id>
    ETag: "0"
  Body:
    { "id": "<new_id>", "version": 0 }
```

### `DELETE /scenes/:id`

軟刪除(進 trash 表,30 天內可復原)。v0 可省略,etag 不適用。

## 衝突解決流程(409 處理)

client 收到 409 時,**永遠先把本機版本寫進 `.erythos.bak.v{base_version}`** 再進對話框。確保不論使用者選哪邊,本機改動都不會消失。

對話框三選一,**v0 只實作 (a) 與 (b)**:

| 選項 | 動作 | v0 |
|------|------|-----|
| (a) **保留本機**(我贏) | 載入雲端 body 進記憶體後不顯示,直接 PUT 再來一次,`If-Match=current_version` | ✅ |
| (b) **用雲端**(雲端贏) | 載入雲端 body 蓋掉編輯區,本機改動已在 `.bak` 留底 | ✅ |
| (c) **看 diff 自選** | 一欄一欄比,使用者勾哪邊保留 | ❌ v2 |

(c) 是顧問當時點的「最誠實」選項,但寫 diff 演算法是另一週的事;solo dev v0 不寫,(a)+(b) 配 backup 已不會丟資料。

## 錯誤碼總覽

| Status | 意義 | client 行為 |
|--------|------|-------------|
| 200 | OK | 繼續 |
| 201 | Created | 記下新 id |
| 401 | Unauthorized(沒登入或 token 過期) | 跳登入 |
| 403 | Forbidden(身份正確但無權) | 顯示「無權限」 |
| 404 | Not Found(不存在或無權,故意混淆) | 顯示「找不到」 |
| 409 | Conflict(base_version 過時) | 跳衝突對話框 |
| 412 | Precondition Failed(If-Match 格式錯) | bug,回報 telemetry |
| 413 | Payload Too Large(> 1MB) | 顯示「場景超過上限」 |
| 428 | Precondition Required(漏 If-Match) | bug,回報 telemetry |
| 500 | Server Error | retry 一次,失敗顯示「同步失敗,本機已存」 |

## 砍掉的東西(反指標)

- ❌ **Server-side auto merge** — CRDT、欄位級 last-write-wins、3-way merge。一律不做。衝突 = 使用者拍板。
- ❌ **Pessimistic lock**(編輯前 acquire lock) — 違反 local-first;網路斷 = 鎖永遠拿不到。
- ❌ **WebSocket 即時推送** — v0 不做。client 主動 pull(open scene 時 GET、編輯時 debounced PUT)。WebSocket 是 multi-user collab(v2)需要,multi-device sync 不需要。
- ❌ **Incremental diff upload**(只上傳改動的 node) — 場景 < 50KB,整檔 PUT 比 diff 計算 + 套用便宜得多。
- ❌ **「向後寫」(v3 寫成 v2 給舊版讀)** — 寫入永遠 latest schema。舊版 client 讀新版檔 → `UnsupportedVersionError`(已實作於 schema v1)。
- ❌ **手動指定版本存檔** — 不暴露給使用者選擇。

## 實作里程碑

依顧問建議的「不要先碰 server」順序:

1. **Phase A — Spec 凍結**(本文件 review + 修訂) — 1 天
2. **Phase B — Client `SyncEngine` 抽象層 + IndexedDB local-first** — server 用 mock 的記憶體實作測;1 週
3. **Phase C — 帳管 7 題拍板**(寫進本文件) — 半天
4. **Phase D — 真實 Linode 部署 + Postgres + magic link + API** — 1 週
5. **Phase E — Client wire 真 server,跑通跨裝置同步** — 半週

Phase A–C 完成前不開 Linode 機器,避免 ops 雜事(domain / SPF / Postgres backup / SSH)卡住客戶端側進度。
