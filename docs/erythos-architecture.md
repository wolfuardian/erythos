# Erythos System Architecture

> 本文件定義 Erythos 的系統層架構契約 — local-first 哲學、雲端同步、帳管模型、引用 prefab 的 DAG 環偵測。
>
> Code 模組層架構見 `architecture.md`。
> 檔案格式契約見 `erythos-format.md`。

## 整體哲學:Local-first

**雲端壞了 = 同步暫停,不影響編輯。**

Erythos 的定位是 Figma for 3D,但有一件事永遠贏不了 Figma:cloud SLA。Solo dev + Linode 的 SLA 約 99%(一年壞 87 小時),Figma 是 99.99%。若使用者必須連 server 才能編輯,每年 87 小時打不開檔案 = 體驗死亡。

**反過來:** 雲端只負責「多裝置同步」這一個職責。編輯動作純 local,雲端壞了體驗只降級成「無法跨裝置共享」,不是「無法工作」。

對齊檔案哲學:`.erythos` 是純 JSON、< 50KB、git diffable — 這是 file-first 設計,不是 cloud-first row。把它鎖在 server 裡反而是糟蹋 schema。

## 雲端基礎設施

```
┌─────────────────────────────────────────────────┐
│  Cloudflare(CDN / SSL / DDoS)                  │
└────────────────────┬────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  Linode VPS                                     │
│  ├─ Postgres(users / scenes / scene_versions)  │
│  ├─ Node API(Hono / Fastify)                   │
│  └─ Linode Object Storage(S3-compatible)       │
│       └─ Asset blob(GLB / HDR / 大檔案)         │
└─────────────────────────────────────────────────┘
```

**分工:**

| 資料 | 儲存 | 理由 |
|---|---|---|
| `.erythos` 場景檔本體(< 1MB) | Postgres BYTEA | 直接存,省一個服務、省一次 round-trip |
| 二進位資產(GLB / HDR / texture) | Object Storage | S3-compatible,Cloudflare CDN 前置 |
| User / 帳號 / metadata | Postgres | 標準 OLTP |

**solo dev 起手式:** 單一 VPS 全包(Postgres + Node API + 靜態檔)。Backup 用 cron + S3-compatible 異地。

## 帳管模型

### 認證

- **GitHub OAuth + Magic link**:GitHub OAuth day 1 起;Magic link v0.2 加入(Resend 寄信)
- **Library:** self-rolled HMAC session(D3 Option C, 2026-05-09;見 `sync-protocol.md` § 認證實作)。Lucia / Auth.js 探過後棄
- 第一週就上 — 沒帳號 = 沒雲端,「分享連結」會變「全網路任何人都能改」

### 匿名模式

第一次體驗無摩擦:打開 `erythos.app` → 直接編輯,本機 IndexedDB 存。

註冊時跳 UI:「以下 N 個本機場景要加入你的帳號嗎?」(全勾 / 全不勾 / 逐一選)。**這條路徑做不順,使用者會想「乾脆不要註冊算了」**。

### 身份格式

- 內部:`user_id`(短 hash,URL 用 `/u/{user_id}/scene/{scene_id}`)
- 對外:暫不做 handle / username。等到有人抱怨 URL 醜再加
- email 唯一

### 共享所有權:fork model

A 把場景連結給 B → B 編輯 → 存進 B 的帳號(fork 出新場景)。A 永遠擁有原場景,B 改動不影響 A。

**「即時多人協作」(Figma 風)是 v2 的事。v1 不做。**

### GDPR

- 設定頁有「導出我的資料」(zip,所有場景 + assets + metadata)
- 「刪除帳號」按鈕(server-side 全刪,local IndexedDB 不動)
- **從 day 1 就寫**,等一年後再補就導不出來

### 計費預留(不主動上)

- `users` 表先有 `plan` / `storage_used` / `asset_count` 欄位
- UI 上不出現付費(全 free)
- 等 ~500 active users 或雲端費用 > $50/mo 時才上 paid plan
- Stripe 接上去 1 天搞定 — 不該為了「將來計費」現在加摩擦

## 同步協定

### 模型:Optimistic Concurrency Control with Version Vector

```
client                        server
  │                              │
  │── PUT /scenes/{id} ─────────▶│
  │   body: full ErythosSceneV1  │   if base_version == current_version:
  │   header: X-Base-Version: 5  │     accept, version+1, return new
  │                              │   else:
  │                              │     return 409 Conflict + current
  │◀──── 200 OK / 409 ───────────│
  │                              │
```

比 CRDT 簡單 100 倍,夠用到 1000 個使用者。

### 衝突處理

雲端版本比本機 base 新時,client 跳對話框三選一:

- **保留本機版**(以本機覆蓋雲端,新 version)
- **用雲端版**(放棄本機修改 — 本機版自動存進 `.erythos.bak.{timestamp}`)
- **看 diff**(進階使用者,可 cherry-pick 欄位)

**不做** auto-merge / CRDT — 默默丟資料風險高。明確問使用者最誠實。

### 同步觸發時機

- 使用者主動「儲存到雲端」
- AutoSave 命中時(背景定時上傳)
- App 啟動時 pull 最新版

### 離線

純本機 IndexedDB 操作,記 dirty flag。回線時:
- 若雲端無新版 → push
- 若雲端有新版 → 跳衝突 UI

