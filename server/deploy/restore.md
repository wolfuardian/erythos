# Erythos DB restore procedure

> **WARNING: Restoring a backup will OVERWRITE the current production database. All data written after the backup timestamp will be lost. This operation is NOT reversible without a newer backup.**

Before restoring, always verify that:
- You have the correct backup file selected (check timestamp)
- You have notified any active users of downtime
- If possible, take a fresh backup of the current state before overwriting

---

## Prerequisites

- `aws` CLI installed and configured (`aws configure` or env vars set — see Phase 13 in `install.md`)
- `psql` accessible and `DATABASE_URL` env var set
- Sufficient disk space in `/tmp` for the uncompressed SQL file (typically 2–5× the `.sql.gz` size)

---

## Step 1 — List available backups

```bash
# source env vars first if not already in shell
source /opt/erythos/server/.env

aws --endpoint-url="$S3_ENDPOINT" s3 ls "s3://${S3_BUCKET}/" | sort
```

The output shows `<date> <time> <size> erythos-backup-YYYYMMDD-HHMMSS.sql.gz`.
Pick the backup file you want to restore from.

---

## Step 2 — Restore from S3 (stream, no temp file)

Replace `<file>.sql.gz` with the filename from Step 1.

```bash
aws --endpoint-url="$S3_ENDPOINT" s3 cp "s3://${S3_BUCKET}/<file>.sql.gz" - \
  | gunzip \
  | psql "$DATABASE_URL"
```

This streams the backup directly from S3 → `gunzip` → `psql` without writing a local file.

### Alternative: download first, then restore

If streaming fails (network interruption risk on large dumps):

```bash
# Download
aws --endpoint-url="$S3_ENDPOINT" s3 cp "s3://${S3_BUCKET}/<file>.sql.gz" /tmp/restore.sql.gz

# Verify file is not truncated (check size)
ls -lh /tmp/restore.sql.gz

# Restore
gunzip -c /tmp/restore.sql.gz | psql "$DATABASE_URL"

# Cleanup
rm /tmp/restore.sql.gz
```

---

## Step 3 — Verify restore

```bash
psql "$DATABASE_URL" -P pager=off -c "SELECT count(*) FROM users;"
psql "$DATABASE_URL" -P pager=off -c "SELECT count(*) FROM scenes;"
psql "$DATABASE_URL" -P pager=off -c '\dt'
```

---

## Step 4 — Restart server (if running)

```bash
sudo systemctl restart erythos-server
sudo systemctl status erythos-server --no-pager
```

---

## Testing restore on staging / local Postgres

To test without touching production:

1. Spin up a local Postgres (Docker or native):
   ```bash
   # Docker one-liner
   docker run -d --name pg-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:16
   ```

2. Set a test `DATABASE_URL`:
   ```bash
   export DATABASE_URL=postgres://postgres:test@localhost:5433/postgres
   ```

3. Run the restore command from Step 2 against the test DB.

4. Verify row counts match expectations.

This validates the backup integrity and restore procedure without any risk to production data.
