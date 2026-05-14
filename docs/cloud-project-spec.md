# Erythos Cloud Project — v0.2 spec

> 本文件定義 v0.2 cloud project 功能契約。Scene blob sync 見 `docs/sync-protocol.md`,Asset sync 見 `docs/asset-sync-protocol.md`,Magic link auth 見 `docs/magic-link-spec.md`。
>
> 來源:AA 戰略報告 `.claude/scratch/cloud-project-strategy-2026-05-13.md` + Q1-Q4 拍板(decisions log 2026-05-13 `[v0.2-scope]`)。

## 設計哲學

v0.2 引入 **CloudProject** 作為與 v0.1 LocalProject 並存的第二條路徑。LocalProject 保留 v0.1 完整能力(`FileSystemDirectoryHandle` + local file canonical),CloudProject 走 server canonical + HTTP。

- **兩條路徑並存,不統一抽象**:LocalProject / CloudProject 共用 `ProjectManager` interface,但實作獨立。試圖 unify FS handle + HTTP semantics 會放大 LocalProject 既有 6+ call site 的 refactor 風險,且兩者語意本質不同(local 可離線完整編、cloud 寫操作依賴網路)。
- **CloudProject:server canonical,local file 為 throwaway cache**:雙寫 + reconcile 是 L3 級工程,代價(offline UX 縮水)接受。
- **Asset cloud-only for CloudProject**:LocalProject 繼續走 `project://`,CloudProject 強制 `assets://` content-addressed。Hybrid(some local some cloud)會讓 asset reference 跨 device load 來源不同 — 語意爆炸,不收。
- **Offline = read-only for CloudProject**:已 load 的 scene 可 view,寫操作 disabled + 提示。要 offline edit?用 LocalProject。
- **L3 real-time co-edit / ACL 排 v0.3**:operational transform / CRDT / presence / role-based ACL 是另一個 protocol generation,塞進 v0.2 = phantom code + 趕工撞牆循環。

反指標:CloudProject 雙寫 local + cloud / hybrid asset / offline edit reconnect / multi-cursor / CRDT。

## Scope(已拍板)

| 等級 | 範圍 | 拍板 | 痛點解 |
|---|---|---|---|
| L1 | 同 user 跨 device 同 scene | ✅ 必收 | v0.1 "Sign in for backup" 改成真 backup,跨 device 取回 |
| 半 L2 | Share URL 唯讀 viewer(anonymous) | ✅ 應收 | Marketing 故事 + portfolio share + 低成本 wow |
| L3 | real-time co-edit / multi-cursor / ACL | ⏸️ 排 v0.3 | 量級差兩個 protocol generation |

## 架構選擇(已拍板)

| 項目 | 選項 | 理由 |
|---|---|---|
| ProjectManager 多型 | `ProjectManager` interface + `LocalProjectManager` / `CloudProjectManager` 並存 | refactor 範圍可控,LocalProject 保留 v0.1 完整能力 |
| Scene blob source of truth(CloudProject) | server canonical(沿用 `scenes.body` BYTEA) | 雙寫 + reconcile 工程不對等 |
| Local file 角色(CloudProject) | throwaway cache(IndexedDB / 不入 FS) | 刪掉沒事;v0.1 LocalProject 邏輯不適用於 cloud |
| Asset model(CloudProject) | cloud-only(`assets://` content-addressed) | 沿用 F-1 asset sync;hybrid 會壞 asset reference 語意 |
| Asset model(LocalProject) | 不變(`project://` local file) | v0.1 行為保留 |
| Offline 策略(CloudProject) | read-only(write disabled + 提示) | offline edit + reconnect sync = L3 級工程 |
| Share token model | random opaque,permanent,owner-revocable | v0.2 不加 TTL,簡化 scope |
| Onboarding default | early access free unlimited + 登入 only + Demo scene placeholder | v0.3 拍板(2026-05-15);詳見 § Onboarding |
| AutoSave 觸發條件(CloudProject) | 沿用 v0.1 debounced PUT 邏輯(`HttpSyncEngine`) | 已有 If-Match 衝突偵測,反指標雙寫 |

## Onboarding / Quota / Pricing(v0.3 拍板)

v0.2 working hypothesis 經 criteria #4 review,2026-05-15 拍板修正為下表(v0.3 workstream)。criteria #7 onboarding user testing 桌機 9-case 已 PASS。

