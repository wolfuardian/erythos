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
  spec `docs/asset-sync-protocol.md`(2026-05-12 補完 scene asset URL 欄位 §,PR #976 / closes #975)。✅ F-1a S3 module #960 + ✅ F-1b schema + migration #961 + ✅ F-1c endpoints #962 + ✅ F-1d-1 HttpAssetClient + AssetResolver cache #963 + ✅ F-1d-2a Wire HttpAssetClient → Editor #964 + ✅ F-1d-2c Quota UI #972 + ✅ F-1d-2b Upload binaries pre-push hook + URL rewrite #973(QC PASS,dragon)。778/778 tests + build pass。✅ Ops:Linode `erythos-assets` bucket Tokyo 3、access key 共用 backup 那把、`.env` 補 `S3_ASSETS_BUCKET=erythos-assets`、server restart、prod smoke `curl https://erythos.eoswolf.com/api/assets/<zero-hash>` 回 404(預期)。Follow-up 全 closed:✅ #974 v1_to_v2 hash-form guard (PR #978,QC PASS) / ✅ #975 closed by PR #976。可選後續:`uploadSceneBinaries.ts` 改回 `serialize()/deserialize()` round-trip(workaround → 直接路徑),scope creep 獨立排
- [ ] **Magic link + Resend** → Phase F-5,#938 / spec #955 / skeleton #956 🟦 Phase A+B 已完成
  ✅ `docs/magic-link-spec.md`(230 行 15 章節,PR #958 merged)+ ✅ `server/src/auth/magic-link.ts` unwired stub + schema + migration 0003(PR #959 merged)。**剩 Phase C** Resend SDK wire + endpoint mount + rate limit + `github_id nullable` migration + **Phase D** client UI(`auth_error` banner reuse E4 pattern)
- [x] **CI/CD pipeline** → #948 / PR #952 ✅
  GitHub Actions `deploy.yml` push main → VPS scp + atomic symlink flip + 自動 prune > 5 release。install.md Phase 14 含 SSH key + secrets setup 步驟。Prod 啟用前先設 SSH_PRIVATE_KEY / VPS_HOST / VPS_USER 三個 secret
- [ ] **Multi-device e2e** → Phase F-3,#938 ⬜
  真 2-3 device 測 sync + conflict resolution UI + fork
- [x] **Performance / Lighthouse audit** → #950 / PR #954 ✅
  baseline **Perf 0.62 / LCP 6.5s** → after **Perf 0.94 / LCP 2.6s**(超目標)。透過 bundle visualizer + 移 `MathUtils` import + 拆 chunk。Full three.js dynamic import 留 follow-up(Editor 同步 contract 需 refactor)
- [x] **DB backup + recovery** → #947 / PR #951 ✅ + prod deploy 2026-05-12 ✅
  daily pg_dump → Linode Object Storage(`backup.sh` + crontab `0 3 * * *`)+ `restore.md` stream-restore。Prod ops 已落地:Tokyo 3 bucket `erythos-backups`,`.env` 設好,manual 試跑 OK,cron 已排。Doc 補:`S3_ENDPOINT` region-only 格式(非 virtual-hosted)+ AWS CLI v2.34 checksum workaround(refs decisions log 2026-05-12)

## 🩺 Quality / hygiene(隨時)

- [x] **Observability** → #949 / PR #953 ✅
  pino structured logger(JSON prod / pretty dev)+ `GET /api/metrics`(in-memory counters + basic auth)+ `/health` DB connectivity check(degraded 仍回 200,給 uptime monitor 讀 body)+ `app.onError` 全局 handler + process unhandledRejection/uncaughtException sink。Prod 啟用前先設 METRICS_USER / METRICS_PASS
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
4. **prod hardening 落地** — 2026-05-12 已落 2 / 4:
   - ✅ #951 DB backup — Tokyo 3 `erythos-backups` bucket、`.env` S3 全填、`backup.sh` 從 github raw 抓進 prod、crontab `0 3 * * *` daily 排好(decisions log 2026-05-12 [ops])
   - ✅ F-1 asset bucket — Tokyo 3 `erythos-assets`、`S3_ASSETS_BUCKET` 補完、server restart、prod smoke 404(decisions log 2026-05-12 [phase-f])
   - ⬜ #952 CI/CD 需設 SSH_PRIVATE_KEY / VPS_HOST / VPS_USER GitHub secrets(deploy.yml 也未自帶 `server/deploy/` 全目錄 → follow-up)
   - ⬜ #953 Observability 需設 METRICS_USER / METRICS_PASS env
