# Soak harness (WIP)

Overnight 2026-10-06 scripts live on Loïc laptop lab dir:

`C:\Users\azero\s1-livekit-oss\scripts\`

- `soak-5pax-hd.mjs` + `run-soak.sh` — 5 pubs file-mode + HD sub, room `s1-soak`
- `soak-audio-5min.mjs` + `run-soak-audio.sh` — take4 WAV speech inbound metrics
- `soak-host-monitor.ps1` — docker stats + participants
- `subscribe-getstats.mjs` / `run-sub-getstats.sh` — take4 subscriber capture

Harness `file` mode (`public/harness.js`): publish take4 webm video + `/media/take4-20s.wav` audio via `captureStream` (gum blocked on non-secure `host.docker.internal`).

Results dirs: `scripts/soak-20261006-011411/` (30 min, in progress at WIP), then `scripts/soak-audio-*`.
