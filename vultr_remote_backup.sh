#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/sip_mind"
BACKUP_DIR="/opt/sip_mind_backups"
SERVICE_NAME="sip-mind"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
ARCHIVE="${BACKUP_DIR}/sip_mind_${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

tar \
  --exclude="node_modules" \
  --exclude="dist" \
  --exclude="dist-server" \
  --exclude=".git" \
  -czf "$ARCHIVE" \
  .env sip-mind.sqlite 2>/dev/null || true

chmod 600 "$ARCHIVE"
echo "$ARCHIVE"
ls -lh "$ARCHIVE"
systemctl is-active "$SERVICE_NAME"
