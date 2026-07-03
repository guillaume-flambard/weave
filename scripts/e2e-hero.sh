#!/usr/bin/env bash
# Full-stack hero E2E: Postgres + weave-api + Next.js + Playwright hero spec.
# Requires: docker compose (Postgres), Rust toolchain, pnpm.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${WEAVE_E2E_API:-http://127.0.0.1:8787}"
WEB="${WEAVE_E2E_URL:-http://127.0.0.1:3200}"
export DATABASE_URL="${DATABASE_URL:-postgres://weave:weave@localhost:5433/weave}"
export WEAVE_LLM_PROVIDER="${WEAVE_LLM_PROVIDER:-heuristic}"
export WEAVE_EMBED_PROVIDER="${WEAVE_EMBED_PROVIDER:-hash}"

cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "▶ Postgres (docker compose)"
docker compose -f "$ROOT/docker-compose.yml" up -d

echo "▶ weave-api ($WEAVE_LLM_PROVIDER)"
(cd "$ROOT" && cargo run -p weave-api) &
API_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "$API/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "$API/health" >/dev/null || { echo "API failed to start"; exit 1; }

echo "▶ Next.js ($WEB)"
(cd "$ROOT/apps/web" && pnpm build && pnpm exec next start -p "${WEB##*:}") &
WEB_PID=$!

for _ in $(seq 1 60); do
  if curl -sf "$WEB/" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "▶ Playwright hero"
cd "$ROOT/apps/web"
WEAVE_E2E_URL="$WEB" WEAVE_E2E_API="$API" pnpm exec playwright test tests/e2e/hero.spec.ts
