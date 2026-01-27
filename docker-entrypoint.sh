#!/usr/bin/env bash
set -e

APP_ROOT="/var/www/html"
FRONTEND_DIR="$APP_ROOT/frontend"

if [ -f "$FRONTEND_DIR/package.json" ]; then
  echo "[entrypoint] Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  if [ ! -d node_modules ]; then
    npm install
  else
    npm install --production=false
  fi
  echo "[entrypoint] Building frontend bundle..."
  npm run build
fi

cd "$APP_ROOT"
exec docker-php-entrypoint "$@"
