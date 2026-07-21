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

# SSL was installed per SSL_Installation_Guide.docx (GoDaddy Standard SSL) at
# /etc/nginx/ssl/. This script used to overwrite cadence.conf with a plain
# HTTP-only block on every deploy, silently destroying that HTTPS server
# block each time — that was the "SSL breaks after redeploy" bug. Re-assert
# the FULL HTTP->HTTPS + HTTPS server config here instead, so redeploying
# never regresses SSL. If the cert files ever move/rotate, update the paths
# below (and re-run this script) rather than editing nginx.conf by hand.
DOMAIN="cadence-pro.acelive.ai"
SSL_DIR="/etc/nginx/ssl"
SSL_FULLCHAIN="$SSL_DIR/$DOMAIN-fullchain.pem"
SSL_TRUSTED="$SSL_DIR/$DOMAIN-trusted.pem"
SSL_KEY="$SSL_DIR/$DOMAIN.key"

for f in "$SSL_FULLCHAIN" "$SSL_TRUSTED" "$SSL_KEY"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: expected SSL file missing: $f"
    echo "Refusing to overwrite nginx config without a valid cert in place — see SSL_Installation_Guide.docx."
    exit 1
  fi
done

sudo tee /etc/nginx/conf.d/cadence.conf > /dev/null <<NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $DOMAIN;
    root /usr/share/nginx/html;
    index index.html;

    ssl_certificate $SSL_FULLCHAIN;
    ssl_certificate_key $SSL_KEY;
    ssl_trusted_certificate $SSL_TRUSTED;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_EOF

sudo nginx -t
sudo systemctl restart nginx

echo "Done. Live at https://$DOMAIN"