### Schema 朝 op-based 預留路

雖然 v1 同步整檔上傳,**schema 設計時心裡留路** — 每個 mutation 應能描述成 op(`MoveNode` / `RenameNode` / `SetMaterial`),未來加 offline-first / 多人協作時不用重寫。

對應:`src/core/Command/` 已是 op-based,**維持這個結構不退化**。

## Reference Cycle Detection(DAG 環偵測)

prefab 引用 prefab 的循環引用,**在引用建立當下偵測**,不靠深度限制(深度有限 ≠ 無環,且深度會合法增長)。

### 演算法

```typescript
function allowReference(targetUrl: AssetUrl, currentScenePath: AssetUrl): boolean {
  const deps = getDeps(targetUrl);  // runtime cache, miss 時遞迴展開 + DFS
  if (deps.has(currentScenePath)) return false;  // 拒絕,會產生環
  return true;
}

function getDeps(url: AssetUrl): Set<AssetUrl> {
  if (cache.has(url)) return cache.get(url)!;
  const visited = new Set<AssetUrl>();
  dfs(url, visited);  // DFS 配 visited set,遇到自己路徑上已存在的節點 → cycle
  cache.set(url, visited);
  return visited;
}
```

**判準:**「這次引用之後,整張圖還是不是 DAG?」二元,不看數字深度。

**Cache:** runtime IndexedDB cache 衍生資料,**不寫進 `.erythos`**(衍生資料不該存 schema)。Tarjan / Kahn 是 O(V+E) 標準環偵測。

## 雙路徑邊界

| 路徑 | 範圍 | 何時做 | 不同問題 |
|---|---|---|---|
| 多裝置同步 | 同一帳號跨裝置看到同一場景 | v1 必須 | single source of truth + pull/push |
| 多人協作 | 不同帳號同時編輯 | v2 之後 | conflict resolution + CRDT + presence |

兩者**完全不同的問題**。混為一談會兩個都做不好。**這個邊界畫清楚,省 3 個月**。

## Schema 演進規則

### Migration Registry

線性版本鏈,讀取時 in-memory 升 latest,寫入永遠寫 latest。詳見 `erythos-format.md` § Migration 規則。

### 第一次假升版練習

solo dev 在第一個外部使用者出現前(預估半年),**至少做一次假升版**走完整流程:

- 隨便挑欄位(例:`mat.color` 從 hex string 改 RGB array)
- 升 `v: 1 → v: 2`
- 寫 migration `1 → 2`
- 存 v1 fixture
- CI 驗證
- 模擬「打開未來版本」拒絕 UI

**第一次寫 migration 不該是 production 出事的當下。**

### Backup

每次 migration 前留 `.erythos.bak.v{原版本}`(IndexedDB 存一份 raw)。**永遠不主動清** — 由使用者手動。空間便宜,信任貴。

## 實作順序(13 輪結論四步走)

| Step | 內容 | 預估 | 對應 initiatives.md |
|---|---|---|---|
| 1 | **Schema v1**(branch: `schema-v1`) — 定義 type / serialize / 改現有儲存邏輯 / 機械驗收 lint runner | 2 週 | 含 B.1, B.2 機械化 |
| 2 | **砍 panel** — Console / Settings / Context 砍,Environment 併進 Properties,右側留 collaboration | 1 週 | initiatives C 順序倒置(先砍後統一) |
| 3 | **最低可活雲端** — Linode + Postgres + Magic link + `PUT /scenes/{id}` + 衝突偵測 | 2-3 週 | 全新,initiatives.md 未涵蓋 |
| 4 | **第一個假 migration** — fixture + migration + 拒絕未來版本 | 0.5 週 | 對應 D.1 contract spec 試驗場 |

預估總計 4-8 週,solo dev 半時間。完成才算 Erythos「Figma for 3D 的 alpha」。

## 非目標

- **手機端編輯** — 砍。手機 = viewer + commenter(平板 = 評論 + 微調,桌機 = 完整編輯)
- **重做 renderer** — 砍。Three.js PBR + IBL 已經夠用。「好看」是 GLB / HDRI 的事,不是編輯器的事
- **Wireframe / Shaded / Render 多 mode** — 砍。Solid(編輯)+ Final(分享)兩個夠用
- **Word 風「儘量讀」未來版本** — 嚴禁。明確錯誤 > 默默壞掉
- **動畫存** — 待定。決定:(a)不做,動畫是 GLB 內部的事 / (b)做,但 keyframe 走 `.eanim` 引用。**v1 暫不做**,留 schema 路
- **CRDT auto-merge v1** — 不做。明確問使用者衝突最誠實

## 開放議題

- **計費啟動點** — ~500 active users 或 $50/mo 雲端費用是 placeholder,實際看市場反應決定
- **Object Storage vs R2** — Linode Object Storage 起手,若 egress 費用爆炸再考慮搬 Cloudflare R2
- **HDR / Y-up 標準化** — 引用 asset 時若來源 Z-up 公分,由 `AssetResolver` 在解析時轉換(尚未定 schema)
- **多人協作 v2** — Figma 風即時 cursor / presence 是 v2,可能走 Yjs / Automerge
- **Embed snippet** — `<iframe>` 或 web component 嵌進 Notion / 部落格(Erythos 獨有,Figma 沒有),v1+ 看時程
