# Erythos Magic Link 登入 — F-5 spec v0

> 本文件定義 Magic Link 無密碼登入的設計契約。GitHub OAuth 認證見 `docs/sync-protocol.md` § 認證實作。
>
> 來源:issue #955 / #938,D3 self-rolled auth 決策(2026-05-09)。

## 設計哲學

Magic link = 把「密碼」換成「一次性連結寄到信箱」。使用者點連結即登入,無需記密碼。

**vs password 的 tradeoff**:

| 維度 | Magic Link | Password |
|------|-----------|---------|
| 安全 | 無 brute force / credential stuffing 攻擊面 | DB 洩漏即失陷 |
| 體驗 | 無需記密碼;切換裝置只需 email | 可離線驗證 |
| 依賴 | inbox 必須可達(spam folder 風險、Resend 可用性) | 無外部依賴 |
| Password reset | 不需要(本身就是 reset 機制) | 另需 reset flow |

**為何選這條路**:spec D3 認證決策（2026-05-09）明訂 GitHub OAuth v0、magic link v0.1 後加。受眾有「dev who-not-on-github」的使用場景(設計師等非 GitHub 用戶),email-only path 是最小摩擦的第二登入方式,且不引入 password hashing / reset flow 等額外複雜度。

## 架構選擇(已拍板)

