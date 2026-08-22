#!/usr/bin/env bash
# Redeploy weave-api from the latest main. Idempotent, run over SSH:
#   ssh root@<host> /opt/weave/deploy/redeploy.sh
set -euo pipefail

REPO=/opt/weave
cd "$REPO"

git fetch --quiet origin
git reset --quiet --hard origin/main

if [ ! -f "$REPO/.weave-api.env" ]; then
  echo "missing $REPO/.weave-api.env (chmod 600). Copy from .env.example and set WEAVE_ENC_KEY." >&2
  exit 1
fi

docker compose -f deploy/weave-api.compose.yml up -d --build
docker image prune -f >/dev/null 2>&1 || true

echo -n "health: "
curl -fsS https://weave.memolabs.dev/weave-api/health && echo
