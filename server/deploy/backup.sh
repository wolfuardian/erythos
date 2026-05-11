#!/usr/bin/env bash
set -euo pipefail

# Erythos DB backup — daily pg_dump → Linode Object Storage (S3-compatible)
#
# Required env vars (loaded from /opt/erythos/server/.env or export in shell):
#   DATABASE_URL   — postgres connection string
#   S3_ENDPOINT    — e.g. https://ap-south-1.linodeobjects.com
#   S3_BUCKET      — bucket name, e.g. erythos-backups
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY — Linode Object Storage access key
#
# Usage:
#   bash backup.sh
#   (cron) 0 3 * * * /opt/erythos/server/deploy/backup.sh >> /var/log/erythos-backup.log 2>&1

# ---------------------------------------------------------------------------
# 0. Load .env if running directly (cron environment won't have these vars)
# ---------------------------------------------------------------------------
ENV_FILE="/opt/erythos/server/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

# ---------------------------------------------------------------------------
# 1. Validate required vars
# ---------------------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${S3_ENDPOINT:?S3_ENDPOINT is not set}"
: "${S3_BUCKET:?S3_BUCKET is not set}"
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY checked by aws CLI itself

# ---------------------------------------------------------------------------
# 2. Create timestamped dump
# ---------------------------------------------------------------------------
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="/tmp/erythos-backup-${TIMESTAMP}.sql.gz"

echo "[backup] Starting pg_dump at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"
echo "[backup] Dump written to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# ---------------------------------------------------------------------------
# 3. Upload to S3
# ---------------------------------------------------------------------------
S3_KEY="erythos-backup-${TIMESTAMP}.sql.gz"
echo "[backup] Uploading to s3://${S3_BUCKET}/${S3_KEY}"
aws --endpoint-url="$S3_ENDPOINT" s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_KEY}"
echo "[backup] Upload complete"

# Remove local temp file
rm -f "$BACKUP_FILE"

# ---------------------------------------------------------------------------
# 4. Prune backups older than 7 days
# ---------------------------------------------------------------------------
# Compute the cutoff date string (YYYY-MM-DD) for 7 days ago.
# Note: GNU date is required (standard on Ubuntu/Debian).
# Alternative: use an S3 lifecycle policy (see NOTE below) instead of this step.
CUTOFF_DATE=$(date -d '7 days ago' +%Y-%m-%d)

echo "[backup] Pruning backups older than ${CUTOFF_DATE}"
aws --endpoint-url="$S3_ENDPOINT" s3 ls "s3://${S3_BUCKET}/" \
  | awk -v cutoff="$CUTOFF_DATE" '$1 < cutoff {print $4}' \
  | while IFS= read -r OLD_KEY; do
      if [[ -n "$OLD_KEY" ]]; then
        echo "[backup] Removing old backup: $OLD_KEY"
        aws --endpoint-url="$S3_ENDPOINT" s3 rm "s3://${S3_BUCKET}/${OLD_KEY}"
      fi
    done

echo "[backup] Done at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# NOTE: As an alternative to awk-based pruning, configure a lifecycle policy
# on the Linode bucket (Linode dashboard → Object Storage → Bucket → Lifecycle Rules)
# to auto-expire objects after 7 days. That approach requires no cron pruning step
# and is more reliable when backup filenames change format.
