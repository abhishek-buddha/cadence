#!/bin/bash
# Run this on the EC2 instance to pull latest code, rebuild the frontend,
# and redeploy it to nginx. Backend (Convex) changes are NOT included here —
# use scripts/deploy-backend.sh for those.
set -e

cd "$(dirname "$0")/.."

VITE_CONVEX_URL="https://rapid-pheasant-510.convex.cloud"

echo "Pulling latest code..."
git pull origin Ace_Cadence

echo "Installing dependencies..."
npm ci

echo "Building frontend (VITE_CONVEX_URL=$VITE_CONVEX_URL)..."
VITE_CONVEX_URL="$VITE_CONVEX_URL" npm run build

echo "Deploying to nginx..."
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r dist/* /usr/share/nginx/html/
sudo systemctl restart nginx

echo "Done. Live at http://13.202.152.89"
