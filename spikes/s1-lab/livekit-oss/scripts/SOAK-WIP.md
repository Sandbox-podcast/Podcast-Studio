# Soak harness — overnight 2026-10-06 (FINAL)

Lab dir on laptop: `C:\Users\azero\s1-livekit-oss\scripts\`

## Results

| Run | Path | Verdict |
| --- | --- | --- |
| 30 min 5-pax HD | `soak-20261006-011411/` | connectivity PASS / **HD FAIL** (3×1280×720@8fps) |
| 5 min audio WAV | `soak-audio-20261006-014508/` | **speech PASS**; bitrate kbps NOT VALIDATED |

## Scripts

- `soak-5pax-hd.mjs` + `run-soak.sh`
- `soak-audio-5min.mjs` + `run-soak-audio.sh`
- `soak-host-monitor.ps1`
- Harness `file` mode: webm video + WAV audio via `captureStream`

Box copies: `/workspace/s1-soak/`
