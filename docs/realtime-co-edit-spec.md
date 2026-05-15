# Erythos Real-time Co-edit — v0.5 spec

> 本文件規範 multi-user 場景的同步協定。Solo / 同帳號跨 device 路徑見 `sync-protocol.md`(優化 concurrency + 409 dialog),Asset 同步見 `asset-sync-protocol.md`。
>
> 來源:AA 戰略審查 `.claude/scratch/l3-strategy-2026-05-15.md`(2026-05-15) + 3 OQ 拍板。

## 設計哲學

v0.5 引入 **real-time co-edit** 路徑,與 v0.4 multi-device sync 並存。Solo 路徑保留 `sync-protocol.md` 既有 optimistic concurrency 模型;multi-user 同 scene 走 CRDT awareness,**無 409**(deterministic merge)。

- **Hybrid path,不 invert v0.4 反指標**:solo 跨 device same-user 仍走 `If-Match` + 409 dialog;multi-user same-scene 走 CRDT。兩條 code path 透過 `project.collabMode` flag gate。
- **L3-A presence-only ship v0.5.0**:multi-cursor + selection visualization + online user avatars。Y.Doc 跑空,**不上** CRDT 寫操作。寫仍走既有 `HttpSyncEngine` PUT。
- **CRDT + ACL co-arrive v0.6.0**:multi-write 無 ACL 是炸彈,有 ACL 無 CRDT 是空殼。兩者必須一起 ship。
- **不在 v0.5 統一 sync code path**:`SyncEngine.push()` 與 `Y.Doc + ws` 兩條獨立 path,**不共用 conflict-resolution 程式碼**。統一是 v1.0+ refactor。

反指標(v0.5 不做):

- ❌ **v0.5 上 CRDT 寫操作** — 留 L3-B(v0.6.0)
- ❌ **砍 v0.4 409 dialog** — solo 路徑保留
- ❌ **per-scene 軟 write-lock interim** — anti-collaborative UX,competitors 不這樣
- ❌ **CRDT path 上的 conflict UX** — CRDT 不存在「需要使用者拍板的衝突」
- ❌ **單一 Y.Doc cover 全 scene state** — Hybrid CRDT(scene tree `Y.Map`,materials / components LWW register,prefab refs immutable)是 L3-B 設計
- ❌ **自寫 CRDT / 自寫 ws server / Liveblocks SaaS / Loro production / WebRTC P2P** — 見 § 架構選擇

## Scope(已拍板)

OQ-1 拍板 L3-A only。3 OQ 拍板結果見 `.claude/decisions/log.md` 2026-05-15 條目。

| 階段 | 範圍 | 版本 | 估時(solo dev) |
|---|---|---|---|
| **L3-A** | Presence(multi-cursor + selection + online avatars) + Yjs/HocusPocus infra | **v0.5.0** | 2-3 週 |
| L3-B | CRDT:接 Y.Doc / Command / `Y.UndoManager` / Solo-Collab 雙路徑 | v0.6.0 | 4-6 週 |
| L3-C | ACL:share-token `role` + editor-link generation | v0.6.0(L3-B co-arrive) | 1-2 週 |
| L3-D | Polish:collab undo UX / offline reconcile / conflict viz | v0.6 末 / v0.7 | 2-3 週 |

## 架構選擇(已拍板)

| 項目 | 選型 | 理由 |
|---|---|---|
| CRDT library | **Yjs** + `@hocuspocus/extension-database` | 穩定 production;Loro 仍 experimental,核心 collab infra 不押賭注 |
| Sync protocol | **WebSocket via `@hono/node-server` v2 內建 `upgradeWebSocket`** | `@hono/node-ws` 2025 deprecated;HocusPocus 自帶 ws server |
| Hosting | 同 Linode VPS(共用 Postgres + cookie auth) | 1000 conn @ 4GB RAM 應 OK,需上 monitoring |
| 衝突模型 | Hybrid(solo 保 409,collab CRDT 無 409) | 不 invert v0.4 跨 device 同步設計 |
| Persistence | HocusPocus + 官方 `@hocuspocus/extension-database` + 自接 pg adapter | 第三方 Postgres extension 不健康;官方 generic adapter 自接半天工程 |
| Auth | 復用 sync-protocol.md D3 self-rolled HMAC session | HocusPocus `onAuthenticate` hook 解 cookie + 查 Postgres `sessions` 表 |
| Awareness throttle | 30Hz client-side(cursor / selection) | Figma 用 20Hz;不調 ws server config |

