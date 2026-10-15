#!/bin/bash
# Runs the credential issuer and the keeper together, sharing one data directory.
set -euo pipefail

: "${PORT:?PORT is required}"
: "${DATA_DIR:?DATA_DIR is required}"

mkdir -p "$DATA_DIR"
snapshot="$DATA_DIR/sanctions-latest.json"
[ -f "$snapshot" ] || node lists/src/cli.ts --out "$snapshot"

export HOST=0.0.0.0
export SANCTIONS_SNAPSHOT="$snapshot"
export LISTS_DIR="$DATA_DIR"
export ISSUER_URL="http://127.0.0.1:$PORT"

pnpm --filter @keelson/issuer start &
until curl -fsS "$ISSUER_URL/health" >/dev/null 2>&1; do sleep 1; done
pnpm --filter @keelson/keeper start &

# If either process stops, stop the container so the platform restarts both.
wait -n
exit 1
