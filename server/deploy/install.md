# Erythos sync server — Linode deployment

從 fresh Ubuntu 24.04 LTS 到 sync server 跑起來的 step-by-step。對應 spec § 25 / § 80–82 / § 363 (Phase D D5)。

> **Target**: single-VPS — Postgres + Node (Hono) + nginx 同機跑,TLS 由 nginx 終止後反向代理到 `localhost:3000`。
>
> **Domain note**: 本檔以 `erythos.eoswolf.com` 為例。日後若改 domain(例如買 `erythos.app`),需改:① `nginx.conf` 的兩個 `server_name` ② certbot 命令 ③ GitHub OAuth app 的 callback URL ④ client `HttpSyncEngine` 的 `baseUrl`。

## Prereqs(在動手 ssh 前)

- [ ] Linode VPS 已開機(本例:Tokyo 4GB Nanode,IP `139.162.101.231`,Ubuntu 24.04 LTS)
- [ ] DNS A record 已加(Cloudflare):`erythos.eoswolf.com → 139.162.101.231`,proxy = **DNS only(grey cloud)** — certbot HTTP-01 challenge 需直連 origin
- [ ] DNS 已生效:`dig +short erythos.eoswolf.com` 回 `139.162.101.231`
- [ ] 本機 SSH key 已上傳到 Linode(開機時可在 dashboard 選,或之後 `ssh-copy-id`)
- [ ] GitHub OAuth app 暫時不必先建 — cert 拿到後再去 `https://github.com/settings/developers` 建,callback 才知道完整 URL

## Phase 1 — Initial system hardening

第一次以 root SSH 進機器:

```bash
ssh root@139.162.101.231
```

更新系統 + 建非 root user + 關掉 root SSH login:

```bash
# 更新
apt update && apt upgrade -y

# 建非 root user(密碼下一行設)
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
ufw allow 'Nginx Full'   # 80 + 443
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
sudo -u postgres psql -c "SELECT version();"
```

建 db + 角色:

```bash
# 產一個強密碼存著:
DB_PASS=$(openssl rand -base64 24)
echo "DB password: $DB_PASS"   # 記下,等下要填 .env

sudo -u postgres psql <<EOF
CREATE ROLE erythos WITH LOGIN PASSWORD '$DB_PASS';
CREATE DATABASE erythos OWNER erythos;
GRANT ALL PRIVILEGES ON DATABASE erythos TO erythos;
EOF
```

驗證:`psql -U erythos -h localhost -d erythos -c '\\dt'`(空 db,無表是預期)。

## Phase 4 — Install nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
curl -I http://localhost   # 應印 nginx default 200
```

## Phase 5 — Clone repo + build server

```bash
# 部署位置 /opt/erythos
sudo mkdir -p /opt/erythos
sudo chown erythos:erythos /opt/erythos
cd /opt/erythos
git clone https://github.com/wolfuardian/erythos.git .

# 安裝依賴(monorepo workspaces 一起裝)
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
GITHUB_CLIENT_ID=         # Phase 9 取得後填
GITHUB_CLIENT_SECRET=     # Phase 9 取得後填
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
sudo -u postgres psql -d erythos -c '\\dt'   # 應看到 users / sessions / scenes / scene_versions
```

## Phase 8 — Issue TLS certificate

裝 certbot:

```bash
sudo apt install -y certbot
```

用 standalone 模式 issue cert(certbot 自起 80 port,因此先暫停 nginx):

```bash
sudo systemctl stop nginx
sudo certbot certonly --standalone \
  -d erythos.eoswolf.com \
  --non-interactive --agree-tos --email <你的 email>
sudo systemctl start nginx
```

驗證 cert 已 issue:

```bash
sudo ls /etc/letsencrypt/live/erythos.eoswolf.com/
# 應看到 fullchain.pem privkey.pem cert.pem chain.pem
```

certbot 已自動安裝 `certbot.timer`,會每天嘗試 renewal:

```bash
systemctl list-timers | grep certbot
```

renewal hook(reload nginx):

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

## Phase 9 — Configure GitHub OAuth app

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

- **Application name**: `Erythos sync server`
- **Homepage URL**: `https://erythos.eoswolf.com`
- **Authorization callback URL**: `https://erythos.eoswolf.com/auth/github/callback`

建好後拿到 `Client ID` 與 `Client secret`,回到 VPS 填進 `/opt/erythos/server/.env`:

```bash
sudo -u erythos nano /opt/erythos/server/.env
```

## Phase 10 — Enable nginx config

```bash
sudo cp /opt/erythos/server/deploy/nginx.conf /etc/nginx/sites-available/erythos.eoswolf.com
sudo ln -sf /etc/nginx/sites-available/erythos.eoswolf.com /etc/nginx/sites-enabled/erythos.eoswolf.com

# 移除預設 default site(避免搶 server_name 預設)
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t          # syntax check
sudo systemctl reload nginx
```

## Phase 11 — Install systemd unit + start server

```bash
sudo cp /opt/erythos/server/deploy/erythos-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now erythos-server
sudo systemctl status erythos-server
```

看 log:

```bash
journalctl -u erythos-server -f
# 應看到 "Server listening on http://localhost:3000"
```

## Phase 12 — Smoke test

```bash
# 在 VPS 上(直連 Node):
curl http://localhost:3000/health        # {"status":"ok"}

# 在 VPS 上(過 nginx):
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
sudo tail -f /var/log/nginx/erythos.access.log
sudo tail -f /var/log/nginx/erythos.error.log
```

### 跑 migration

```bash
cd /opt/erythos
npm run -w server db:migrate
```

### 強制 cert renewal(測試用)

```bash
sudo certbot renew --dry-run
```

## Troubleshooting

| 症狀 | 排查 |
|------|------|
| `curl https://...` connection refused | nginx 沒跑 / firewall 擋住 443:`sudo systemctl status nginx`、`sudo ufw status` |
| `502 Bad Gateway` | Node 沒跑:`sudo systemctl status erythos-server`、`journalctl -u erythos-server -n 50` |
| OAuth callback 跳到 `?auth_error=invalid_state` | 8 分鐘以上沒完成授權(state TTL = 10 min)/ cookie 被擋:檢查 Cloudflare proxy 是否誤開 / browser 有沒有設不接受 third-party cookie |
| `certbot --standalone` 失敗 `Connection refused` | DNS 還沒 propagate / 80 port 被別的東西占住:`sudo lsof -i :80`、再 `dig +short erythos.eoswolf.com` 確認回對 IP |
| Node 啟動報 `SESSION_SECRET is not set` | `.env` 沒填 / systemd 找不到 EnvironmentFile:`sudo cat /opt/erythos/server/.env`、檢查 `EnvironmentFile=` 路徑對不對 |
| `npm run -w server db:migrate` 噴 `password authentication failed` | DATABASE_URL 密碼不對 / 含特殊字元未 URL-encode:用 `psql "$DATABASE_URL"` 直接驗 |
| Cloudflare 改成 orange cloud 後 OAuth 流壞掉 | CF proxy 會改 cookie domain / 加自家 cookies。回到 grey cloud 即可,或精細設定 CF page rules |

## 下一步(Phase E)

- client `HttpSyncEngine` 的 `baseUrl` 設 `https://erythos.eoswolf.com`
- 跑端到端 smoke:client signin → create scene → reload → 看到 scene
