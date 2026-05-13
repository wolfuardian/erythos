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
| Server framework | **Hono** | TS-first、核心 < 50 kB、Better Auth 文件一等公民、Bun / Node / edge runtime 全跨;client 是 Vite SPA,server 是純 API,Hono 起手快不背 plugin 包袱;Express 太傳統、Fastify plugin 生態為未來保留但 v0 用不到 |
| Auth library | **self-rolled HMAC session**(Better Auth dep retained for v0.1+ magic link)| v0 OAuth 走自寫 — Hono + `node:crypto` HMAC state + GitHub code-exchange + Postgres `sessions` cookie(D3 Option C, 2026-05-09);Better Auth 留 dep 等 magic link / email-pwd adapter;Lucia 2024 deprecated 不選 |
| 登入方式 | **GitHub OAuth only(v0)** | Erythos 受眾多為設計師 + 開發者,GitHub 帳號是合理預設;省去寄信 service 第三方依賴(Resend / SPF / DKIM / IP warmup) |
| Token 形式 | **Session cookie**(server-side state) | 單一 VPS、Postgres 已在,JWT 的 stateless 優勢用不到;`Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax`;Postgres `sessions` 表加 index → query < 1ms |
| Magic link + Resend | **v0.1 後加題** | 等真有非 GitHub 使用者抱怨再加;Better Auth 換 adapter 1 天搞定 |

OAuth flow:`Sign in with GitHub` → redirect to github.com → 授權 → 帶 `code` 回 `/api/auth/github/callback` → server 換 access token + 取 user `id` / `email` / `avatar_url` → 寫 `users` row(若 first time)+ 開 `sessions` row + 回寫 cookie。

## Server 倉庫結構(已決)

選型:**monorepo + npm workspaces**。erythos repo 內加 `server/` 子目錄,client 與 server 同 repo。

```
erythos/
  package.json             # workspaces: ["server"]
  src/                     # client(Vite SPA)
  server/
    package.json           # name: @erythos/server
    src/
      index.ts             # Hono entry
      auth.ts              # self-rolled HMAC session helpers (D3 Option C);Better Auth dep idle
      db.ts                # Postgres pool / migration helper
      routes/              # /scenes/*, /auth/*
    tsconfig.json
```

理由:
- atomic PR 跨 client/server:API 介面變更同 PR 改兩端,避免 contract drift
- 共享 type:`SceneVisibility` / `SceneId` 從 `src/core/sync/SyncEngine.ts` 直接 import 給 server,單一 source of truth
- node_modules 雙份是可接受成本(npm workspaces hoisting 共用多數 deps);拆 repo 後再說,太早優化

Build / dev:
- client:`npm run dev`(現有 Vite)
- server:`npm run -w server dev`(新加,tsx watch + dotenv)
- 兩端各自 deploy:Vite build → CDN;Hono → Linode systemd unit

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
  visibility  TEXT NOT NULL DEFAULT 'private',  -- 'private' | 'public';分享連結需 'public'
  forked_from UUID REFERENCES scenes(id) ON DELETE SET NULL,  -- fork 來源,顯示用;原 scene 刪了不影響 fork
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scenes_owner_idx ON scenes(owner_id);
CREATE INDEX scenes_public_idx ON scenes(visibility) WHERE visibility = 'public';  -- 公開場景查詢加速

CREATE TABLE scene_versions (    -- append-only 歷史,給「scene history = git-like」做基礎
  scene_id    UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  body        BYTEA NOT NULL,
  body_size   INTEGER NOT NULL,
  saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by    UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL after user deletion; forward-looking: SET NULL fires only for shared-edit scenarios (v0: saved_by ≡ owner_id, versions cascade-deleted via scene_id first)
  PRIMARY KEY (scene_id, version)
);
```

**為什麼 `scenes` + `scene_versions` 雙表**:`scenes` 永遠拿最新版(熱路徑 1 row lookup);`scene_versions` 是 append-only history,給未來「命名版本 / time travel」用。冷資料,不影響熱路徑效能。

**為什麼 `version` 是 INTEGER 不是 timestamp**:單調遞增整數比 timestamp 簡單(無時鐘漂移問題),etag 直接序列化整數即可。

## REST API

### `GET /api/scenes/:id`

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

### `PUT /api/scenes/:id`

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

### `POST /api/scenes`

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
    Location: /api/scenes/<new_id>
    ETag: "0"
  Body:
    { "id": "<new_id>", "version": 0 }
```

### `DELETE /api/scenes/:id`

軟刪除(進 trash 表,30 天內可復原)。v0 可省略,etag 不適用。

### `PATCH /api/scenes/:id/visibility`

切換場景公開 / 私有。**只有 owner 可呼叫**;非 owner 回 404(不洩露存在性)。

```
Request:
  Headers:
    Content-Type: application/json
  Body:
    { "visibility": "public" }        # 或 "private"

Response 200:
  Body:
    { "id": "...", "visibility": "public" }

Response 400 Bad Request:             # visibility 值非 'public' / 'private'
Response 401 Unauthorized:            # 未登入
Response 404 Not Found:               # 不存在或 caller 非 owner
```

