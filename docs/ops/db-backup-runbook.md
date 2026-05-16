# DB Backup Runbook

Daily `pg_dump` → Linode Object Storage. Runs on the production server via cron.

Two implementations exist — use whichever matches the production environment:

| Script | Tool requirement | Platform |
|--------|-----------------|----------|
| `server/deploy/backup.sh` | `aws` CLI + `pg_dump` | Linux/macOS (cron on prod host) |
| `scripts/backup.mjs` | Node.js 20+ + `pg_dump` | Cross-platform, no `aws` CLI needed |

Both use the same env vars and produce the same bucket objects.

---

## Environment variables

Set in `/opt/erythos/server/.env` on the production host (see `server/.env.example`).

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://erythos:pw@localhost:5432/erythos` | Already required by server |
| `S3_ENDPOINT` | `https://jp-tyo-1.linodeobjects.com` | Region endpoint, not bucket-prefixed |
| `S3_BUCKET` | `erythos-backups` | Create in Linode dashboard first |
| `AWS_REGION` | `jp-tyo-1` | Must match endpoint slug |
| `AWS_ACCESS_KEY_ID` | *(Linode access key)* | Object Storage → Access Keys |
| `AWS_SECRET_ACCESS_KEY` | *(Linode secret)* | Shown once at key creation |

`scripts/backup.mjs` also accepts `BACKUP_*` aliases (`BACKUP_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_KEY`, `BACKUP_S3_SECRET`) for compatibility with other tooling.

---

## Local dry-run (no DB or S3 required)

Prints the plan — object key, bucket, endpoint — without touching anything:

```bash
# From repo root
node scripts/backup.mjs --dry-run
```

Expected output:

```
[backup] Target bucket : erythos-backups
[backup] S3 endpoint   : https://jp-tyo-1.linodeobjects.com
[backup] Object key    : erythos-2026-05-16-030000.dump.gz
[backup] Local tmp     : /tmp/erythos-backup-2026-05-16-030000.dump.gz
[backup] Retention     : keep latest 7
[backup] --dry-run: plan printed above. No dump, upload, or prune performed.
```

The script loads `server/.env` automatically if the file exists, so you can run from any working directory as long as paths are absolute or repo-relative.

---

## Full local test (MinIO or live bucket)

```bash
# Option A — MinIO in Docker (no Linode account needed)
docker run -d --name minio \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -p 9000:9000 -p 9001:9001 \
  quay.io/minio/minio server /data --console-address ":9001"

# Create bucket via MinIO console at http://localhost:9001
# Then set env vars:
export DATABASE_URL=postgres://localhost:5432/erythos
export S3_ENDPOINT=http://localhost:9000
export S3_BUCKET=erythos-backups
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin

node scripts/backup.mjs
```

---

## Install cron (production host)

Run as the same user that owns the server process (e.g. `erythos`):

```bash
crontab -e
```

Add this line (runs daily at 03:00 UTC):

```
0 3 * * * node /opt/erythos/scripts/backup.mjs >> /var/log/erythos-backup.log 2>&1
```

Or using the bash variant (requires `aws` CLI and `pg_dump` on PATH):

```
0 3 * * * /opt/erythos/server/deploy/backup.sh >> /var/log/erythos-backup.log 2>&1
```

Verify cron sees the right PATH by prefixing with `PATH=/usr/local/bin:/usr/bin:/bin` if `node` or `pg_dump` is not found.

Check logs:

```bash
tail -f /var/log/erythos-backup.log
```

---

## Restore procedure

Full restore steps are documented in `server/deploy/restore.md`.

Quick reference:

```bash
# source env vars
source /opt/erythos/server/.env

# List backups (newest last)
aws --endpoint-url="$S3_ENDPOINT" s3 ls "s3://${S3_BUCKET}/" | sort

# Stream restore (no temp file)
aws --endpoint-url="$S3_ENDPOINT" s3 cp "s3://${S3_BUCKET}/<file>.dump.gz" - \
  | gunzip \
  | pg_restore -d "$DATABASE_URL" --no-owner --role=erythos

# Or: download first, then restore
aws --endpoint-url="$S3_ENDPOINT" s3 cp "s3://${S3_BUCKET}/<file>.dump.gz" /tmp/restore.dump.gz
pg_restore -d "$DATABASE_URL" --no-owner --role=erythos /tmp/restore.dump.gz
rm /tmp/restore.dump.gz
```

> The dump format is `pg_dump -Fc` (custom format). Use `pg_restore`, not `psql`, to restore.
> `restore.md` uses `psql` for plain-text dumps from `backup.sh` — that script uses plain format via `| gzip`.
> `backup.mjs` uses `-Fc` (custom/compressed) so restore requires `pg_restore`.

---

## Retention behaviour

`scripts/backup.mjs` lists all objects in the bucket after each upload, sorts by key name (lexicographic = chronological given the `erythos-YYYY-MM-DD-HHmmss` prefix), and deletes the oldest when the count exceeds 7.

`server/deploy/backup.sh` uses `awk` to compare object dates against a 7-day cutoff (date-based, not count-based). Both approaches result in roughly 7 days of coverage under normal daily-run conditions.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pg_dump launch failed` | `pg_dump` not on PATH | `apt install postgresql-client` |
| `missing required env vars` | `.env` not loaded | Check `server/.env` exists and has the vars |
| `Upload failed: ...` | Wrong endpoint/credentials | Verify `S3_ENDPOINT` format (no bucket prefix); check Linode access key has write permission to bucket |
| `list bucket failed (pruning skipped)` | List permission missing | Add `s3:ListBucket` to the access key's policy; backup already uploaded |
| Cron not running | PATH issue | Add `PATH=...` line before the cron command |
