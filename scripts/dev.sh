#!/usr/bin/env bash
# scripts/dev.sh — Start api-bridge + web-control
# OpenClaw gateway is managed by process-manager

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$ROOT_DIR/.env" ]] && { set -a; source "$ROOT_DIR/.env"; set +a; }

export OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
export OPENCLAW_PORT="${OPENCLAW_PORT:-18789}"

echo "[dev] OpenClaw: home=$OPENCLAW_HOME port=$OPENCLAW_PORT"
echo "[dev] Gateway is auto-managed by process-manager"
echo ""

cd "$ROOT_DIR"
bun run --filter 'api-bridge' dev &
bun run --filter 'web-control' dev &

trap 'echo "[dev] Bye"; kill 0 2>/dev/null; exit' INT TERM
wait
