# Erythos sync server — Linode deployment

從 fresh Ubuntu 24.04 LTS 到 sync server 跑起來的 step-by-step。對應 spec § 25 / § 80–82 / § 363 (Phase D D5)。

> **Target**: single-VPS — Postgres + Node (Hono) + Caddy 同機跑,TLS 由 Caddy 終止後反向代理到 `localhost:3000`。
>
> **Why Caddy not nginx**: 實機部署時(D5b,2026-05-09)host 已 co-locate 既有 Caddy + 其他服務,改用 Caddy 避免反代搶 80/443。Caddy auto-HTTPS 比 certbot --standalone 路線少維護(無 systemd timer,renewal 由 Caddy daemon 自處)。
>
> **Domain note**: 本檔以 `erythos.eoswolf.com` 為例。日後若改 domain(例如買 `erythos.app`),需改:① `Caddyfile.example` site block 的 host 行 ② GitHub OAuth app 的 callback URL ③ client `HttpSyncEngine` 的 `baseUrl`。

## Prereqs(在動手 ssh 前)

- [ ] Linode VPS 已開機(本例:Tokyo 4GB Nanode,IP `139.162.101.231`,Ubuntu 24.04 LTS)
- [ ] DNS A record 已加(Cloudflare):`erythos.eoswolf.com → 139.162.101.231`,proxy = **DNS only(grey cloud)** — Caddy ACME HTTP-01 challenge 需直連 origin;orange proxy 還會壞 OAuth cookie domain
- [ ] DNS 已生效:`dig +short erythos.eoswolf.com` 回 `139.162.101.231`(Windows 用 `nslookup` 也行)
- [ ] 本機 SSH key 已上傳到 Linode(開機時可在 dashboard 選,或之後 `ssh-copy-id`)
- [ ] GitHub OAuth app 暫時不必先建 — 上線後再去 `https://github.com/settings/developers` 建,callback 才知道完整 URL

## Phase 1 — Initial system hardening

> **PowerShell ssh paste 地雷**:在 PowerShell terminal 裡用 ssh 連進 VPS 時,**不要一次把多行命令全部貼入**。PowerShell 會把換行折疊成一行,或讓互動命令(如 `adduser`)把後面幾行當 stdin 答 prompt,造成 user 建不起來、ssh key 沒設、sshd config 沒改的連環錯。**以下每個 code block 逐步 paste,等上一段執行完再貼下一段。**

第一次以 root SSH 進機器:

```bash
ssh root@139.162.101.231
```

### 步驟 1-a:更新系統套件

```bash
apt update && apt upgrade -y
```

### 步驟 1-b:建非 root user

`adduser --disabled-password` 不進密碼 prompt,直接建好 user;再用 `passwd` 單獨設密碼(兩次輸入)。**這兩條分開跑,等每條執行完再貼下一條。**

```bash
adduser --disabled-password --gecos '' erythos
```

```bash
passwd erythos
```

`passwd` 會進互動 prompt,輸入新密碼兩次後自動結束,然後再繼續:

```bash
usermod -aG sudo erythos
```

### 步驟 1-c:複製 SSH authorized_keys 給 erythos

> **以下 5 條逐條 paste,別一次黏。** PowerShell ssh paste 會把多行黏成一行,第一條還沒跑完第二條就進去,`chown` 可能在 `mkdir` 之前執行而失敗。每條等 prompt 回來再貼下一條。

```bash
mkdir -p /home/erythos/.ssh
```

```bash
cp /root/.ssh/authorized_keys /home/erythos/.ssh/authorized_keys
```

```bash
chown -R erythos:erythos /home/erythos/.ssh
```

```bash
chmod 700 /home/erythos/.ssh
```

```bash
chmod 600 /home/erythos/.ssh/authorized_keys
```

### 步驟 1-d:關掉 root SSH 登入 + password 登入

> **這兩條 sed 也要逐條 paste。** 改完後 reload sshd,**先別關 root session**,另開 terminal 驗 `erythos` user 能進才繼續,否則把自己關在外面。

```bash
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
```

```bash
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
```

```bash
systemctl reload ssh
```

**驗證**:**先別斷線 root**,另開一個 terminal 試 `ssh erythos@139.162.101.231` 通,再關 root session。確認可用 key 登入後才繼續往下。

### 步驟 1-e:UFW firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'WWW Full'   # 80 + 443(Caddy 用同一組 port)
ufw enable
ufw status
```

往下命令以 `erythos` user 執行(`sudo` 提權必要時)。

```bash
ssh erythos@139.162.101.231
```

## Phase 2 — Install Node 22 LTS

NodeSource APT repo:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # 應印 v22.x
npm --version
```

