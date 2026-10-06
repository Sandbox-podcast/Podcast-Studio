#!/bin/bash
set -euo pipefail
OUT_DIR="${OUT_DIR:-/work/scripts/soak-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$OUT_DIR"
cp /work/scripts/soak-5pax-hd.mjs /tmp/soak-5pax-hd.mjs
cd /tmp
npm init -y >/dev/null
npm install playwright-core@1.48.2 --silent
export HARNESS_URL="${HARNESS_URL:-http://host.docker.internal:5190}"
export ROOM="${ROOM:-s1-soak}"
export N_PUB="${N_PUB:-5}"
export HOLD_S="${HOLD_S:-1800}"
export SAMPLE_MS="${SAMPLE_MS:-10000}"
export Y4M="${Y4M:-/work/media/take4-20s.y4m}"
export WAV="${WAV:-/work/media/take4-20s.wav}"
export OUT_DIR
export CHROME="${CHROME:-/ms-playwright/chromium-1140/chrome-linux/chrome}"
# Patch OUT_DIR usage is via env already
node /tmp/soak-5pax-hd.mjs 2>&1 | tee "$OUT_DIR/soak.log"