| 題目 | v0.3 決定 | 備註 |
|---|---|---|
| Free tier scene 上限 | 3 | `POST /scenes` 需新增 count enforcement(現無);Demo scene 算 1 格 |
| Free tier 每 scene 大小 | 1MB(blob only,不含 asset)— 對齊 sync-protocol.md body limit | 5MB 為 future 目標,需先放寬 sync-protocol body limit |
| Free tier asset 總量 | 150MB | `assets.ts` `FREE_TOTAL_QUOTA` 500MB→150MB;enforcement 已存在 |
| Placeholder scene(新 user) | 自動 provision 一份 Demo scene(cube + light)進雲端庫 | 算配額、user 可刪(需 #1039 DELETE);server 在 find-or-create CREATE 分支塞 |
| 「免登入試用」CTA | LocalProject 入口繼續存在;Cloud 入口要登入 | 對齊 v0.1 設計哲學 |
| Pricing | early access free unlimited(到 quota 寫死後 graceful 提示) | 真正 paid tier 在 v0.3+ 評估 |

## ProjectManager 抽象

```ts
type ProjectIdentifier =
  | { kind: 'local'; handle: FileSystemDirectoryHandle }
  | { kind: 'cloud'; sceneId: SceneId }

interface ProjectManager {
  readonly type: 'local' | 'cloud'
  readonly identifier: ProjectIdentifier

  // Scene blob
  loadScene(): Promise<SceneDocument>
  saveScene(scene: SceneDocument, baseVersion: number): Promise<SaveResult>

  // Asset resolution
  listAssets(): Promise<AssetMeta[]>
  resolveAsset(url: string): Promise<Blob>

  // Lifecycle
  close(): Promise<void>
}

type SaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; currentVersion: number; currentBody: SceneDocument }
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'unauthorized' }

class LocalProjectManager implements ProjectManager {
  // 包裝 FileSystemDirectoryHandle + 既有 ProjectFile read/write
  // saveScene 寫到 scenes/scene.erythos,version 從本地 inc(無 server)
}

class CloudProjectManager implements ProjectManager {
  // 包裝 HttpSyncEngine + AuthClient
  // saveScene 走 PUT /api/scenes/:id with If-Match
  // resolveAsset 走 AssetResolver(F-1 已 ready)
  // local cache:IndexedDB scene blob,僅做 cold-start 快開
}
```

> **設計決定 D-1**:`ProjectIdentifier` discriminated union 不在介面層 unify。Polymorphic dispatch 邊界僅在 **app-level project entry layer**(`App.tsx` 的 active project state,Welcome / NewProjectModal 的 Local/Cloud 二選一,routing 層)做 `manager.type` narrow。Downstream LocalProject-only consumer(`Editor` / `AssetResolver` / `PrefabRegistry` / `bridge` 等)直接接 concrete `LocalProjectManager`,不在介面層 narrow — 因 CloudProject 走 `HttpSyncEngine` 獨立 sync 路徑,不過 `Editor.projectManager`。
>
> 反指標:全 codebase abstract `ProjectManager` + downstream narrow。Editor / AssetResolver / PrefabRegistry / bridge 用到 9+ LocalProject-only method(`urlFor` / `getFiles` / `onFileChanged` / `writeFile` / `isOpen` / `createScene` / `setCurrentScenePath` 等),這些不該進 minimal interface(否則 CloudProjectManager 要 stub 一堆 throw method,defeats minimal-interface 設計)。v0.1 `nodeType` 類比僅描述「discriminated union + narrow」pattern,**不**意味每個 consumer 都看 abstract Node — ProjectManager 的 narrow 點在 app entry layer,downstream 維持 concrete type。

> **設計決定 D-2**:`SaveResult` 是 discriminated union,不抛 exception。v0.1 `HttpSyncEngine` 已是這個 pattern,CloudProjectManager 直接 reuse。LocalProjectManager `ok: false` 路徑罕見(FS handle 失效 / quota exceeded)— 仍走同形態。

## 資料模型

新增表:`scene_share_tokens`。`scenes` 表沿用 v0.1 sync-protocol.md schema 不變。`users` 表沿用 v0.1(+ magic link C1 nullable `github_id`)。

```sql
CREATE TABLE scene_share_tokens (
  token       TEXT        PRIMARY KEY,             -- random opaque,32+ char hex
  scene_id    UUID        NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  created_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ                          -- nullable;set 則 token 失效
);

CREATE INDEX scene_share_tokens_scene_idx ON scene_share_tokens(scene_id);
CREATE INDEX scene_share_tokens_active_idx ON scene_share_tokens(scene_id) WHERE revoked_at IS NULL;
```

`token` 是 PRIMARY KEY 而非 separate `id` UUID — token 本身就是 opaque identifier,不需 surrogate。

`revoked_at` 軟刪除而非 DELETE:owner 可看「曾經發過的 token 列表」歷史,即使已 revoke。Reaper cron 不清(規模小,row 累積緩慢;v0.3 再評估 partition)。

> **設計決定 D-3**:token 不過期。Permanent + owner-revocable 模型最簡單。若未來有「限時 share」需求,加 `expires_at` 欄位,token validation 加條件即可,不影響現有 row。

## REST API

### Cloud project list

#### `GET /api/scenes`

列 caller 擁有的所有 cloud scene(已 sign in 才有意義)。沿用 sync-protocol.md 既有 endpoint(v0.1 spec 已寫,UI 未接)。

```
Response 200:
  Body:
    {
      "scenes": [
        {
          "id": "...",
          "name": "My Scene",
          "version": 5,
          "visibility": "private",
          "forked_from": null,
          "created_at": "...",
          "updated_at": "..."
        },
        ...
      ]
    }

Response 401 Unauthorized:    # 未登入 → client 顯示「Sign in to see your cloud projects」
```

不分頁:v0.2 預期單 user scene 數 < 100,< 50KB body 不返,單次 list 足以。> 1000 時加分頁。

### Cloud project CRUD

沿用 sync-protocol.md § REST API:
- `GET /api/scenes/:id` — 取 scene
- `PUT /api/scenes/:id` — 寫 scene(If-Match etag)
- `POST /api/scenes` — 新建 cloud scene
- `DELETE /api/scenes/:id` — v0.2 開放(v0.1 spec deferred)
- `PATCH /api/scenes/:id/visibility` — 切公開 / 私有
- `POST /api/scenes/:id/fork` — fork

### Share token endpoints

#### `POST /api/scenes/:id/share-tokens`

Owner 生成新 share token。auth required。

```
Request:
  (empty body — token 由 server 生成)

Response 201 Created:
  Body:
    {
      "token": "<32-char hex>",
      "url": "https://erythos.eoswolf.com/scenes/<id>?share_token=<token>",
      "created_at": "..."
    }

Response 401 Unauthorized:    # 未登入
Response 404 Not Found:       # scene 不存在或 caller 非 owner
```

server 行為:
1. Verify caller is `scenes.owner_id`
2. `token = randomBytes(16).toString('hex')` — 32 char hex
3. `INSERT INTO scene_share_tokens (token, scene_id, created_by) VALUES ($1, $2, $3)`
4. Return token + assembled URL

> **設計決定 D-4**:token 是 16 byte (128 bit) random,32 hex char。比 magic link 的 32 byte (256 bit) 短一半;magic link 是 one-time secret,share token 是 long-lived public identifier,128 bit 足夠抗 brute force(2^128 search space)。

#### `GET /api/scenes/:id/share-tokens`

Owner 列 scene 的所有 share token(含 revoked)。

```
Response 200:
  Body:
    {
      "tokens": [
        { "token": "...", "created_at": "...", "revoked_at": null },
        { "token": "...", "created_at": "...", "revoked_at": "..." },
        ...
      ]
    }

Response 401 Unauthorized:
Response 404 Not Found:       # scene 不存在或 caller 非 owner
```

#### `DELETE /api/scenes/:id/share-tokens/:token`

Owner revoke token。idempotent — 已 revoke 仍回 204。

```
Response 204 No Content:      # 成功 revoke 或 already revoked

Response 401 Unauthorized:
Response 404 Not Found:       # scene 或 token 不存在,或 caller 非 owner
```

server 行為:`UPDATE scene_share_tokens SET revoked_at = now() WHERE token = $1 AND scene_id = $2 AND revoked_at IS NULL`。

### Share URL viewer

#### `GET /api/scenes/:id?share_token=<token>`

匿名訪客用 share token 取 scene。auth optional;有 token 走 token validation,無 token 走 sync-protocol.md `GET /api/scenes/:id` 既有邏輯(owner / public visibility)。

```
Response 200:
  Headers:
    ETag: "5"
    Content-Type: application/json
  Body:
    {
      "id": "...",
      "owner_id": "...",            # 仍回 owner,client 顯示「Shared by <github_login>」
      "name": "...",
      "version": 5,
      "visibility": "private",      # 重要:share token bypass visibility check
      "body": { ... }
    }

Response 404 Not Found:             # scene 不存在 / token invalid / token revoked
```

server 行為:
1. Parse `share_token` query param
2. `SELECT scene_id FROM scene_share_tokens WHERE token = $1 AND scene_id = $2 AND revoked_at IS NULL`
3. 有 → bypass visibility check,return scene body
4. 無 → fall through 既有 visibility / owner check 邏輯

Share token URL 進 client 後,client 走 **viewer mode**(write disabled,toolbar 大部分隱藏)。

> **設計決定 D-5**:share token 取出的 scene 仍回 owner metadata(`owner_id`、`name`)。anonymous viewer 看得到「這是 X 分享的場景」是合理 UX,不是 PII leak — owner 主動分享連結即同意 metadata 露出。

## Client Flow

### Sign in → load cloud project list

```
1. User clicks "Sign in" → SignInDialog(v0.1 已 ready)
2. OAuth / magic link flow 完成 → currentUser signal 更新
3. App.tsx 偵測 currentUser 變化(createEffect),調用 AuthClient.listCloudScenes()
4. Welcome 頁新增 "Your cloud projects" 區塊,顯示 scene list
5. 空 list 時顯示「No cloud projects yet — create one or sign in elsewhere」
```

### Open cloud project

```
1. User clicks 一個 cloud scene → projectManager = new CloudProjectManager(sceneId, authClient)
2. projectManager.loadScene() → HttpSyncEngine.pull → GET /api/scenes/:id → reconstruct SceneDocument
3. editor.loadScene(sceneDocument) → 場景顯示
4. AutoSave 走 CloudProjectManager.saveScene(每次編輯 debounced 1.5s PUT)
5. (背景)projectManager 寫一份到 IndexedDB throwaway cache,給下次 cold start 快開
```

### New cloud project

```
1. Welcome 頁 "Create new project" → 選 "Local / Cloud"(已 sign in 才顯示 Cloud)
2. Cloud option →
   POST /api/scenes { name: "My Scene", body: <empty erythos> }
   → 取回 sceneId
3. App 切到 CloudProjectManager(sceneId) → editor.loadScene(empty)
4. 後續編輯走 AutoSave PUT
```

### Cold start with active cloud project

```
1. App.tsx onMount:
   const last = localStorage.getItem('activeProject')
   if (last?.kind === 'cloud' && currentUser) {
     openCloudProject(last.sceneId)
   } else if (last?.kind === 'local') {
     // 提示 user re-grant FS handle(FS handle 不能 persist)
   } else {
     showWelcome()
   }
```

> **設計決定 D-6**:active project 存 localStorage,key `activeProject`。LocalProject 因 FS handle 不能跨 session persist,cold start 仍需 user 重新授權目錄。CloudProject 跨 session 自動 resume(sceneId 是 stable identifier)。

### Local → Cloud 升級

```
1. LocalProject Toolbar 加 "Upload to cloud" action(已 sign in 才顯示)
2. Click → confirm dialog "Upload your local project to cloud? Asset 將需要重新上傳"
3. Confirm →
   a. POST /api/scenes { name: localProject.name, body: <serialized> }
   b. uploadSceneBinaries(localProject) → 所有 asset upload + URL rewrite
   c. 切到 CloudProjectManager
4. LocalProject 文件保留在 disk(local file as backup,user 自決是否刪)
```

> **設計決定 D-7**:升級不刪 local file。CloudProject 變 source of truth 後,local file 變 stale snapshot,但 user 有需要(audit / offline backup)仍可手動保留。

### Fork(anonymous → owned)

Share token viewer 看到場景 → 點 "Fork" → 觸發 sign-in flow(if not signed in)→ `POST /api/scenes/:id/fork` → 新 sceneId → 切換到該 cloud project。

沿用 sync-protocol.md § Fork。Fork 後新 scene 屬 caller,share token 不繼承(新 scene 沒 token,owner 可生成新 token)。

### Share URL viewer mode

```
1. Anonymous user 進 https://erythos.eoswolf.com/scenes/<id>?share_token=<token>
2. AuthClient 不要求 sign in
3. GET /api/scenes/:id?share_token=<token> → 200 / 404
4. 200 → editor 進 viewer mode:
   - Toolbar:hide save / sync indicator / share button
   - Show "Shared by <github_login>" badge
   - Show "Fork" button(觸發 sign-in flow)
   - Show "Sign in to edit your own" footer
   - 編輯操作 disabled(scene-tree 不可拖、properties 唯讀、viewport 不可加 node)
5. 404 → 顯示 "This share link is invalid or revoked. Ask the owner for a new link."
```

## Asset Model

### CloudProject(cloud-only)

CloudProject 內所有 asset 走 `assets://<sha256>/<filename>`(asset-sync-protocol.md)。
- Drag-drop 本機檔案 → upload via `POST /assets` → URL rewrite 為 `assets://`
- 已是 `assets://` 的 asset → 解析走 `AssetResolver`(F-1 已 ready)
- LocalProject 帶 `project://` asset → 升級時批次 upload + rewrite(見 § Local → Cloud 升級)

### LocalProject(`project://`)

不變,沿用 v0.1 行為。

> **設計決定 D-8**:不允許 hybrid。CloudProject 內若出現 `project://` URL 視為 invalid(broken-ref UI 顯示)。Upload pipeline 必須在 save 前確保全部 asset 已上傳。

## Offline 策略

| 場景 | 行為 |
|---|---|
| LocalProject offline | 不變,完整編輯 |
| CloudProject offline(已 load scene) | View 可,Edit disabled + 提示 banner |
| CloudProject offline(冷啟動,無 IndexedDB cache) | 顯示 "Offline — connect to load cloud project" + 列 LocalProject 備選 |
| CloudProject offline(冷啟動,有 IndexedDB cache) | Load cache,進入 viewer mode,提示 "Offline — viewing cached version" |

> **設計決定 D-9**:不做 offline edit + reconnect sync。是 L3 等級工程(operational transform / vector clock),距離 v0.2 兩個 protocol generation。LocalProject 是「我就要 offline」使用者的退路。

### Offline UX banner

CloudProject + offline 時頂部固定 banner:
- 文案:`Offline — reconnect to edit. Your local cache is read-only.`
- Style:warning 色,不可關閉
- 寫操作觸發時:額外 toast `"Cannot edit while offline — reconnect first"`

## Resend Cost 緩解

v0.1 sign-in 是 backup,量小。v0.2 後 sign-in = 進場條件,每個 cold visitor 都觸發 magic link → Resend 帳單非線性成長。

### 預估

| 場景 | 月 email 量 |
|---|---|
| Daily 100 cold visitor × 30 天 | 3000(Resend free tier 滿) |
| Daily 200 | 6000(超 free tier,需 paid $20/mo for 50K) |
| Daily 1000 | 30000(舒適 paid) |

### 緩解策略(v0.2 必做)

1. **Session cookie TTL 拉長**:目前 v0.1 預設(查 `auth.ts` `setSessionCookie` 實作確認)— 若 < 30 天則拉長到 90 天。重複 visitor 不會每次 magic link。
2. **GitHub OAuth 作 primary path**:SignInDialog 上 GitHub button 視覺權重 > email input。已 sign-in GitHub 的 visitor 不會誤觸發 magic link。
3. **Magic link 降低重試誘因**:expired token UX 顯示 "Request a new link"(不自動 re-request),user 主動點才再寄。
4. **Anonymous viewer mode 不要求 sign in**:share URL 唯讀路徑完全不過 sign-in,大量 cold visit 不轉成 magic link request。

> **設計決定 D-10**:不在 v0.2 加 rate limit per visitor(magic-link-spec.md 已有 per-email 60s / per-IP 10/h)。Resend free tier 燒完前的緩衝已足。

## v0.2 Release Criteria(加碼 7 條,Q4 拍板)

1. L1 fully wired:1-device sign-in + 2-device sync e2e 手測 pass(同 user 跨 device 編 + 看到對方改動)
2. 半個 L2 share URL endpoint + UI ready
3. Marketing 文案改完(`src/app/Welcome.tsx` footer + SignInDialog + 任何 v0.1 暫掛 "Local-first only" 文案)
4. Onboarding flow product input 落地(§ Onboarding working hypothesis 確認 / 修正)
5. Resend cost 盤點 + session cookie TTL 調整(§ Resend Cost 緩解策略 1-3 落地)
6. **(加碼)Share URL e2e 手測**:anonymous viewer mode + token generate / revoke + read-only enforcement(寫操作真的擋住)
7. **(加碼)Onboarding flow user testing**:新 user 第一次進站 cold start flow + cloud project 新建 / open / sync 手測,需 user perspective 而非自測

## Phase G 切分(6 phase,Q3 拍板)

| Phase | 內容 | 預估 LOC | 依賴 |
|---|---|---|---|
| G1 | `ProjectManager` interface refactor — LocalProject 介面化,API 不變 | ~300 | 無 |
| G2 | `CloudProjectManager` 實作 + AutoSave 切換邏輯 | ~500 | G1 |
| G3 | Welcome / Toolbar UI — cloud project entry + list | ~400 | G1(use interface) |
| G4 | Client `syncEngine.pull` 接 startup flow + scene reload | ~200 | G2 |
| G5 | Share URL token model + UI(server schema + endpoints + client modal) | ~400 | 無(可平行 G1-G4) |
| G6 | Offline read-only UX + 提示 banner | ~150 | G3 |

可順序 G1 → G2 → G3 / G4 → G6;G5 可平行 G1-G4。

Phase G2 是最大,單一 PR 可能拆 2-3 個 sub-PR(scene I/O 一個 / AutoSave 切換一個 / asset wire 一個)。

### Phase G 內容詳述

#### G1 — `ProjectManager` interface refactor

- 新增 `src/core/project/ProjectManager.ts`:interface + `ProjectIdentifier` type + `SaveResult` discriminated union
- 新增 `src/core/project/LocalProjectManager.ts`:包裝既有 `ProjectFile` / `FileSystemDirectoryHandle` 邏輯,實作 interface
- 改 `App.tsx` / `Welcome.tsx` / `NewProjectModal.tsx` / `Toolbar.tsx` / `bridge.ts` / `ProjectChip.tsx`:用 `ProjectManager` 取代直接 `FileSystemDirectoryHandle`
- LocalProject 行為 100% 不變(只 refactor 介面層)
- 加 ESLint rule 禁 `FileSystemDirectoryHandle` 在非 LocalProject* 檔案直接出現(防 regression)

#### G2 — `CloudProjectManager` 實作

- 新增 `src/core/project/CloudProjectManager.ts`:包裝 `HttpSyncEngine` + `AuthClient` + `AssetResolver`
- `loadScene`:走 `GET /api/scenes/:id` + deserialize
- `saveScene`:走 `PUT /api/scenes/:id` with If-Match etag,handle 409 / 412 / 428 / 413 / 500(沿用 sync-protocol.md 錯誤碼)
- `resolveAsset`:走 `AssetResolver`(F-1 已 ready)
- IndexedDB cache:`'project-cache-' + sceneId` key,store scene blob bytes
- AutoSave 切換:`App.tsx` 根據 `projectManager.type` 注入不同 saveScene 路徑

#### G3 — Welcome / Toolbar UI

- `Welcome.tsx` 加 "Your cloud projects" 區塊(`<Show when={currentUser()}>`)
- `AuthClient.listCloudScenes()` 接 `GET /api/scenes`
- `Toolbar.tsx` cloud project mode 顯示 sync indicator(對齊 v0.1 HttpSyncEngine status)
- `NewProjectModal.tsx` 加 "Local / Cloud" 二選一

#### G4 — Client startup flow

- App.tsx onMount:讀 localStorage `activeProject`,if cloud + signed in → openCloudProject
- `syncEngine.pull` startup hook(目前 v0.1 沒接 pull,只接 push)
- 多 tab 場景:走 v0.1 MultiTabCoord(#1004)+ cache invalidation

#### G5 — Share URL token model

- Server:migration 加 `scene_share_tokens` 表 + `POST/GET/DELETE /api/scenes/:id/share-tokens` + `GET /api/scenes/:id` share_token query param 支援
- Client:`ShareDialog.tsx` modal — list active tokens + "Generate new" + copy-to-clipboard + revoke button
- `Toolbar.tsx` 加 "Share" button(cloud project + owner 才顯示)
- Anonymous viewer route:`/scenes/:id?share_token=<token>` → editor viewer mode

#### G6 — Offline read-only UX

- `useOfflineStatus()` hook(`navigator.onLine` + fetch ping)
- `OfflineBanner.tsx`:CloudProject + offline 時固定頂部
- 寫操作擋住:`CloudProjectManager.saveScene` 在 offline 時直接 return `{ ok: false, reason: 'offline' }`,toast 提示

## Migration plan(v0.1 → v0.2)

### Server 端

1. Migration 0006:add `scene_share_tokens` 表(§ 資料模型)
2. Server route mount:`POST/GET/DELETE /api/scenes/:id/share-tokens` + `GET /api/scenes/:id?share_token` 支援
3. v0.1 既有 endpoint 全不變,既有 user / scene 100% 相容

### Client 端

1. v0.1 user 升級時:登入後 client 偵測「local file 存在 + 已 sign in + 無 active cloud project」→ 提示 "Upload your local project to cloud?"(可拒絕,保持 local-only)
2. 拒絕的 user:LocalProjectManager 行為 100% 同 v0.1
3. 接受:走 § Local → Cloud 升級 flow
4. 新 v0.2 user:Welcome page 「Create new project」二選一,預設選哪個由 § Onboarding working hypothesis 決定(目前默認 LocalProject,Cloud 是 opt-in)

### Backward compat

- v0.1 client 仍可開 v0.2 server(只 GET/PUT scenes,不知 share token)
- v0.2 client 仍可開 v0.1 LocalProject(LocalProject 行為不變)
- Phase 過渡期:v0.1 client + v0.2 server 共存,直到 client release v0.2 才切

## 砍掉的東西(反指標)

| 條 | 為什麼不做 |
|---|---|
| ❌ Real-time co-edit / multi-cursor / presence | L3 等級,operational transform / CRDT,排 v0.3 |
| ❌ ACL / role-based 寫權限 | L3 dependency,排 v0.3 |
| ❌ Share URL 寫權限(invite-to-edit) | L3 等級 |
| ❌ Cross-project prefab library | 另一個 first-class 實體,v0.3 評估 |
| ❌ Marketplace / public scene gallery | 內容策略 + curation 工程,v0.3+ |
| ❌ Plugin / extensibility | 完全另一個 surface,排未來 phase |
| ❌ Offline edit + reconnect sync | L3 等級,LocalProject 是退路 |
| ❌ Multi-user 同一 scene 同 device | 不存在的場景 |
| ❌ AutoSave 雙寫(local + cloud mirror) | 雙寫 + reconcile = L3 級複雜度,不對等 ROI |
| ❌ Hybrid asset(some local some cloud per scene) | 跨 device load 來源不同,語意爆炸 |
| ❌ Share token TTL / 限時連結 | v0.2 不加;未來需要再加 `expires_at` 欄位 |

## Open Questions(remaining)

### Q-A:預設 project 模式(LocalProject vs CloudProject)

新 sign-in user 第一次進站,Welcome page 該預設選 LocalProject 還是 CloudProject?

- **推薦 LocalProject** — 對齊「Local + cloud 3D editor」定位,CloudProject 是 opt-in。降低 onboarding 焦慮(不強迫信任 cloud)。
- 替代 CloudProject — 對齊「sign in → cloud first」期待。但會跟 LocalProject offline UX 衝突。

實作 G3 階段 dialog UI 時拍板。

### Q-B:LocalProject ↔ CloudProject 雙向同步

LocalProject 已升級到 cloud 後,user 想拉回 cloud → local?(例如 "Download as local")

- v0.2 推薦不做(避免雙寫陷阱)
- v0.3 可加 "Export cloud project as local" 一鍵下載(類似 GDPR export 但 zip 格式)

### Q-C:Share token URL fragment vs query param

`?share_token=` 走 query param,server 看得到(便 SQL 比對)。改 `#share_token=` URL fragment server 看不到(更隱私,但需 client-side route 解析 + 自己呼叫 API 帶 token)。

- v0.2 用 query param(實作簡單)
- v0.3 評估改 fragment(若有 PII 風險)

## 實作里程碑

- **Phase A** — Spec 凍結(本文件 review) ✅(本 PR)
- **Phase G1** — `ProjectManager` interface refactor
- **Phase G2** — `CloudProjectManager` 實作
- **Phase G3** — Welcome / Toolbar UI
- **Phase G4** — Client startup flow
- **Phase G5** — Share URL token(可平行)
- **Phase G6** — Offline read-only UX
- **Phase H** — Onboarding user testing + 文案最終 review(release blocker per Q4 加碼)

Phase A 完成後開 v0.2 epic issue + 6 G* sub-phase issue。G1 first PR — risk lowest,unlock 其他 phase。
