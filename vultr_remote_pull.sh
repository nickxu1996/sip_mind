#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/sip_mind"
REPO_URL="https://github.com/nickxu1996/sip_mind.git"
BRANCH="master"
SERVICE_NAME="sip-mind"

if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo "Project is not deployed yet. Run deploy_to_vultr.bat first."
  exit 1
fi

cd "$PROJECT_DIR"
git remote set-url origin "$REPO_URL"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npm run build
systemctl restart "$SERVICE_NAME"

sleep 2
curl -fsS http://127.0.0.1:8787/api/health
echo
systemctl --no-pager --full status "$SERVICE_NAME" | head -n 20
echo "[Sip Mind] Update complete."
