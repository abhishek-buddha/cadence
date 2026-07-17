#!/bin/bash
# Deploys convex/*.ts to the production Convex deployment (rapid-pheasant-510).
# Reads CONVEX_DEPLOY_KEY from .env.deploy.local (gitignored, never commit this file).
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env.deploy.local ]; then
  echo "Missing .env.deploy.local. Create it with:"
  echo '  CONVEX_DEPLOY_KEY="prod:rapid-pheasant-510|<your-deploy-key>"'
  echo "Get the key from: https://dashboard.convex.dev/t/demo-45fb5/cadence-pro-ivr/rapid-pheasant-510/settings"
  exit 1
fi

# shellcheck disable=SC1091
source .env.deploy.local

if [ -z "$CONVEX_DEPLOY_KEY" ]; then
  echo "CONVEX_DEPLOY_KEY not set in .env.deploy.local"
  exit 1
fi

if [ -n "$(git status --porcelain -- convex/)" ]; then
  echo "Warning: uncommitted changes in convex/ — deploying anyway, but consider committing first:"
  git status --porcelain -- convex/
fi

echo "Deploying convex/ to rapid-pheasant-510..."
CONVEX_DEPLOY_KEY="$CONVEX_DEPLOY_KEY" npx convex deploy

echo "Done."
