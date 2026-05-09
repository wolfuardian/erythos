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

第一次以 root SSH 進機器:

```bash
ssh root@139.162.101.231
```

更新系統 + 建非 root user + 關掉 root SSH login:

```bash
apt update && apt upgrade -y

adduser erythos
usermod -aG sudo erythos

# 把 root 的 authorized_keys 複製給 erythos(假設 ssh key 已用 root 連上)
mkdir -p /home/erythos/.ssh
cp /root/.ssh/authorized_keys /home/erythos/.ssh/authorized_keys
chown -R erythos:erythos /home/erythos/.ssh
chmod 700 /home/erythos/.ssh
chmod 600 /home/erythos/.ssh/authorized_keys

# 關掉 root SSH 登入 + password 登入
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh
```

**驗證**:**先別斷線 root**,另開一個 terminal 試 `ssh erythos@139.162.101.231` 通,再關 root session。

UFW firewall:

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
- **Authorization callback URL**: `https://erythos.eoswolf.com/auth/github/callback`
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

OAuth flow:**瀏覽器**開 `https://erythos.eoswolf.com/auth/github/start`,應跳到 GitHub 授權頁。授權後跳回 `/`(會 404 — 預期,前端尚未 deploy),但 cookie 已 set。再開 `https://erythos.eoswolf.com/auth/me`,應回 200 + user 資料。

## 維運速查

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

## 下一步(Phase D D6 / Phase E)

- client `HttpSyncEngine` 的 `baseUrl` 設 `https://erythos.eoswolf.com`
- 跑端到端 smoke:client signin → create scene → reload → 看到 scene
