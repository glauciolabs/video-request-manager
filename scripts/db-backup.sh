#!/usr/bin/env bash
set -euo pipefail

# Generic backup script for PostgreSQL and Git-based storage.
# Configure env vars in CI/CronJob.
: "${POSTGRES_HOST:?required}"
: "${POSTGRES_PORT:?required}"
: "${POSTGRES_DB:?required}"
: "${POSTGRES_USER:?required}"
: "${POSTGRES_PASSWORD:?required}"
: "${BACKUP_REPO_URL:?required}"

WORKDIR="${WORKDIR:-/tmp/vrm-backup}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTDIR="$WORKDIR/backups"
mkdir -p "$OUTDIR"

export PGPASSWORD="$POSTGRES_PASSWORD"
pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" "$POSTGRES_DB" > "$OUTDIR/vrm-${STAMP}.sql"

if [ ! -d "$WORKDIR/repo/.git" ]; then
  git clone "$BACKUP_REPO_URL" "$WORKDIR/repo"
fi

cp "$OUTDIR/vrm-${STAMP}.sql" "$WORKDIR/repo/"
cd "$WORKDIR/repo"
git add "vrm-${STAMP}.sql"
git commit -m "chore: database backup ${STAMP}" || true
git push
