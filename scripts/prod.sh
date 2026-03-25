#!/usr/bin/env bash
# scripts/prod.sh — Build & start all apps for production
# Usage: bun run prod:all

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."; pwd)"
[[ -f "$ROOT_DIR/.env" ]] && { set -a; source "$ROOT_DIR/.env"; set +a; }

export OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
export OPENCLAW_PORT="${OPENCLAW_PORT:-18789}"

echo "[prod] OpenClaw: home=$OPENCLAW_HOME port=$OPENCLAW_PORT"
echo "[prod] Building all apps..."
echo ""

cd "$ROOT_DIR"

# ── 1. Build web-control (Next.js) ────────────────────────────────────────────
echo "[prod] Building web-control..."
bun run --filter 'web-control' build
echo "[prod] web-control built ✓"
echo ""

# ── 2. Start services ─────────────────────────────────────────────────────────
echo "[prod] Starting services..."

# api-bridge: Bun runs TS directly, no separate build step
bun run --filter 'api-bridge' start &

# web-control: Next.js production server
bun run --filter 'web-control' start &

trap 'echo "[prod] Shutting down..."; kill 0 2>/dev/null; exit' INT TERM
wait
