#!/bin/bash
# Run this on the EC2 instance to pull latest code, rebuild the frontend,
# and redeploy it to nginx. Backend (Convex) changes are NOT included here —
# use scripts/deploy-backend.sh for those.
set -e

cd "$(dirname "$0")/.."

VITE_CONVEX_URL="https://rapid-pheasant-510.convex.cloud"

echo "Pulling latest code..."
git pull origin cadence_pro_ivr

echo "Installing dependencies..."
npm ci

echo "Building frontend (VITE_CONVEX_URL=$VITE_CONVEX_URL)..."
VITE_CONVEX_URL="$VITE_CONVEX_URL" npm run build

echo "Deploying to nginx..."
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r dist/* /usr/share/nginx/html/

# Re-assert the SPA fallback config in case /etc/nginx/conf.d/ ever gets reset
# (this file has disappeared once before — see cadence.conf below).
sudo tee /etc/nginx/conf.d/cadence.conf > /dev/null <<'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_EOF

sudo nginx -t
sudo systemctl restart nginx

echo "Done. Live at http://13.202.152.89"
