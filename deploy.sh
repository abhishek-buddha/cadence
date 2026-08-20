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

echo "$CHANGED" | grep -q '^Ace-Cadence-Ui/' && FRONTEND_CHANGED=true
echo "$CHANGED" | grep -q '^Ace-Cadence/' && BACKEND_CHANGED=true

if [ "$FRONTEND_CHANGED" = true ]; then
  cd "$APP_ROOT/Ace-Cadence-Ui"
  npm ci
  npm run build
fi

if [ "$BACKEND_CHANGED" = true ]; then
  cd "$APP_ROOT/Ace-Cadence"
  docker compose up -d --build
  # Restart nginx unconditionally after a backend build, not just when
  # nginx/ changed.
  #
  # nginx resolves the hostnames in its `upstream` blocks ONCE, at startup, and
  # caches the IPs. Any service container recreated by the build above comes
  # back on a new IP, and nginx keeps proxying to the old one — so every request
  # to a rebuilt service 502s until nginx is restarted. In the UI that presents
  # as every list being empty, i.e. "the database is gone", which is a genuinely
  # alarming way to find out about a caching bug.
  #
  # Previously this only ran when Ace-Cadence/nginx/ was in the diff, so a
  # backend-only deploy left the API 502ing until someone restarted nginx by
  # hand. Restarting always costs ~1s of downtime and removes the whole class.
  docker compose restart nginx
elif [ "$FRONTEND_CHANGED" = true ]; then
  cd "$APP_ROOT/Ace-Cadence"
  docker compose restart nginx
fi