切換不影響 `version` / etag(visibility 是 metadata,不算內容變更)。

### `POST /api/scenes/:id/fork`

複製場景到 caller 帳號,產生新 scene。

```
Request:
  Body:
    { "name": "My Forest (fork)" }    # optional;省略時複製原 name 加 " (fork)"

Response 201:
  Headers:
    Location: /api/scenes/<new_id>
    ETag: "0"
  Body:
    {
      "id": "<new_id>",
      "version": 0,
      "forked_from": "<source_id>"
    }

Response 401 Unauthorized:            # 未登入(匿名訪客先導去登入)
Response 404 Not Found:               # 來源不存在,或來源 visibility='private' 且 caller 非 owner
```

server 行為:複製來源 `body` + `name` → 寫新 row,`owner_id = caller`、`version = 0`、`forked_from = source.id`、`visibility = 'private'`(fork 永遠先私有,owner 自己決定是否再分享)。

## GDPR — 使用者資料導出 + 帳號刪除

### `GET /api/me/export`

導出登入使用者的全部資料。Auth required。

```
Response 200:
  Headers:
    Content-Type: application/json
    Content-Disposition: attachment; filename="erythos-export-<github_login>-<timestamp>.json"
  Body:
    {
      "exported_at": "<ISO timestamp>",
      "user": {
        "id": "...",
        "github_login": "...",
        "email": "...",
        "avatar_url": "...",
        "created_at": "..."
      },
      "scenes": [
        {
          "id": "...",
          "name": "...",
          "visibility": "public",
          "forked_from": null,
          "created_at": "...",
          "updated_at": "...",
          "scene_versions": [
            { "version": 1, "saved_by": "<user_id or null>", "saved_at": "..." }
          ]
        }
      ]
    }

Response 401 Unauthorized:  # 未登入
```

注意:
- `body` bytes 不導出(非人類可讀 binary blob,v0.1+ 可加 JSON 導出)
- `sessions` 不導出(只有過期 hash,non-actionable)
- `saved_by` 若為 `null` 表示對應使用者已刪除(shared-editing 場景,v0 不觸發)
- v0 無分頁 / 串流;大帳號 v0.1+ 補

### `DELETE /api/me`

刪除帳號與所有關聯資料。Auth required。

```
Response 204 No Content  # 刪除成功,session cookie 已清除
  Set-Cookie: session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax  # Secure 僅 prod

Response 401 Unauthorized:  # 未登入
Response 404 Not Found:      # race condition(session 有效但 user row 不存在),client 重新登入
```

刪除 cascade 順序:
1. `DELETE FROM users WHERE id = $1`
2. `sessions.user_id ON DELETE CASCADE` → session rows 刪
3. `scenes.owner_id ON DELETE CASCADE` → scene rows 刪
4. `scene_versions.scene_id ON DELETE CASCADE` → version rows 刪(via scenes,優先於 saved_by FK check)
5. `scene_versions.saved_by ON DELETE SET NULL` — 在 v0 write model 永不觸發(saved_by ≡ owner_id);shared-editing 上線後才有效

Out-of-scope:30-day grace period、soft delete、audit log(v0.1+)。

## 分享連結 + Fork

來源:第 6 輪「分享連結是定位的命脈,沒這個其他都白做」+ 第 12 輪 Q6 fork 模型 + 帳管 row 1 / row 6。

### URL scheme

