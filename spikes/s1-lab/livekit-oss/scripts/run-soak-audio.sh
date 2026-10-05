#!/bin/bash
set -euo pipefail
OUT_DIR="${OUT_DIR:-/work/scripts/soak-audio-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR"
cp /work/scripts/soak-audio-5min.mjs /tmp/soak-audio-5min.mjs
cd /tmp && npm init -y >/dev/null && npm install playwright-core@1.48.2 --silent
export HARNESS_URL="${HARNESS_URL:-http://host.docker.internal:5190}"
export ROOM="${ROOM:-s1-soak-audio}"
export N_PUB="${N_PUB:-3}"
export HOLD_S="${HOLD_S:-300}"
export SAMPLE_MS="${SAMPLE_MS:-5000}"
export OUT_DIR
export CHROME="${CHROME:-/ms-playwright/chromium-1140/chrome-linux/chrome}"
node /tmp/soak-audio-5min.mjs 2>&1 | tee "$OUT_DIR/soak.log"