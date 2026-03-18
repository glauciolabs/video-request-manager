#!/usr/bin/env bash
set -euo pipefail

# Keeps container/* source in sync with main app folders.
# Required because current core-pipeline build context is fixed to ./container.

sync_dir() {
  local source="$1"
  local target="$2"
  rsync -a --delete \
    --exclude 'Dockerfile' \
    --exclude 'info.yaml' \
    --exclude '.dockerignore' \
    "${source}" "${target}"
}

sync_dir frontend/ container/frontend/
sync_dir admin-frontend/ container/admin-frontend/
sync_dir gateway/ container/gateway/
sync_dir services/order-service/ container/order-service/
sync_dir services/user-service/ container/user-service/
sync_dir services/notification-service/ container/notification-service/
sync_dir services/sla-service/ container/sla-service/
sync_dir services/report-service/ container/report-service/

echo "container context synchronized"
