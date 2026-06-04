#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/sip_mind"
REPO_URL="https://github.com/nickxu1996/sip_mind.git"
BRANCH="master"
SERVICE_NAME="sip-mind"
REMOTE_ENV="/tmp/sip_mind.env"

echo "[Sip Mind] Installing server packages..."
apt-get update
apt-get install -y ca-certificates curl git nginx

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  echo "[Sip Mind] Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "[Sip Mind] Pulling project..."
mkdir -p "$(dirname "$PROJECT_DIR")"
if [ ! -d "$PROJECT_DIR/.git" ]; then
  rm -rf "$PROJECT_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
else
  cd "$PROJECT_DIR"
  git remote set-url origin "$REPO_URL"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

cd "$PROJECT_DIR"

if [ -f "$REMOTE_ENV" ]; then
  echo "[Sip Mind] Installing private .env..."
  mv "$REMOTE_ENV" "$PROJECT_DIR/.env"
  chmod 600 "$PROJECT_DIR/.env"
fi

mkdir -p "$PROJECT_DIR/data"

echo "[Sip Mind] Installing dependencies and building..."
npm ci
npm run build

echo "[Sip Mind] Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Sip Mind
After=network.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "[Sip Mind] Configuring Nginx..."
cat > "/etc/nginx/sites-available/${SERVICE_NAME}" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sfn "/etc/nginx/sites-available/${SERVICE_NAME}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
nginx -t
systemctl reload nginx

echo "[Sip Mind] Health check..."
sleep 2
curl -fsS http://127.0.0.1:8787/api/health
echo
systemctl --no-pager --full status "$SERVICE_NAME" | head -n 20
echo "[Sip Mind] Deployment complete."
