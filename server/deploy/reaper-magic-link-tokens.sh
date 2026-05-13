#!/usr/bin/env bash
set -euo pipefail

# Erythos magic-link tokens reaper — daily cleanup of stale tokens.
#
# Spec: docs/magic-link-spec.md § Token Lifecycle / Reaper. Tokens whose
# expires_at is more than 30 days in the past (well beyond their 15-min TTL)
# are deleted. The 30-day retention window lets ops grep-audit recent sign-in
# attempts ("did this user receive a link last week?") while keeping the
# table bounded — without reaper, magic_link_tokens grows monotonically.
#
# Required env vars (loaded from /opt/erythos/server/.env or shell export):
#   DATABASE_URL — postgres connection string (application user, not postgres)
#
# Usage:
#   bash reaper-magic-link-tokens.sh
#   (cron) 0 4 * * * /opt/erythos/server/deploy/reaper-magic-link-tokens.sh >> /var/log/erythos-reaper.log 2>&1

ENV_FILE="/opt/erythos/server/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

: "${DATABASE_URL:?DATABASE_URL is not set}"

echo "[reaper] Starting at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

DELETED=$(psql "$DATABASE_URL" -tA -c "
  WITH deleted AS (
    DELETE FROM magic_link_tokens
    WHERE expires_at < NOW() - INTERVAL '30 days'
    RETURNING 1
  )
  SELECT COUNT(*) FROM deleted;
")

# Trim any whitespace psql may emit
DELETED="${DELETED// /}"

echo "[reaper] Deleted ${DELETED} row(s) from magic_link_tokens"
echo "[reaper] Done at $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
