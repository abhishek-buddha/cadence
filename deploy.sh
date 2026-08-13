#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/home/ec2-user/cadence"
BRANCH="Ace_Cadence"

cd "$APP_ROOT"

BEFORE_SHA="$(git rev-parse HEAD)"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
AFTER_SHA="$(git rev-parse HEAD)"

if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  echo "No changes to deploy."
  exit 0
fi

CHANGED="$(git diff --name-only "$BEFORE_SHA" "$AFTER_SHA" || true)"
FRONTEND_CHANGED=false
BACKEND_CHANGED=false
NGINX_CHANGED=false

echo "$CHANGED" | grep -q '^Ace-Cadence-Ui/' && FRONTEND_CHANGED=true
echo "$CHANGED" | grep -q '^Ace-Cadence/' && BACKEND_CHANGED=true
echo "$CHANGED" | grep -q '^Ace-Cadence/nginx/' && NGINX_CHANGED=true

if [ "$FRONTEND_CHANGED" = true ]; then
  cd "$APP_ROOT/Ace-Cadence-Ui"
  npm ci
  npm run build
fi

if [ "$BACKEND_CHANGED" = true ]; then
  cd "$APP_ROOT/Ace-Cadence"
  docker compose up -d --build
  if [ "$NGINX_CHANGED" = true ]; then
    docker compose restart nginx
  fi
elif [ "$FRONTEND_CHANGED" = true ]; then
  cd "$APP_ROOT/Ace-Cadence"
  docker compose restart nginx
fi