## Phase 3 — Install Postgres 16

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -P pager=off -c "SELECT version();"
```

> **psql `-P pager=off`**:psql 在 tty 模式會自動丟 less pager,在 ssh paste 多條命令時 pager 卡住會吞掉後面的指令。一律加 `-P pager=off`(或 `export PAGER=cat`)。

建 db + 角色:

```bash
# 產一個強密碼存著(用 hex 不用 base64 —
# base64 含 / + = 三個需要 URL encode 的字元,寫進 DATABASE_URL 容易出錯)
DB_PASS=$(openssl rand -hex 24)
echo "DB password: $DB_PASS"   # 記下,等下要填 .env

sudo -u postgres psql -P pager=off -c "CREATE ROLE erythos WITH LOGIN PASSWORD '$DB_PASS';"
sudo -u postgres psql -P pager=off -c "CREATE DATABASE erythos OWNER erythos;"
sudo -u postgres psql -P pager=off -c "GRANT ALL PRIVILEGES ON DATABASE erythos TO erythos;"
```

> **為什麼分三條而不 heredoc**:PowerShell ssh client 會在 paste 的每行加 leading 兩格空白,讓 heredoc `EOF` terminator 不被 bash 認得,bash 卡在 PS2(`>` prompt)。三條獨立 `-c` 指令最穩。

驗證:

```bash
psql -U erythos -h localhost -d erythos -P pager=off -c '\dt'
```

(空 db,無表是預期。)

## Phase 4 — Install Caddy(若 host 還沒裝)

```bash
# 先確認有沒有
which caddy && caddy version    # 已有就跳過本 phase

# 沒有的話裝(Cloudsmith 官方 repo):
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
sudo systemctl enable --now caddy
```

驗證:

```bash
systemctl status caddy --no-pager
curl -I http://localhost      # 應回 Caddy 的 default 200 / 404
```

## Phase 5 — Clone repo + build server

```bash
# 部署位置 /opt/erythos
sudo mkdir -p /opt/erythos
sudo chown erythos:erythos /opt/erythos
cd /opt/erythos
git clone https://github.com/wolfuardian/erythos.git .

# monorepo workspaces 一起裝
npm install

# 編譯 server
npm run -w server build
ls server/dist/index.js   # 應存在
```

## Phase 6 — Configure `.env`

```bash
cp server/.env.example server/.env
chmod 600 server/.env
nano server/.env
```

填入:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://erythos:<上一步存的 DB_PASS>@localhost:5432/erythos
GITHUB_CLIENT_ID=         # Phase 8 取得後填
GITHUB_CLIENT_SECRET=     # Phase 8 取得後填
SESSION_SECRET=           # 跑 `openssl rand -hex 32` 產 64-char 填入
```

產 SESSION_SECRET:

```bash
openssl rand -hex 32
```

## Phase 7 — Run DB migration

```bash
cd /opt/erythos
npm run -w server db:migrate
sudo -u postgres psql -d erythos -P pager=off -c '\dt'   # 應看到 users / sessions / scenes / scene_versions
```

## Phase 8 — Configure GitHub OAuth app

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

- **Application name**: `Erythos sync server`
- **Homepage URL**: `https://erythos.eoswolf.com`
- **Authorization callback URL**: `https://erythos.eoswolf.com/api/auth/github/callback`
- **Enable Device Flow**: 不勾(我們用 web auth code 流程)

建好後拿到 `Client ID` 與 `Client secret`,回到 VPS 填進 `/opt/erythos/server/.env`:

```bash
sudo -u erythos nano /opt/erythos/server/.env
```

## Phase 9 — Append Caddyfile site block

```bash
# 看現況
sudo cat /etc/caddy/Caddyfile

# 用 nano 在末尾 append site block(內容見 server/deploy/Caddyfile.example)
sudo nano /etc/caddy/Caddyfile
```

> **為什麼用 nano 而不 heredoc append**:同 Phase 3 的 PowerShell ssh paste indent 問題。`sudo tee -a /etc/caddy/Caddyfile <<EOF ... EOF` 在 paste 時 EOF 行常被 indent 兩格,bash 卡死。nano 編輯最穩。

把 `server/deploy/Caddyfile.example` 的內容貼進 Caddyfile 末尾。儲存後格式化 + 驗證 + reload:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