| 項目 | 選型 | 理由 |
|------|------|------|
| Token 類型 | opaque random(`randomBytes(32).toString('hex')`) | 比 HMAC JWT 簡單;DB 存 sha256 hash,DB 洩漏不可直接 replay(refs #894) |
| Token 存法 | DB 存 `sha256(plaintext)`,client link 帶 plaintext | 與 session token pattern 完全一致(reuse `hashSessionToken`) |
| 寄信 vendor | Resend SDK | deliverability 強、TS-first API、SPF/DKIM 受管;避自架 SMTP(deliverability 風險) |
| Session 建立 | 沿用 `createSession(c, userId)` 與 `setSessionCookie` | magic link 是 D3 self-rolled 第二條路徑,cookie 格式與 GitHub OAuth session 相同 |
| Better Auth | dep 保留但不 wire | auth.ts 注釋已明說:「Better Auth remains a declared dependency for future auth methods」(D3 決議) |

## Flow

```
Client                     Server                          Resend / Email
  │                           │                               │
  │─ POST /api/auth/magic-link/request {email} ──────────────>│
  │                           │ gen plaintext = randomBytes(32).hex
  │                           │ tokenHash = sha256(plaintext)
  │                           │ INSERT magic_link_tokens(tokenHash, email, expires_at = now+15m)
  │                           │─── sendEmail(to=email, link=BASE_URL/api/auth/magic-link/verify?token=plaintext) ─>│
  │<─ 200 { ok: true } ───────│                               │
  │                           │                     [user clicks link in inbox]
  │── GET /api/auth/magic-link/verify?token=<plaintext> ─────>│
  │                           │ tokenHash = sha256(plaintext)
  │                           │ SELECT * FROM magic_link_tokens WHERE token_hash=$1
  │                           │   check: 未過期 / usedAt IS NULL
  │                           │ SELECT user WHERE email=$email  (or INSERT new user)
  │                           │ UPDATE magic_link_tokens SET used_at=now()
  │                           │ createSession(c, userId)   → setSessionCookie
  │<─ 302 redirect / ─────────│
```

request endpoint 統一回 200,不論 email 是否已存在 — 防 user enumeration。

## Token 規格

- **生成**:`randomBytes(32).toString('hex')` → 64 字元 hex plaintext
- **存法**:`sha256(plaintext)` 存入 `magic_link_tokens.token_hash`(沿用 `hashSessionToken()` 邏輯,refs #894)
- **TTL**:預設 15 分鐘;env var `MAGIC_LINK_TTL_MS` 可覆蓋
- **One-time**:`used_at` 欄位寫入後即失效,不可再用

## 資料模型

```sql
CREATE TABLE magic_link_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  TEXT        NOT NULL UNIQUE,
  email       TEXT        NOT NULL,
  user_id     UUID        REFERENCES users(id),  -- nullable: 新 email 尚未建 user
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX magic_link_tokens_email_idx   ON magic_link_tokens(email);
CREATE INDEX magic_link_tokens_expires_idx ON magic_link_tokens(expires_at);
```

`user_id` nullable:request 時尚未確認 email 是否存在;verify 時才建立 user_id 關聯。

## REST API

### `POST /api/auth/magic-link/request`

```
Request:
  Content-Type: application/json
  Body: { "email": "user@example.com" }

Response 200:
  Body: { "ok": true }

Response 400:
  Body: { "error": "invalid_email" }   -- email format 不符

Response 429:
  Body: { "error": "rate_limited" }    -- rate limit 觸發(見 § Rate Limit)
```

**永遠回 200**,不論 email 是否已存在資料庫,防止 user enumeration。429 由 IP 維度觸發,不從 per-email 角度觸發(否則攻擊者可用 429 探知某 email 是否曾請求)。

### `GET /api/auth/magic-link/verify?token=<plaintext>`

```
Response 302 (成功):
  Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Lax
  Location: /

Response 302 (失敗):
  Location: /?auth_error=<code>
```

錯誤 code:

| code | 場景 |
|------|------|
| `expired` | token 超過 TTL |
| `used` | `used_at` 已設定 |
| `invalid` | hash 查不到或 hash mismatch |
| `rate_limited` | IP rate limit(verify 也加保護) |

類比 E4 #920 OAuth error banner pattern — client 讀 `auth_error` query param 顯示 banner。

## Resend Integration

**必填 env vars**:

| 變數 | 說明 |
|------|------|
| `RESEND_API_KEY` | Resend API key,必填 |
| `MAGIC_LINK_FROM_EMAIL` | 寄件人,預設 `noreply@erythos.eoswolf.com` |
| `MAGIC_LINK_BASE_URL` | 連結 base;prod = `https://erythos.eoswolf.com`,dev = `http://localhost:3000`(伺服器端口,Caddy 反代後同 5173) |
| `MAGIC_LINK_TTL_MS` | TTL(毫秒),選填,預設 `900000`(15 min) |

> `MAGIC_LINK_BASE_URL` dev 值的歧義:Vite dev 是 :5173,Hono server 是 :3000。email link 需打 server 端口或由 Caddy 統一代理。確認部署設定前留為 Open Question。

**Email template 規格**:

- `Content-Type: text/html` + `text/plain` fallback(避 spam filter)
- 主旨:`Your Erythos sign-in link`
- 內文:magic link 按鈕/超連結 + TTL 提示(`Valid for 15 minutes`) + 免責行 `If you didn't request this, please ignore this email.`
- link = `${MAGIC_LINK_BASE_URL}/api/auth/magic-link/verify?token=${plaintext}`

## OAuth 並存策略

magic link 進來的 email 與既有 GitHub OAuth users 共用同一 `users` 表。

**email 是主鍵識別**(schema.ts 第 37 行:`email: text('email').unique().notNull()` — UNIQUE 已釘):

1. `SELECT * FROM users WHERE email = $email`
2. 有 → 直接 sign in(GitHub OAuth user 與 magic link 視為同一帳號)
3. 無 → `INSERT users(github_id=NULL, email=$email, github_login='')`(github_id 留 null,github_login 給空字串或 email local part)

此規則確保「同一人先 GitHub 登、後 magic link 登」不會建出重複帳號。`users.github_id` 目前 schema 為 `UNIQUE NOT NULL` — 若要支援 github_id nullable 需 migration(標注為 follow-up #956 scope)。

## Rate Limit

| 維度 | 限制 | 說明 |
|------|------|------|
| per email | 60 秒 1 次 request | 防同一人連打 |
| per IP | 每小時 10 次 request | 防垃圾信轟炸他人信箱 |
| per IP(verify) | 每分鐘 20 次 | 防暴力枚舉 token |

**v0 實作建議**:in-memory `Map<string, timestamp>` 輕量可行(重啟清空,可接受)。高負載再遷 Postgres 或 Redis。

**防 enumeration**:per-email 429 不回給 client(server 靜默吸收,仍回 200)。per-IP 429 才對外露出。

## 與 D3 Self-Rolled Auth 的關係

magic link 是 D3 self-rolled auth 第二條路徑,**非** Better Auth route。

直接沿用 `server/src/auth.ts` 現有 helpers:

| Helper | 用途 |
|--------|------|
| `generateSessionToken()` | magic link token 生成(randomBytes 32) |
| `hashSessionToken(token)` | sha256 hash — token 存 DB 前呼叫(refs #894) |
| `createSession(c, userId)` | verify 成功後建 session + set cookie |
| `setSessionCookie(c, token)` | 已被 `createSession` 內呼叫 |

Better Auth dep 保留於 `package.json`(D3 已決);未來若需 email/password adapter,Better Auth 才介入。本 spec 不 wire Better Auth。

## GDPR 互動

`DELETE /api/me`(refs #934)刪帳號時,cascade 清該 user 未使用的 magic link token:

```sql
DELETE FROM magic_link_tokens
WHERE user_id = $1 AND used_at IS NULL;
```

過期 token 不需在此清 — 另有 reaper cron 定期清(30 天後再清,留 audit trail)。

`CASCADE` 在 `magic_link_tokens.user_id REFERENCES users(id)` 設 `ON DELETE CASCADE` 可自動處理;或在 `DELETE /api/me` 顯式先刪再刪 user — 實作 spec 選一種即可。

## 錯誤處理

| HTTP code | auth_error / error body | 場景 |
|-----------|------------------------|------|
| `400` | `invalid_email` | email format 不符 |
| `429` | `rate_limited` | per-IP rate limit 觸發 |
| `200` + redirect `/?auth_error=expired` | — | token TTL 過期 |
| `200` + redirect `/?auth_error=used` | — | token 已使用 |
| `200` + redirect `/?auth_error=invalid` | — | hash 查無 / mismatch |
| `200` + redirect `/?auth_error=rate_limited` | — | verify per-IP limit |
| `302 /` + session cookie | — | 驗證成功 |

## Open Questions

- **Resend free tier**:每月 3,000 封 email;受眾小時夠,但需確認 domain SPF / DKIM / DMARC 設定完成後 deliverability 可接受
- **`MAGIC_LINK_BASE_URL` dev 歧義**:Vite dev server :5173 vs Hono server :3000,email link 需打哪個?確認 Caddy dev 設定後釘死
- **Token 撤銷策略**:token 用完保留 30 天再由 reaper cron 清 vs 用完即刪。建議留 30 天(audit trail);具體清除時間實作時敲定
- **`users.github_id NOT NULL` 衝突**:schema 目前 `github_id BIGINT UNIQUE NOT NULL`,magic link 新 user 無 github_id → 需 migration 改 nullable(或用 sentinel -1)。Phase B 實作 spec #956 需處理

## 砍掉的東西

- ❌ **SMS / WhatsApp 通道** — spec 外;多一個 vendor dep
- ❌ **多語 email template** — 英文單版夠;i18n 後加
- ❌ **password 第三條路徑** — 不做;magic link 已解決 non-GitHub user 問題
- ❌ **Better Auth wire** — D3 已決不 wire;留 dep 等未來
- ❌ **自架 SMTP** — deliverability 風險 + IP warmup 成本;Resend 管理更佳
- ❌ **TOTP / 2FA 強化** — v0 不做

## 實作里程碑

- **Phase A** — Spec 凍結(本文件 review,refs #955)
- **Phase B** — server skeleton:DB migration 加 `magic_link_tokens` 表 + 處理 `github_id nullable`(refs #956)
- **Phase C** — Resend SDK 接入 + `/api/auth/magic-link/request` / `/api/auth/magic-link/verify` endpoint mount + rate limit 實作
- **Phase D** — client UI:登入頁加 email input + 發送成功畫面 + auth_error banner(reuse E4 #920 pattern)