**為何不 Loro**:tree-move 語意更佳,但官方明寫「API and encoding schema remain experimental, advise against production use」。Loro server 生態不存在(等價 HocusPocus 沒有)= 自寫 ws + persistence = 工程量翻倍。等 Loro 1.5+ stable(6-12 個月)再評估。

**為何不 Liveblocks / Partykit SaaS**:違反 Linode VPS 全包約束。

**為何不自寫 CRDT**:tree-move CRDT 是 research-grade(Kleppmann 2021)。solo dev 不該花。

## L3-A scope(v0.5.0 ship)

### Deliverable

1. **Multi-cursor** — 遠端 editor 在 viewport 顯示彩色 cursor + user avatar + name
2. **Selection visualization** — 遠端 editor 的 selected node 以彩色 outline 標示(viewport + scene-tree)
3. **Online users avatar bar** — toolbar 顯示當前 scene 連線 user 頭像

### Infra(Y.Doc 跑空)

- **Y.Doc state**:scene state 仍在 `SceneDocument`,Y.Doc 純當 awareness transport。寫操作不接 Y.Doc。
- **HocusPocus server**:獨立 entry(`server/realtime/`),共用 Linode VPS + Postgres + cookie auth
- **Awareness state**(`y-protocols/awareness`):
  ```ts
  awareness.setLocalState({
    user:      { id, name, avatarUrl, color },
    cursor:    { x, y, viewport: 'main' | 'scene-tree' | null },
    selection: { nodeIds: string[] },
  })
  ```
- **Connection**:client 開 scene 時連 `wss://erythos.app/realtime/:sceneId`,server `onAuthenticate` 驗 cookie + scene visibility / ownership

### Client integration

- `RealtimeClient`(新)— wrap `HocusPocusProvider`,訂 awareness state,emit `awarenessChanged` event
- Viewport / scene-tree / Toolbar 訂 `RealtimeClient`,各自渲染對應 UI
- `SceneDocument` 不變;`Command` / `History` / `AutoSave` 全走既有 PUT 路徑

### Awareness payload 預算

- Cursor broadcast:30Hz(33ms tick),delta encoding(只送變動欄位)
- Selection broadcast:on change(非 throttle)
- User join / leave:HocusPocus 內建 awareness state add / remove event

## L3-A 不做的事

- ❌ **CRDT 寫操作** — 留 L3-B
- ❌ **Command / History 接 Y.Doc** — 留 L3-B
- ❌ **ACL** — Yjs awareness 對 scene viewer 全公開;寫操作仍受既有 owner check 限制(non-owner Edit 仍走 fork,對齊 sync-protocol.md § 分享連結)
- ❌ **Collab undo UX** — 留 L3-D
- ❌ **Anonymous viewer 是否加入 awareness** — 預設 anonymous 不加入(OQ-4 deferred,L3-A4 phase 拍板)
- ❌ **Offline reconcile** — L3-A 斷線即斷線,UI 顯示 simple disconnect 提示

## v0.6 預留

### L3-B CRDT(預估 4-6 週)

Solo / Collab 雙路徑 table:

| 元件 | Solo mode | Collab mode |
|---|---|---|
| Source of truth | `SceneDocument`(canonical) | `Y.Doc`(`SceneDocument` 變 derived view) |
| `Command` | 直接 mutate `SceneDocument` → `History` | `Y.Doc.transact(() => mutations, origin)` |
| `History` | 既有 `History.ts` undo/redo stacks | `Y.UndoManager`,`trackedOrigins = { localUser }` |
| `AutoSave` | 既有 debounced PUT | **關閉**(HocusPocus 自 persist) |
| Schema | `scenes.body BYTEA` 整檔 | `yjs_updates(scene_id, update BYTEA, seq INT)` + periodic snapshot |

**Spike 1 週(v0.6 開頭)**:Y.Doc vs `SceneDocument` 雙 source of truth blast radius 確認。渲染端必須只看 `SceneDocument`(隔離 Yjs 依賴在 sync layer),否則 library 換掉時整 viewport 都炸。

**Undo 語意**:採 Figma / Google Docs 慣例 — undo 只還原自己 op 最小集,別人後續 edit 保留。

### L3-C ACL(預估 1-2 週,L3-B co-arrive)

- `share_tokens` 表加 `role: 'viewer' | 'editor'` column
- Owner 從 share dialog 產生 editor-link;有 link 的登入 user 可寫
- Anonymous viewer 仍 read-only;非 editor-link 持有者仍走 fork
- **不做 email-invite**(留 v0.7+:新表 / state machine / bounce-back / UI ≈ 4+ 週)

