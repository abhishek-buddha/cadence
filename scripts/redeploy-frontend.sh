#!/bin/bash
# Run this on the EC2 instance to pull latest code, rebuild the frontend,
# and redeploy it to nginx. Backend (Convex) changes are NOT included here —
# use scripts/deploy-backend.sh for those.
#
# This script intentionally does NOT touch nginx config. HTTPS is configured
# in /etc/nginx/conf.d/cadence.conf per SSL_Installation_Guide.docx (GoDaddy
# Standard SSL, certs at /etc/nginx/ssl/) and is confirmed working. An earlier
# version of this script rewrote that file on every deploy "just in case" and
# that's exactly what kept breaking SSL — don't reintroduce it. If the config
# ever needs to change (cert renewal, domain change), edit
# /etc/nginx/conf.d/cadence.conf directly on the server and run `sudo nginx -t
# && sudo systemctl reload nginx`.
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

echo "Done. Live at https://cadence-pro.acelive.ai"