| 階段 | URL 形態 | 備註 |
|------|---------|------|
| **v0**(本 spec) | `https://erythos.app/scenes/{scene_uuid}` | 直接用 scene UUID,無需 handle 系統,起手最簡單 |
| **v2**(最終形態) | `https://erythos.app/{handle}/{scene-slug}` | handle 系統上線後;`/scenes/{uuid}` 永遠保留並 301 redirect 到新形態(Cool URIs Don't Change) |

v0 用 UUID 對齊帳管 row 2「不為未來美感增加今天的摩擦」原則;v2 升級時 handle 衝突 / slug 命名規則由那時 spec 處理,本文件不預設。

### 公開 / 私有

新建場景預設 `visibility = 'private'`(`POST /scenes` 不可指定 visibility,一律從私有起手)。owner 透過 `PATCH /scenes/:id/visibility` 切換。

匿名訪客打開 `https://erythos.app/scenes/{uuid}`:
- 場景 `visibility = 'public'` → 走 `GET /scenes/:id` 取得 body,client 進入 viewer 模式
- 場景 `visibility = 'private'` → 404(無論 caller 是誰,non-owner 一律 404,不洩露存在性)

### 訪客流程

| 訪客身份 | 開公開連結看到的 | 點 Edit 按鈕的行為 |
|---------|-----------------|-----------------|
| 匿名(未登入) | viewer 唯讀 | 提示登入 → 登入後 `POST /scenes/:id/fork` |
| 登入,非 owner | viewer 唯讀 | `POST /scenes/:id/fork` 後跳轉 `/scenes/{new_id}` |
| Owner | 完整編輯器 | (本來就在編 owner 的 scene,無 fork) |

非 owner **絕不可直接編 owner 的 scene**。Edit 按鈕在訪客身上一律觸發 fork,對齊 Figma / GitHub 的 fork model — 心智模型清楚,使用者一秒理解「這是別人的東西,我改 = 我自己的副本」。

### Copy Link 按鈕語意

Share dialog 內的兩件事顯式分開:

1. **Visibility toggle**(`Private` ↔ `Public`)— 切到 public 才會出現連結
2. **Copy Link 按鈕** — 只在 `visibility = 'public'` 時 enabled;點擊複製 `https://erythos.app/scenes/{uuid}` 到剪貼簿

**不自動切公開**:即使 owner 點 Copy Link 時 visibility 為 private,按鈕 disabled 並顯示提示「Make public to share」。避免使用者誤把私密場景連結貼出去。

### Fork 後的關係

`scenes.forked_from` 僅供顯示(「Forked from <name>」標籤),server 不維護 fork 連動 — 原 scene 刪除設 NULL,fork scene 與原 scene 自此完全獨立。**不做 upstream sync / pull request 機制**(那是 v3+ 議題)。

## 衝突解決流程(409 處理)

client 收到 409 時,**永遠先把本機版本寫進 `.erythos.bak.v{base_version}`** 再進對話框。確保不論使用者選哪邊,本機改動都不會消失。

對話框三選一,**v0 全部實作**:

| 選項 | 動作 | v0 |
|------|------|-----|
| (a) **保留本機**(我贏) | 載入雲端 body 進記憶體後不顯示,直接 PUT 再來一次,`If-Match=current_version` | ✅ |
| (b) **用雲端**(雲端贏) | 載入雲端 body 蓋掉編輯區,本機改動已在 `.bak` 留底 | ✅ |
| (c) **看 diff** | 展開 JSON line-diff(`local` vs `cloud`),使用者看完再選 (a) 或 (b) | ✅ |

(c) 是顧問在 round 11 Q3(d) 點的「最誠實」選項。實作形式:對 `serialize()` 結果做 `JSON.stringify(…, null, 2)` 後逐行比對,以 `+`/`-` prefix 標記差異,呈現於 `<pre>` 元素。沒有欄位級 cherry-pick — 使用者看完 diff 後仍需選擇「全保留本機」或「全用雲端」。這個「資訊透明但操作簡單」的設計 diff 不丟資料、不假裝智慧自動合併,符合 local-first 哲學。

## 錯誤碼總覽

| Status | 意義 | client 行為 |
|--------|------|-------------|
| 200 | OK | 繼續 |
| 201 | Created | 記下新 id |
| 401 | Unauthorized(沒登入或 token 過期) | v0:`AuthClient.getCurrentUser()` 回 null(anonymous);非 auth 路徑由 caller 決定 UI(viewer mode 提示登入) |
| 403 | Forbidden(身份正確但無權) | v0:`/auth/me` 同 401 走 anonymous 路徑(implementation 將 401/403 合併處理,因 v0 server 不單獨回 403);其他 endpoint owner check 統一回 404 不洩露存在性,故 403 v0 基本不觸發 |
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
4. **Phase D — 真實 Linode 部署 + Postgres + GitHub OAuth + API**(含 share / fork / visibility) — 1 週
   - D1. Server scaffold:monorepo npm workspaces + `server/` + Hono entry + auth skeleton(Better Auth dep installed but 未接 — D3 改自寫)— 半天
   - D2. Postgres schema migration tool + 4 表(`users` / `sessions` / `scenes` / `scene_versions`)— 半天
   - D3. 自寫 GitHub OAuth(Hono + `node:crypto` HMAC state)+ session cookie + Postgres `sessions` 表,`/api/auth/me` `/api/auth/github/start` `/api/auth/github/callback` `/api/auth/signout` 通(D3 Option C, 2026-05-09 落地;Better Auth dep 留 v0.1+ magic link adapter)— 1 天
   - D4. REST API 5 endpoints(`GET/PUT /scenes/:id`、`POST /scenes`、`PATCH /visibility`、`POST /fork`)+ If-Match etag — 2 天
   - D5. Linode VPS + domain + Caddy auto-HTTPS + systemd unit(實機改 Caddy 取代 D5a 原規劃 nginx + certbot,host 已 co-locate Caddy stack;2026-05-09 落地)— 1 天
   - D6. 端到端 smoke:client(`HttpSyncEngine` 換真 baseUrl)→ Linode → Postgres ↔ — 半天
5. **Phase E — Client wire 真 server,跑通跨裝置同步** — 半週

Phase A–C 完成前不開 Linode 機器,避免 ops 雜事(domain / SPF / Postgres backup / SSH)卡住客戶端側進度。
