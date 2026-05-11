# 下一步 todo / 本 session 完成盤點

> **2026-05-11 session 收尾**
> 圖例:✅ 已完成 / ⬜ 未開始 / ⏸️ deferred / ⏭️ skip(有理由)/ 🟦 進行中
> main HEAD `1a96a7e` — Phase E + GDPR 全 land、build pass、prod live `https://erythos.eoswolf.com`

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

- [ ] **Asset sync** → Phase F-1,#938 ⬜
  spec `docs/asset-sync-protocol.md` R2 / S3 content-addressed。範圍大(server + client + dedup + GC + 配額)
- [ ] **Magic link + Resend** → Phase F-5,#938 ⬜
  spec v0.1 加題,Better Auth adapter 補齊
- [ ] **CI/CD pipeline** → Phase F-2,#938 ⬜
  GitHub Actions push → VPS 自動化,取代 manual scp + symlink flip
- [ ] **Multi-device e2e** → Phase F-3,#938 ⬜
  真 2-3 device 測 sync + conflict resolution UI + fork
- [x] **Performance / Lighthouse audit** ✅
  prod baseline 取得:**Perf 0.62 / A11y 0.89 / BP 0.93 / SEO 0.82**。LCP 6.5s(three.js 首載重)/ FCP 6.3s / TBT 0ms / CLS 0;total transfer 1095 KiB。raw `.claude/scratch/lighthouse-2026-05-11.json`(janitor 14 天清,要保留 mv 走)
- [ ] **DB backup + recovery** → #942 O2 ⬜
  Postgres pg_dump cron → Linode Object Storage,配合 Phase F-4 ops

## 🩺 Quality / hygiene(隨時)

- [ ] **Observability** → #938 F-4 + #942 O1 ⬜
  server structured logs(pino / hono logger)/ error alerting(Sentry or 自家 webhook)/ p95 latency dashboard
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
| 🔴 大 | 1 | 5 | 0 | 0 |
| 🩺 Quality | 3 | 1 | 0 | 1 |
| 🏗️ 規劃 | 3 | 1 | 0 | 0 |
| **總計** | **15** | **7** | **1** | **2** |

未完成的 7 項全部已建立 follow-up issue,不會掉。

## 本 session 新開 issue

| # | 標題 | 規模 |
|---|---|---|
| [#937](https://github.com/wolfuardian/erythos/issues/937) | tech debt:`bridge.ts` event types / `workspaceStore` migration / `v0_to_v1` cast | 小 |
| [#938](https://github.com/wolfuardian/erythos/issues/938) | Phase F brainstorm — 6 候選 phase | brainstorm |
| [#939](https://github.com/wolfuardian/erythos/issues/939) | a11y WCAG AA gaps — Dialog / UserMenu / Toolbar / ViewerBanner | 小-中 |
| [#940](https://github.com/wolfuardian/erythos/issues/940) | security hardening — CSP / Permissions-Policy / Origin check | 小 |
| [#941](https://github.com/wolfuardian/erythos/issues/941) | test coverage gaps — `deleteAccount` / OAuth callback / DeleteAccountDialog | 中 |
| [#942](https://github.com/wolfuardian/erythos/issues/942) | v0.1 backlog — GDPR 細部 / Audit log / Pricing / Observability / DB backup | brainstorm |

本 session 共 close 13 issue(11 stale + #912 + #935),open 6,淨 -7。

## 下個 session 第一步

讀 `.claude/session/current.md` 交接筆記 + `git status` / `gh pr list` / `gh issue list` 重建現況。然後挑下個方向:

1. **Phase F 主軸**(#938)— 預設建議 **F-1 Asset sync**(spec 內最大缺口)
2. **Quality 三連修**(#939 a11y + #940 security + #941 test)— 各一 PR、一週內可收
3. **v0.1 治理 backlog**(#942)— 從 **O2 DB backup**(prod 越久 risk 越大)或 **G2 Audit log**(治理基石)起手