> Caddy 會在第一次有人對 `erythos.eoswolf.com` 發請求時 auto-issue Let's Encrypt cert(stored at `/var/lib/caddy/.local/share/caddy/`)。約 30 天前自動 renew,daemon 內建,無需 systemd timer 或 hook。

## Phase 10 — Install systemd unit + start server

```bash
sudo cp /opt/erythos/server/deploy/erythos-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now erythos-server
sudo systemctl status erythos-server --no-pager
```

看 log:

```bash
journalctl -u erythos-server -f
# 應看到 "Server listening on http://localhost:3000"
```

## Phase 11 — Smoke test

```bash
# 在 VPS 上(直連 Node):
curl http://localhost:3000/health        # {"status":"ok"}

# 在 VPS 上(過 Caddy):
curl https://erythos.eoswolf.com/health  # {"status":"ok"}

# 在本機(過公網 + DNS):
curl https://erythos.eoswolf.com/health
```

OAuth flow(完整 e2e 需先跑 Phase 12 部 client SPA;Phase 11 階段只驗 server endpoint):

```bash
# server-only smoke:
curl -I --ssl-no-revoke https://erythos.eoswolf.com/api/auth/github/start   # 應回 302 → github.com/login/oauth/authorize
curl -i --ssl-no-revoke https://erythos.eoswolf.com/api/auth/me              # 無 cookie → 401(預期)
```

**瀏覽器**開 `https://erythos.eoswolf.com/api/auth/github/start`,應跳 GitHub 授權頁。若還沒部 client(Phase 12 未跑),授權後 server 302 回 `/` 會看到 Caddy 預設 404 — 這是預期的,需要 Phase 12 把 client SPA 接上才看得到 UI。cookie 仍會 set,可直接 curl `/api/auth/me` 驗到 200 + user 資料。

## Phase 12 — Deploy client SPA

Server 跑通後(Phase 11 smoke pass)部 client。Caddyfile.example 已含 `handle /api/*` → reverse_proxy + `handle` SPA fallback,Caddy 把 root + non-API path serve `dist/index.html`,client router 接手 `/scenes/:id` 等 SPA route。

### 步驟 12-a:第一次部署準備(只跑一次)

```bash
ssh erythos@139.162.101.231
sudo mkdir -p /opt/erythos/client/releases
sudo chown -R erythos:erythos /opt/erythos/client
exit
```

### 步驟 12-b:本機 build

```bash
# 本地專案根(不在 VPS 上)
cd /path/to/erythos
npm install
npm run build
ls dist/        # 應有 index.html + assets/ 等
```

> 若 client 連的 server domain 不是 `erythos.eoswolf.com`,build 前設 env(注意 **必須含 `/api`**):
>
> ```bash
> VITE_SYNC_BASE_URL=https://your-host/api npm run build
> ```

### 步驟 12-c:rsync 上 VPS + atomic symlink flip

```bash
# 本機 — timestamp 標 release
RELEASE=$(date +%Y%m%d-%H%M%S)

ssh erythos@139.162.101.231 "mkdir -p /opt/erythos/client/releases/$RELEASE"
rsync -avz --delete dist/ erythos@139.162.101.231:/opt/erythos/client/releases/$RELEASE/

# 原子切換 symlink — 瀏覽器拿到的是完整舊版或完整新版,絕不半新半舊
ssh erythos@139.162.101.231 "ln -snf releases/$RELEASE /opt/erythos/client/current"
```

> **為什麼 atomic swap**:rsync 上傳途中 Caddy 仍在 serve 舊版檔案。`ln -snf` 是原子 syscall,Caddy 下個 request 就指向新版,中間沒有「半新半舊」視窗。
>
> **保留舊 release 多久**:預設留 5 個 release,手動清:
>
> ```bash
> ssh erythos@139.162.101.231 'cd /opt/erythos/client/releases && ls -t | tail -n +6 | xargs -r rm -rf'
> ```

### 步驟 12-d:Caddy reload(只在 Caddyfile 改過才需要)

```bash
ssh erythos@139.162.101.231 "sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy"
```

第一次部 client 時,Caddyfile 還沒含 SPA fallback block,須先把 `server/deploy/Caddyfile.example` 內新版 site block 貼進 `/etc/caddy/Caddyfile` 後 reload。

### 步驟 12-e:GitHub OAuth callback URL 對齊 `/api` prefix

E7-1 後 server endpoint 全在 `/api/` 下,GitHub OAuth App callback URL 必須改:

GitHub → Settings → Developer settings → OAuth Apps → Erythos sync server → **Authorization callback URL** 改成:

```
https://erythos.eoswolf.com/api/auth/github/callback
```

存檔。下一次 sign in 會用新 callback URL。

### 步驟 12-f:完整 e2e smoke

瀏覽器開 `https://erythos.eoswolf.com/`(根),應看到 Erythos UI(Welcome panel)。Toolbar 右側點 `Sign in` → GitHub 授權頁 → 跳回 `/` → Toolbar 出現 user avatar chip + dropdown。

兩瀏覽器(隔離 / 私密模式)各別 sign in 同帳號:在 A 建 scene → reload → B 開同 scene URL → 看到內容。

## 維運速查

### 更新 client(部新 release)

```bash
# 本機
cd /path/to/erythos
git pull
npm install
npm run build

# 上傳 + symlink flip(同 Phase 12-c)
RELEASE=$(date +%Y%m%d-%H%M%S)
ssh erythos@139.162.101.231 "mkdir -p /opt/erythos/client/releases/$RELEASE"
rsync -avz --delete dist/ erythos@139.162.101.231:/opt/erythos/client/releases/$RELEASE/
ssh erythos@139.162.101.231 "ln -snf releases/$RELEASE /opt/erythos/client/current"
```

不必 reload Caddy(它讀 symlink path,內容換了就換)。

### 更新 server code

```bash
cd /opt/erythos
git pull
npm install
npm run -w server build
sudo systemctl restart erythos-server
```

### 改 .env(改後必須重啟)

```bash
sudo -u erythos nano /opt/erythos/server/.env
sudo systemctl restart erythos-server
```

### 查 log

```bash
journalctl -u erythos-server -n 100        # server log
journalctl -u caddy -n 100                 # Caddy log(包括 ACME / TLS / proxy 錯誤)
```

> Caddy 預設把所有 log 寫進 systemd journal,`journalctl -u caddy` 直接看。若要分檔 access log,在 site block 內加 `log { output file /var/log/caddy/access.log }` 後 reload。

### 跑 migration

```bash
cd /opt/erythos
npm run -w server db:migrate
```

### 強制 cert renewal(測試用)

```bash
sudo systemctl reload caddy
journalctl -u caddy -n 50    # 看 renewal 行為
```

## Troubleshooting

| 症狀 | 排查 |
|------|------|
| `curl https://...` connection refused | Caddy 沒跑 / firewall 擋住 443:`sudo systemctl status caddy`、`sudo ufw status` |
| `502 Bad Gateway` | Node 沒跑:`sudo systemctl status erythos-server`、`journalctl -u erythos-server -n 50` |
| OAuth callback 跳到 `?auth_error=invalid_state` | 8 分鐘以上沒完成授權(state TTL = 10 min)/ cookie 被擋:檢查 Cloudflare proxy 是否誤開 / browser 有沒有設不接受 third-party cookie |
| Caddy 沒 issue cert | DNS 還沒 propagate / 80 port 被別的東西占住:`sudo lsof -i :80`、`dig +short erythos.eoswolf.com`;`journalctl -u caddy -n 100` 看 ACME 錯誤(常見 `no IP returned`、`HTTP-01 challenge timeout`) |
| Node 啟動報 `SESSION_SECRET is not set` | `.env` 沒填 / systemd 找不到 EnvironmentFile:`sudo cat /opt/erythos/server/.env`、檢查 `EnvironmentFile=` 路徑對不對 |
| `npm run -w server db:migrate` 噴 `password authentication failed` | DATABASE_URL 密碼不對 / 含特殊字元未 URL-encode:用 `psql "$DATABASE_URL"` 直接驗 |
| Cloudflare 改成 orange cloud 後 OAuth 流壞掉 | CF proxy 會改 cookie domain / 加自家 cookies,還會擋 ACME。回到 grey cloud 即可 |
| psql 命令好像「卡住」吃不到下一條 | psql 在 tty 模式進了 less pager(`(END)` 字樣),按 `q` 退出。後續一律加 `-P pager=off` |
| `ssh erythos@host` prompt 要密碼 | public key 沒通:authorized_keys 沒建、perm 錯、或 PasswordAuthentication 已關。LISH 內 `ls -la /home/erythos/.ssh` 確認檔案存在 + perm 700/600 |
| `sudo` prompt 要密碼(且不知道密碼) | user 沒設密碼又沒加 NOPASSWD。LISH 內用 root 跑 `passwd erythos` 設密碼,或 `visudo` 加 NOPASSWD 行 |
| `bash -s` 收到亂碼 + `\r: command not found` | 在 PowerShell 用 `Get-Content \| ssh` 傳了 CRLF。改用 git-bash:`ssh user@host 'bash -s' < script.sh`,或見下方「LF/CRLF 雷」節 |