**Firm dependency**:multi-write 沒 ACL = 拿到 URL 任何登入 user 都能改 owner scene → ACL 在 v0.6 必須跟 CRDT 一起 ship。

### L3-D Polish

- Collab undo UX(實機驗證 Figma 慣例 friction)
- Offline reconcile(client 斷線重連 awareness state + missed update)
- Conflict viz polish(L3-B 一 user 改另一 user 修改的 node 時 UX 提示)

## Yjs tree-move limitation(已接受 caveat)

Yjs tree 表達是 nested `Y.Map`,**無原生 move op**。reparent SceneNode 是 delete-and-insert。Erythos scene 是 deeply nested tree + reparent 常見操作,limitation 真實存在。

**L3-A 不受影響**:Y.Doc 空,scene state 不在 Y.Doc。

**L3-B mitigation**(OQ-2 拍板 Option A — 接受 caveat):
- Short term(v0.6.0):awareness 廣播「subtree X moving by user Y」做 advisory lock。UX layer disable subtree property edit < 1s window,cover 90% case。
- Mid term:fractional indexing(`yjs-orderedtree`)
- Long term:評估 Loro 1.5+ stable

**Release notes(v0.6.0)**:明文「multi-user reparent 同時 property edit 可能 lost update,short-term mitigation 為 UX advisory lock」。

## Top 5 integration risks

| # | Risk | 嚴重度 | Mitigation |
|---|---|---|---|
| 1 | Yjs tree-move lost-update | P1 | § Yjs tree-move limitation |
| 2 | `Y.Doc` vs `SceneDocument` 雙 source 風險 | P1 | v0.6 開頭 1 週 spike;collab mode `SceneDocument` 進 read-only;TS brand type 區分 |
| 3 | HocusPocus 第三方 Postgres extension 維護差 | P2 | OQ-3 拍板 Option A — 官方 `@hocuspocus/extension-database` + 自接 pg adapter(半天) |
| 4 | `AutoSave` + Yjs persistence 雙寫衝突 | P2 | collab mode → `AutoSave.suppress` 永久;schema `scenes.body` / `yjs_updates` 互斥 |
| 5 | ws auth + session cookie 整合 | P2 | `onAuthenticate` hook 解 cookie + 查 Postgres `sessions`;anonymous viewer awareness 加入與否 OQ-4 deferred |

## Phase 順序

```
L3-A (v0.5.0)
   ↓ ship + 收 user feedback
L3-B (CRDT)  ┐
             ├── parallel, must co-arrive (v0.6.0)
L3-C (ACL)   ┘
   ↓
L3-D (polish, v0.6 末 / v0.7)
```

- **L3-A first**:零 blocker。Yjs + HocusPocus + ws auth infra 先架起來鋪 v0.6 路。
- **L3-B / L3-C parallel in v0.6**:必須一起 ship(理由見 § L3-C ACL)。獨立工程可並行(B 動 sync / Command / Y.Doc;C 動 share-token / schema / permission)。
- **L3-D 收尾**:UX polish 需 B/C 落地後才知實際 friction。

## Open questions(deferred)

| OQ | 議題 | 處理時機 |
|---|---|---|
| OQ-4 | Anonymous viewer 是否加入 awareness presence(影響 awareness schema 與 server `onAuthenticate` 邏輯) | L3-A4 phase |
| OQ-5 | Collab undo 語意實機驗證(AA 推薦 Figma 慣例 — 只 undo 自己 op) | L3-D 階段 |

## 砍掉的東西(反指標 — 不要在實作中誤上)

- ❌ **v0.5 統一 sync code path** — 兩條獨立 path 撐到 v1.0+
- ❌ **CRDT path 上做 conflict UX** — CRDT merge deterministic,無使用者拍板需求
- ❌ **單一 Y.Doc cover 全 scene state** — L3-B 採 hybrid(scene tree `Y.Map`、materials / components LWW、prefab refs immutable)
- ❌ **為 60Hz cursor 加 ws worker** — client throttle 30Hz,不調 server
- ❌ **per-scene 軟 write-lock interim** — anti-collaborative UX,competitors 不這樣
- ❌ **L3-B 上同時做 email-invite ACL** — v0.7+
- ❌ **砍 v0.4 設計哲學(409 dialog)** — solo 路徑仍正確;見 `sync-protocol.md` § 設計哲學
