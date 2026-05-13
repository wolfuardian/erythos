# 下一步 todo / 本 session 完成盤點

> **2026-05-11 session 收尾**(updated after mid batch)
> 圖例:✅ 已完成 / ⬜ 未開始 / ⏸️ deferred / ⏭️ skip(有理由)/ 🟦 進行中
> main HEAD `c750a83` — Phase E + GDPR + Quality 三連修 + Ops 四連修(DB backup / CI/CD / Observability / Performance)全 land、build pass、prod live `https://erythos.eoswolf.com`

---

## 🟢 收尾(5-30 分鐘)

- [x] **#912 GDPR epic close summary** ✅
  Closed with sub-PR refs(#934 server / #936 client / hotfix `8ee3963` cookie clear 屬性鏡像)
- [x] **session-handoff** ✅
  寫入 `.claude/session/current.md`(gitignored,local-only)
- [ ] **2 worktree dirs cleanup** ⏸️ deferred
  `.claude/worktrees/agent-a245c014a1147750d` + `agent-ad319bb36693d3fc3` locked by IDE pid 20456。需 IDE 重啟後 `git worktree remove -f -f <path>` + `git branch -D feat/gdpr-{client-user-menu-932,server-export-delete-931}`
- [x] **#935 drizzle journal 補登** ✅
  commit `1a96a7e`(0001 idx 1 / 0002 idx 2)。⚠️ prod impact:下次 `drizzle:migrate` 會 re-apply 0001 SQL = `TRUNCATE TABLE sessions`,所有當前 session 失效、users 一次性 force re-login
- [x] **修 #889 / #911 / #917 close 狀態** ✅
  #889 + #917 之前 PR 已 auto-close。11 個 stale 全 close 帶 sub-PR ref:#911 / #914 / #915 / #916 / #922 / #932 / #898 / #894 / #895 / #890 / #891

## 🟡 中等(1-2 小時)

- [ ] **dependabot vulnerability** ⏭️ accepted, not fixed
  esbuild GHSA-67mh-4wv8-2f99(CVSS 5.3 moderate)。來源 `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild@0.18.20`;`@esbuild-kit/core-utils` 上游 deprecated,nested overrides + `npm install` 不 re-resolve transitive。dev-only(localhost dev server 暴露面),prod 不暴露。Remediation:等 drizzle-kit 上游切 tsx-only。decisions log 已記
- [x] **spec / code drift audit** ✅
  GDPR + 認證 + 場景核心 endpoint 全部 spec 與 code 一致。剩餘:`/health` endpoint 沒寫進 spec(小 doc gap,列 backlog)。`POST /scenes/:id/versions` 與 `GET /scenes` list spec 本就沒寫(audit prompt 多列)
- [x] **tech debt audit** → #937 ✅
  3 個真 `as any`(其餘 false positive):`bridge.ts:197,250` event listener 泛型 / `workspaceStore.ts:118` migration anyState / `v0_to_v1.ts:185` migration result cast。各 < 50 行,低優先
- [x] **Phase F epic + brainstorm** → #938 ✅
  6 候選 phase:F-1 Asset sync / F-2 CI-CD / F-3 Multi-device hardening / F-4 Observability / F-5 Magic link / F-6 Performance。建議 F-1 為主軸
- [x] **CLAUDE.md 結構 review**(partial) ✅
  `src/viewport/CLAUDE.md` L11 修了(inline style → CSS Modules,與主檔樣式契約一致)。主檔 tombstone / 模組路徑 stale / scene-tree / properties 補 — skip,memory feedback `feedback_no_proactive_claude_md_polish.md` 過去 3 次 revert

## 🔴 大(下個 session 起點)

本 session 只規劃不實作。全部在 #938 phase F brainstorm:

- [x] **Asset sync** → Phase F-1,epic #957 ✅ **prod live 2026-05-12**
  spec `docs/asset-sync-protocol.md`(2026-05-12 補完 scene asset URL 欄位 §,PR #976 / closes #975)。✅ F-1a S3 module #960 + ✅ F-1b schema + migration #961 + ✅ F-1c endpoints #962 + ✅ F-1d-1 HttpAssetClient + AssetResolver cache #963 + ✅ F-1d-2a Wire HttpAssetClient → Editor #964 + ✅ F-1d-2c Quota UI #972 + ✅ F-1d-2b Upload binaries pre-push hook + URL rewrite #973(QC PASS,dragon)。783/783 tests + build pass。✅ Ops:Linode `erythos-assets` bucket Tokyo 3、access key 共用 backup 那把、`.env` 補 `S3_ASSETS_BUCKET=erythos-assets`、server restart、prod smoke `curl https://erythos.eoswolf.com/api/assets/<zero-hash>` 回 404(預期)。Follow-up 全 closed:✅ #974 v1_to_v2 hash-form guard (PR #978,QC PASS) / ✅ #975 closed by PR #976 / ✅ #979 uploadSceneBinaries round-trip cleanup (PR #982,QC PASS,F-1d-2b dragon 路徑現乾淨)。F-1 epic 完全收乾淨
- [ ] **Magic link + Resend** → Phase F-5,#938 / spec #955 / skeleton #956 🟦 Phase A+B 已完成,**Phase C+D 為本 session 主待辦**
  ✅ `docs/magic-link-spec.md`(230 行 15 章節,PR #958 merged)+ ✅ `server/src/auth/magic-link.ts` unwired stub(2 helper + 2 TODO function)+ `magic_link_tokens` schema + migration 0003(PR #959 merged,prod live)

  **Phase C+D 切 4 PR 串行**(C1 → C2 → C3 並行 D1):

  | PR | 內容 | 指揮家依賴 | 預估 LOC |
  |---|------|----------|---------|
  | **C1** | migration 0005 `users.github_id` 從 `BIGINT UNIQUE NOT NULL` 改 nullable + `schema.ts` type 對齊(spec § OAuth 並存:magic link 新 user 無 github_id) | 無 | ~20 |
  | **C2 ✅** | `magic-link.ts` 核心邏輯展開(`requestMagicLink` 完整實作 INSERT token / `verifyMagicLink` 完整實作 SELECT+UPDATE+find-or-create user)+ `routes/magic-link.ts` 新增 `POST /api/auth/magic-link/request`(zod email 驗 + rate limit + 寄信)/ `GET /api/auth/magic-link/verify`(查 + `createSession` + 302 with `?auth_error=<code>` on fail)+ in-memory rate limit `Map<string, timestamp>`(per-email 60s 1 次 / per-IP request 1h 10 次 / per-IP verify 1min 20 次)+ mount 在 `index.ts` 的 `/api` router + `.env.example` 補 4 個 env var + 12 tests。**寄信暫 stub**:`RESEND_API_KEY` unset 時 `console.log(plaintext)`,本地 dev 友善。**Land via PR #989(merged 2026-05-12)** — 揭露 prod `.env` 漂移(`ALLOWED_ORIGIN` + `S3_*` 缺,follow-up #992)+ 開 2 follow-up #990 verify race / #991 Caddy XFF strip | 無(等 C1 merge) | ~250-350 |
  | **C3** | Resend SDK integrate(`npm install resend` 加 server workspace 依賴)+ email template(HTML 主 + `text/plain` fallback;主旨 `Your Erythos sign-in link`;內含 magic link button + `Valid for 15 minutes` 提示 + `If you didn't request this, please ignore` 免責)+ env-gated 替掉 C2 stub(`if (process.env.RESEND_API_KEY) sendViaResend() else console.log`)+ tests(template render + mock Resend client) | **指揮家**:Resend account + DNS + key | ~150-200 |
  | **D1 ✅** | `AuthClient.requestMagicLink(email)` 方法 + 對應 tests + client UI(Toolbar Sign in 開 SignInDialog modal,內含 GitHub OAuth button + email input form;送出後顯示「Check your inbox」狀態;HTML5 validity + 自定 error 文案)+ `?auth_error=` banner extend `expired` / `used` / `invalid` / `rate_limited`(reuse #920 OAuth pattern)+ 17 tests(6 AuthClient + 11 SignInDialog)。**Land via PR #993(merged 2026-05-12)**。advisor 提建議全採:`onOpenOAuth` callback 代替 `oauthStartUrl` prop(test 不用 stub `window.location`)/ HTML5 `validity.valid` 防 malformed round-trip / `AuthErrorBanner` namespace 注釋 | 無(D1 並行 C3,但需 C2 已 land 才能本地 e2e 串通) | ~200-300(實際 734 行含 css + tests) |

  **Open questions 已釘**(實作遵循,不再 review):
  - `MAGIC_LINK_BASE_URL` dev = `http://localhost:5173`(Vite),需確認 `vite.config.ts` 有 proxy `/api → http://localhost:3000`(C2 PR 內順手 verify;沒設則加上)。Prod = `https://erythos.eoswolf.com`(Caddy 統一)
  - Token 撤銷策略 = 用完保留 30 天 + reaper cron 清過期 token(reaper 留為 follow-up issue,**不在 C+D scope**;C2 階段 schema 允許 `used_at IS NOT NULL` row 留著即可)
  - `users.github_id` nullable 走 migration 改 nullable(C1 做),不用 sentinel `-1`(anti-pattern + UNIQUE constraint 踩雷)

  **指揮家準備清單**(C3 開工前 / 上線前):
  - [ ] [Resend.com](https://resend.com) 帳號註冊 + 拿 API key(free tier 月 3000 封)
  - [ ] Cloudflare DNS 加 SPF / DKIM / DMARC record(Resend dashboard 給確切 record 內容;否則寄出的信很容易進 spam folder)
  - [ ] 確認寄件人 `noreply@erythos.eoswolf.com`(或要換別的 local part?)
  - [ ] prod `.env` 補三條(C3 merge 後做):`RESEND_API_KEY=<key>` / `MAGIC_LINK_FROM_EMAIL=noreply@erythos.eoswolf.com` / `MAGIC_LINK_BASE_URL=https://erythos.eoswolf.com`,然後 push main 自動 deploy(`erythos-server` restart 帶起新 env)

  **out-of-scope**(spec § 砍掉的東西,不要重提):SMS / WhatsApp / 多語 email / password 第三路徑 / Better Auth wire / 自架 SMTP / TOTP-2FA / reaper cron(留 follow-up)
- [x] **CI/CD pipeline** → #948 / PR #952 ✅
  GitHub Actions `deploy.yml` push main → VPS scp + atomic symlink flip + 自動 prune > 5 release。install.md Phase 14 含 SSH key + secrets setup 步驟。Prod 啟用前先設 SSH_PRIVATE_KEY / VPS_HOST / VPS_USER 三個 secret
- [ ] **Multi-device e2e** → Phase F-3,#938 ⬜
  真 2-3 device 測 sync + conflict resolution UI + fork
- [x] **Performance / Lighthouse audit** → #950 / PR #954 ✅
  baseline **Perf 0.62 / LCP 6.5s** → after **Perf 0.94 / LCP 2.6s**(超目標)。透過 bundle visualizer + 移 `MathUtils` import + 拆 chunk。Full three.js dynamic import 留 follow-up(Editor 同步 contract 需 refactor)
- [x] **DB backup + recovery** → #947 / PR #951 ✅ + prod deploy 2026-05-12 ✅
  daily pg_dump → Linode Object Storage(`backup.sh` + crontab `0 3 * * *`)+ `restore.md` stream-restore。Prod ops 已落地:Tokyo 3 bucket `erythos-backups`,`.env` 設好,manual 試跑 OK,cron 已排。Doc 補:`S3_ENDPOINT` region-only 格式(非 virtual-hosted)+ AWS CLI v2.34 checksum workaround(refs decisions log 2026-05-12)

## 🩺 Quality / hygiene(隨時)

- [x] **Observability** → #949 / PR #953 ✅ **prod live 2026-05-12**
  pino structured logger(JSON prod / pretty dev)+ `GET /api/metrics`(in-memory counters + basic auth)+ `/health` DB connectivity check(degraded 仍回 200,給 uptime monitor 讀 body)+ `app.onError` 全局 handler + process unhandledRejection/uncaughtException sink。Prod ops 已落地:`.env` 補 `METRICS_USER=metrics` + `METRICS_PASS=<rand-hex 16>`,`systemctl restart`,`/api/metrics` 401 (no-auth) / 200 (basic auth) 都驗過。**順手揭露 deploy.yml server build/sync 盲點**(prod HEAD 卡 67 commits 落後 main、`server/dist/` 沒 metrics mount),手動 `git pull + npm install + build + db:migrate (0003+0004) + restart` 拉齊;**#983 已 land**(PR #984 + #985)— `deploy-server` job 接通 server git pull / npm ci / build / migration gated / restart / health gate + 失敗自動 rollback,server-before-client 鏈順序,first push-trigger run 25713242397 全綠 70s。**server-side PR 之後 push main 自動 deploy 到 prod**,不必手動 ssh
- [x] **CSRF / XSS audit** → #940 ✅
  0 currently exploitable。4 個 quick win:CSP header / Permissions-Policy / Origin middleware / `Content-Disposition` filename sanitize
- [x] **Test coverage 補** → #941 ✅
  3 必補:`AuthClient.deleteAccount()` 0 test / `GET /auth/github/callback` 整合 0 test / `DeleteAccountDialog` 元件 0 test
- [x] **Accessibility audit** → #939 ✅
  5 個 WCAG AA failures:`DeleteAccountDialog` 缺 dialog role + focus trap / `UserMenu` 缺 menu role + aria-haspopup / `Toolbar ↺` 缺 aria-label / `ViewerBanner` errors 缺 aria-live
- [ ] **decisions/log.md 整理** ⏭️ skip
  `.claude/decisions/log.md` 是 append-only(CLAUDE.md 明文規定);整理也屬 memory feedback「不主動 polish」範圍

## 🏗️ 規劃(沒實作,但要思考)

全進 #942 v0.1 backlog roadmap:

- [x] **v0.1 feature roadmap** → #942 ✅
  整合本節所有規劃題目
- [x] **GDPR 細部** → #942 G1 ✅
  30-day grace / soft delete / audit log / data retention policy / cookie consent banner
- [x] **Pricing model** → #942 B1 ✅
  quota enforcement(`users.storage_used` 欄位已預留)+ 配合 Phase F-1 Asset sync。Payment(Stripe / Lemon Squeezy)留 manual upgrade 路徑
- [ ] **產品定位** → #942 B2 ⬜
  landing page / onboarding flow / feature tour / sample scene gallery / "Try without sign in" CTA。需指揮家設計 input,本 session 不展開

---

## 統計

| 類 | ✅ 完成 | ⬜ 未開始 | ⏸️ deferred | ⏭️ skip |
|---|---:|---:|---:|---:|
| 🟢 收尾 | 4 | 0 | 1 | 0 |
| 🟡 中等 | 4 | 0 | 0 | 1 |
| 🔴 大 | 5 | 1 | 0 | 0 |
| 🩺 Quality | 4 | 0 | 0 | 1 |
| 🏗️ 規劃 | 3 | 1 | 0 | 0 |
| **總計** | **20** | **2** | **1** | **2** |

剩下 2 項未開始:**Magic link Phase C+D(F-5)** code 端 / **Multi-device e2e (F-3)** 需指揮家手測 + 規劃題 **產品定位**。F-1 Asset sync code-complete,等 Linode ops 落地。

## 本 session 開出 + 收掉的 issue

### Short batch(4 PR all merged)

| Issue | PR | 規模 | 狀態 |
|---|---|---|---|
| [#937](https://github.com/wolfuardian/erythos/issues/937) tech debt | #944 | 小 | ✅ merged(revert v0_to_v1 commit 後保 2/3 修)|
| [#939](https://github.com/wolfuardian/erythos/issues/939) a11y WCAG AA | #945 | 小-中 | ✅ merged |
| [#940](https://github.com/wolfuardian/erythos/issues/940) security hardening | #943 | 小 | ✅ merged |
| [#941](https://github.com/wolfuardian/erythos/issues/941) test coverage | #946 | 中 | ✅ merged |

### Mid batch(4 PR all merged)

| Issue | PR | 規模 | 狀態 |
|---|---|---|---|
| [#947](https://github.com/wolfuardian/erythos/issues/947) DB backup | #951 | 小-中 | ✅ merged |
| [#948](https://github.com/wolfuardian/erythos/issues/948) CI/CD auto-deploy | #952 | 中 | ✅ merged(install.md Phase 14 conflict resolved)|
| [#949](https://github.com/wolfuardian/erythos/issues/949) Observability | #953 | 中 | ✅ merged(.env.example + lockfile conflict resolved)|
| [#950](https://github.com/wolfuardian/erythos/issues/950) Performance | #954 | 中 | ✅ merged(Perf 0.62→0.94 / LCP 6.5s→2.6s)|

### 仍 open(全長期 backlog / brainstorm)

| # | 標題 | 性質 |
|---|---|---|
| [#938](https://github.com/wolfuardian/erythos/issues/938) | Phase F brainstorm — 6 候選 phase(F-1/F-3/F-5 仍未做)| brainstorm |
| [#942](https://github.com/wolfuardian/erythos/issues/942) | v0.1 backlog — 產品定位 / Audit log / GDPR 細部 | brainstorm |
| [#785](https://github.com/wolfuardian/erythos/issues/785) | Adopt NodeUUID + PrefabId brands | 長期 |
| [#783](https://github.com/wolfuardian/erythos/issues/783) | Adopt BlobURL brand on MeshComponent.url | 長期 |

本 session 共 close **21 issue**(11 stale + #912 GDPR + #935 + 4 short + 4 mid),open issue 從 16 → **4**。

## 下個 session 第一步

讀 `.claude/session/current.md` 交接筆記 + `git status` / `gh pr list` / `gh issue list` 重建現況。然後挑下個方向:

1. **Phase F-1 Asset sync** — spec 內最大缺口(scene blob 完了 binary 該上)。範圍大,可 split 多 sub-issue。
2. **Phase F-5 Magic link + Resend** — auth 第二條路徑,spec v0.1 加題。中等規模 1-2 週。
3. **Phase F-3 Multi-device e2e** — 已有後端,只缺真實 2-3 device 跑通 + conflict UX 收尾。需指揮家手動測。
4. **prod hardening 落地** — 2026-05-12 已落 4 / 4(只剩 #953):
   - ✅ #951 DB backup — Tokyo 3 `erythos-backups` bucket、`.env` S3 全填、`backup.sh` 從 github raw 抓進 prod、crontab `0 3 * * *` daily 排好(decisions log 2026-05-12 [ops])
   - ✅ F-1 asset bucket — Tokyo 3 `erythos-assets`、`S3_ASSETS_BUCKET` 補完、server restart、prod smoke 404(decisions log 2026-05-12 [phase-f])
   - ✅ #952 CI/CD — 3 secrets 設好(`SSH_PRIVATE_KEY` 用新生 ed25519 deploy key、`VPS_HOST` / `VPS_USER`),deploy.yml workflow_dispatch run `25711495857` 通 54s,push main 自動 deploy 路徑活化(decisions log 2026-05-12 [ops])
   - ✅ #980 deploy.yml 帶 `server/deploy/` 全目錄到 prod(PR #981 merged + CI 第一次 run sync 後 prod 5 檔齊)
   - ⬜ #953 Observability 需設 METRICS_USER / METRICS_PASS env

---

## 2026-05-12 session 補篇 — 7 issue batch land + F-5 D1 wire

main HEAD `c408a62`,prod live `https://erythos.eoswolf.com`(a4aa199 → c408a62 一輪 deploy 跑著)

### F-5 Phase C+D(magic link)

| | 標題 | PR | 狀態 |
|---|---|---|---|
| C1 | schema relax `users.github_id` nullable + migration 0005 | #987 + hotfix `4f19cf5` | ✅ merged + prod |
| C2 | endpoint + rate limit + stub email + 12 tests | #989 | ✅ merged + prod |
| D1 | client UI SignInDialog + AuthClient.requestMagicLink + AuthErrorBanner extend + 11 tests | #993 | ✅ merged + prod |
| C3 | Resend SDK + email template + replace stub | ⬜ 等指揮家 Resend account / DNS / key | not started |

C2 揭露 prod `.env` 漂移 4 條(ALLOWED_ORIGIN / S3_*)+ table ownership 1 條(magic_link_tokens 被 sudo postgres 建走 owner)— 全 ssh 修。

### Backlog batch(全 go — 6+1 並行 worktree)

| Issue | PR | Diff | 狀態 |
|---|---|---|---|
| [#988](https://github.com/wolfuardian/erythos/issues/988) deploy.yml migrate trap | #994 | +15/-1 | ✅ merged |
| [#991](https://github.com/wolfuardian/erythos/issues/991) Caddyfile XFF strip | #995 | +6/-1 | ✅ merged + prod Caddy synced + reload |
| [#986](https://github.com/wolfuardian/erythos/issues/986) drizzle 0003+0004 snapshot backfill | #996 | +1148/-1 | ✅ merged |
| [#937](https://github.com/wolfuardian/erythos/issues/937) tech debt v0_to_v1 single cast | #997 | +2/-1 | ✅ merged(audit drift — 2/3 sites 已修)|
| [#783](https://github.com/wolfuardian/erythos/issues/783) BlobURL brand SceneSync | #998 | +3/-3 | ✅ merged(audit drift — schema 已 refactor)|
| [#990](https://github.com/wolfuardian/erythos/issues/990) magic-link atomic UPDATE | #999 | +200/-47 | ✅ merged(4-phase pattern + 16 tests)|
| [#785](https://github.com/wolfuardian/erythos/issues/785) NodeUUID + PrefabId brands | #1000 | +9/-13 | ✅ merged(audit drift — ~95% 已 brand)|

派工:4 server/infra worktree 真並行(#986/#988/#990/#991)+ #783 / #937 同時並行 + #785 等 #783 merge 後派(SceneFormat.ts 衝突避開)。1 hour wall-clock 全 land + 全 close + prod deploy ok。

**Audit drift 教訓**:`#937 / #783 / #785` 三個 issue spec 全 outdated,實際 diff 比 spec 小 1-2 個數量級。AD dispatch prompt 必須含「Step 1 audit current state」段,別盲做 spec 範圍。

**ref ownership 教訓**:deploy.yml `sudo -u erythos git fetch` 失敗在 `Permission denied` cannot lock ref `fix/*` — root cause prod `.git/refs/remotes/origin/{fix,dependabot}` + 對應 logs 為 root-owned(早期 manual ssh debug 用 sudo 跑 git fetch 留下)。修法 `chown -R erythos:erythos` + rm stale `worktree-agent-*` refs。Decisions log 已記。後續可考慮 deploy.yml 加一步 defensive chown。

### 仍 open(不依賴本 session)

- [#938](https://github.com/wolfuardian/erythos/issues/938) Phase F brainstorm — 仍 open
- [#942](https://github.com/wolfuardian/erythos/issues/942) v0.1 backlog — 仍 open

### 下個 session 第一步候選

1. **F-5 C3 Resend SDK wire** — 等指揮家準備好 Resend account + DNS(SPF/DKIM/DMARC)+ key
2. **F-3 multi-device e2e** — 需指揮家手測
3. **B2 產品定位** — 需指揮家設計 input
4. **Deploy.yml defensive chown** — 防 ref ownership 再踩(小,~10 行,可順手)
5. **#938 / #942 brainstorm 落地** — 但 backlog 已大幅消化,可重新評估 priority

---

## 2026-05-13 F-5 結案 + F-3 audit batch

### F-5 Phase C+D 全 prod live + e2e 通過

| | PR | 內容 |
|---|---|---|
| C1 | #987 | schema relax `github_id` nullable |
| C2 | #989 | endpoint + rate limit + stub |
| C3 | #1002 | Resend SDK + email template + env-gated |
| D1 | #993 | SignInDialog + AuthClient.requestMagicLink + AuthErrorBanner extend |
| #990 | #999 | atomic UPDATE verify race fix |

**真實 e2e 通過(2026-05-13 02:30 UTC):** Resend ap-northeast-1 / SPF+DKIM+DMARC 全 verify / Gmail 主收件匣不進 spam / template 正確 / 點 link 302 + Set-Cookie 自動 sign in。TTL 15 分鐘 spec default 留著(replay protection 設計)。API key 換過一次(初次 leak in transcript 已 revoke)。

### F-3 audit batch land(7 issue 已收)

| Issue | PR | 規模 | 備註 |
|---|---|---|---|
| #988 | #994 | 15 行 | deploy.yml migrate trap |
| #991 | #995 | 6 行 | Caddyfile XFF strip + prod synced |
| #986 | #996 | 1148 行 | drizzle 0003+0004 snapshot backfill |
| #937 | #997 | 2 行 | tech debt v0_to_v1 single cast |
| #783 | #998 | 3 行 | BlobURL brand SceneSync |
| #990 | #999 | 200 行 | magic-link atomic UPDATE |
| #785 | #1000 | -4 行 | NodeUUID/PrefabId brand 5 sites cleanup |
| (新) | #1001 | 8 行 | deploy.yml defensive chown(防 ref ownership 漂移)|
| (新 F-3 audit) | #1003 | 698 行 | sync error handling 413/412/500/network 4 條 spec gap |

dependabot 7 PR(#965~#971)全 merged:dotenv 17 / @hono/node-server 2.x(2.3x perf)/ actions v7/v8 / better-auth patch / @types/three / vite 等。

### v0.1 release 剩餘 blocker

| | 內容 | 等什麼 |
|---|---|---|
| F-3 | multi-device 手測 e2e | 指揮家 2-3 device 跑(audit 已補 4 🔴 缺口)|
| B2 | 產品定位 / onboarding / landing | 指揮家設計 input |

### F-3 audit 可後補(指揮家手測中遇到再 file issue)

- 🟡 #5 同 device 多 tab 無協調(BroadcastChannel / Web Locks)
- 🟡 #6 currentUser 變化不 refresh scene list
- 🟢 #7 401/403 spec 文字 vs code drift(小 spec PR)

### 主 HEAD

`225f57e`(F-3 sync error handling)+ 後續 dependabot batch + #1001 chown + #1002 C3。

---

### F-3 audit 三條後續(2026-05-13 後段)

| 條 | 處理 | 備註 |
|---|---|---|
| 🟢 #7 401/403 spec drift | commit `1282330` | `docs/sync-protocol.md` 401/403 row 對齊 v0 anonymous(scenes endpoint 走 anonymous-or-owner pattern,401 不會在 v0 出現,403 改寫成「owner mismatch」)|
| 🟡 #6 currentUser invalidate scene list | ⏭️ skip(不適用)| Erythos 無 scene list UI,sign-in 走 302 hard reload,audit 條件描述的 SPA 場景在 Erythos 架構不存在 |
| 🟡 #5 多 tab BroadcastChannel/Web Locks | PR #1004 ✅ | `src/core/sync/MultiTabCoord.ts` 181 行,Factory + DI,Web Locks + BroadcastChannel,fallback 到 in-process FIFO mutex / no-op channel |

### F-5 reaper cron(prod robustness 加分)

| | PR | 內容 |
|---|---|---|
| reaper script + spec + install.md | #1005 | `server/deploy/reaper-magic-link-tokens.sh`(`expires_at < NOW() - INTERVAL '30 days'`)+ install.md Phase 15 + `docs/magic-link-spec.md § Token Lifecycle / Reaper` 30-day rationale + future pg_partman path |
| prod ops | ssh manual | `chmod +x` + `touch /var/log/erythos-reaper.log` + chown erythos + erythos user crontab `0 4 * * * /opt/erythos/server/deploy/reaper-magic-link-tokens.sh >> /var/log/erythos-reaper.log 2>&1` + 首次 dry-run 0 row(rows 都 < 1 天舊)|

decisions log `aa4ceb7` 已記。

### F-3 手測準備(指揮家 device 拿到後跑)

兩份 cheatsheet 寫在 `.claude/scratch/`(gitignored,janitor 14 天清):
- `f3-multi-device-checklist.md` — 6 場景:單 tab autosave / 多 tab 同 device / cross-device 412 / 413 payload / 500 network / sign in-out
- `f3-handtest-observability.md` — ssh prod `journalctl -u erythos-server -f` + 場景 ↔ log line 對照 + DB query + rollback 路徑

### v0.1 release 剩餘 blocker

| | 等什麼 |
|---|---|
| F-3 multi-device 手測 e2e | **指揮家** 2-3 device(audit 4 🔴 全補完,checklist + observability cheatsheet 已備好)|
| B2 產品定位 / onboarding / landing | **指揮家** 設計 input |

兩件都不是 AH 可代做,session 推進到此乾涸。下一步:`/handoff` 或等指揮家更新。

### 主 HEAD(本段結束時)

`aa4ceb7`(decisions log F-5 reaper 啟用)。v0.1.237 prod live。