## 推 script 上 host 的 LF/CRLF 雷

**症狀**:在 PowerShell 跑 `Get-Content script.sh | ssh user@host 'bash -s'`,遠端 bash 看到 `\r` 符號,噴 `$'\r': command not found` 或中文亂碼。

**根因**:`Get-Content` 預設以 UTF-16 讀檔後逐行重新加 CRLF(`\r\n`)再丟 stdin;bash 看到行尾 `\r` 視為合法字元而不是分隔符,整行命令名字變成 `command\r` — 找不到。

**三種解**:

**推薦 — git-bash 直接傳(最乾淨)**

git-bash 的 stdin redirection 不動換行:

```bash
# 在 git-bash 裡跑(不是 PowerShell):
ssh user@host 'bash -s' < script.sh
```

**PowerShell — `[IO.File]::ReadAllText` 強制 LF**

```powershell
[IO.File]::ReadAllText('script.sh').Replace("`r`n","`n") | ssh user@host 'bash -s'
```

> `ReadAllText` 讀原始 bytes 後交由 .NET 解 encoding;`Replace` 把 CRLF 換成 LF;stdin 給 ssh 的是純 LF 文字流。

**PowerShell — `-Raw` + Replace(一行版)**

```powershell
Get-Content script.sh -Raw | ForEach-Object { $_.Replace("`r`n","`n") } | ssh user@host 'bash -s'
```

> `-Raw` 把整個檔案當一個字串讀(不逐行),再統一換行。比 `Get-Content`(逐行)穩,但仍不如 `[IO.File]::ReadAllText` 直覺。

## 救援篇 — Linode LISH

**適用場景**:ssh 進不去、sudo 沒設好、authorized_keys 沒建、sshd 鎖太死把自己關在外面、任何 Phase 1 錯誤導致普通 ssh 路徑不通。

### 怎麼進 LISH

Linode Cloud Manager → 左側導覽點該 Linode → 右上角 **"Launch LISH Console"** 按鈕 → 瀏覽器彈出視窗,直接以 root 登入(等同實體 tty)。

> **LISH 也有 paste 雷**:同樣是瀏覽器 terminal,多行一次 paste 也會串行亂掉。**以下救援命令也要逐條 paste,等提示符回來再貼下一條。**

### 常見救援操作

#### 設 NOPASSWD sudoers(讓 erythos 不用密碼 sudo)

```bash
echo 'erythos ALL=(ALL) NOPASSWD:ALL' | tee /etc/sudoers.d/erythos
```

```bash
chmod 440 /etc/sudoers.d/erythos
```

```bash
visudo -c
```

`visudo -c` 回 `parsed OK` 才算生效。

#### 補 SSH authorized_keys

```bash
mkdir -p /home/erythos/.ssh
```

```bash
cp /root/.ssh/authorized_keys /home/erythos/.ssh/authorized_keys
```

```bash
chown -R erythos:erythos /home/erythos/.ssh
```

```bash
chmod 700 /home/erythos/.ssh
```

```bash
chmod 600 /home/erythos/.ssh/authorized_keys
```

補完後在本機試 `ssh erythos@<ip>`,應可用 key 進。

#### 重設 erythos 密碼

```bash
passwd erythos
```

互動輸入新密碼兩次。若 sshd 的 `PasswordAuthentication no` 已生效,設密碼僅供 LISH 本地登入用,ssh 仍需 key。

#### 驗 sshd_config 是否生效

```bash
grep -E '^(PermitRootLogin|PasswordAuthentication)' /etc/ssh/sshd_config
```

若上面 sed 沒生效(顯示帶 `#` 或原值),手動改:

```bash
nano /etc/ssh/sshd_config
```

找到 `PermitRootLogin` / `PasswordAuthentication` 行,去掉 `#`,改成 `no`。存檔後:

```bash
systemctl reload ssh
```

## 下一步(Phase E 收尾)

- client `defaultBaseUrl()` 在 prod build 自動指 `https://erythos.eoswolf.com/api`(E7-2 已寫死,無需手動設 env)
- 跑完 Phase 12 client deploy 後,**Phase 12-f** 完整 e2e smoke 才算 Phase E 收尾
