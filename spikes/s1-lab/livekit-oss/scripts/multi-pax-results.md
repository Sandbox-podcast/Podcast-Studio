# S1 multi-pax smoke — LiveKit OSS (localhost)

- **Verdict: PASS** — connected 5/5 · saw ≥1 out or in video 5/5
- **post-pickRtpReport fix** — harness outbound bitrate med **115 kbps** (73–2410), no longer stuck at 0 bps
- Run: 2026-10-05T18:40:56 Europe/Paris → 2026-10-05T18:41:51 Europe/Paris
- Config: room `s1-lab` · 5 isolated contexts · publish mode `canvas` · hold 50s · sample every 5s · headless=true · Chrome `/usr/bin/google-chrome`
- Script: `scripts/multi-pax-smoke.mjs` · raw: `scripts/multi-pax-results.json`

## Criteria (connectivity only — no perf thresholds invented)
1. All 5 participants reach status `connected` within 30s → **5/5**
2. Each participant shows ≥1 outbound video row OR ≥1 remote inbound video row → **5/5**

## Per participant
| id | join (ms) | final status | out video | remotes seen (in video) | out RTT ms min/med/max | in bitrate kbps min/med/max | left cleanly |
|---|---|---|---|---|---|---|---|
| mp-1 | 1549 | connected — s1-lab (canvas, no cam) | yes | 4 (mp-2, mp-3, mp-4, mp-5) | 0 / 1 / 1 (n=10) | 74 / 110.5 / 164 (n=40) | yes |
| mp-2 | 1366 | connected — s1-lab (canvas, no cam) | yes | 4 (mp-1, mp-3, mp-4, mp-5) | 0 / 1 / 1 (n=10) | 74 / 112.5 / 159 (n=40) | yes |
| mp-3 | 1509 | connected — s1-lab (canvas, no cam) | yes | 4 (mp-1, mp-2, mp-4, mp-5) | 0 / 1 / 3 (n=10) | 73 / 111.5 / 157 (n=40) | yes |
| mp-4 | 1378 | connected — s1-lab (canvas, no cam) | yes | 4 (mp-1, mp-2, mp-3, mp-5) | 0 / 1 / 1 (n=10) | 81 / 114 / 164 (n=40) | yes |
| mp-5 | 1453 | connected — s1-lab (canvas, no cam) | yes | 4 (mp-1, mp-2, mp-3, mp-4) | 0 / 0.5 / 2 (n=10) | 82 / 112 / 158 (n=40) | yes |

## Aggregate getStats samples (min / median / max, all sampled rows)
| metric | outbound video | inbound video |
|---|---|---|
| rows sampled | 50 | 200 |
| RTT (ms) | 0 / 1 / 3 (n=50) | 0 / 1 / 3 (n=200) |
| bitrate (kbps) | 73 / 115 / 2410 (n=48) | 73 / 112 / 164 (n=200) |
| loss (%) | n/a | 0 / 0 / 0 (n=200) |
| jitter (ms) | n/a | 0 / 0 / 9 (n=200) |
| fps | 15 / 15 / 15 (n=50) | 14 / 15 / 16 (n=200) |
| resolutions | 320×180, 1280×720 | 320×180 |

## Raw outbound simulcast layers (script-side RTCPeerConnection getStats, harness untouched)
Harness `pickRtpReport` now prefers active/max-bytes layer (fix on PR #3). Raw layers below still listed for dynacast detail.
| id | layer | bitrate kbps min/med/max | fps min/med/max | last res | active | qualityLimitation |
|---|---|---|---|---|---|---|
| mp-1 | q | 102.6 / 116.3 / 134.2 (n=9) | 15 / 15 / 15 (n=10) | 320x180 | true | none |
| mp-1 | h | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-1 | f | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-2 | h | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-2 | f | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-2 | q | 100.2 / 120 / 136.4 (n=9) | 15 / 15 / 15 (n=10) | 320x180 | true | none |
| mp-3 | q | 97.6 / 119.1 / 130.2 (n=9) | 15 / 15 / 16 (n=10) | 320x180 | true | none |
| mp-3 | h | 0 / 0 / 0 (n=9) | 6 / 6 / 6 (n=1) | — | false | none |
| mp-3 | f | 0 / 0 / 0 (n=9) | 6 / 6 / 6 (n=1) | — | false | none |
| mp-4 | q | 87.7 / 116.5 / 126.5 (n=9) | 15 / 15 / 16 (n=10) | 320x180 | true | none |
| mp-4 | f | 0 / 0 / 0 (n=9) | 12 / 12 / 12 (n=1) | — | false | none |
| mp-4 | h | 0 / 0 / 0 (n=9) | 11 / 11 / 11 (n=1) | — | false | none |
| mp-5 | h | 0 / 0 / 19.5 (n=9) | 15 / 15 / 15 (n=1) | — | false | none |
| mp-5 | q | 83.4 / 116.9 / 131.7 (n=9) | 15 / 15 / 16 (n=10) | 320x180 | true | none |
| mp-5 | f | 0 / 0 / 52.9 (n=9) | 15 / 15 / 15 (n=1) | — | false | none |

Raw ICE RTT (nominated pairs, all PCs) per pax: mp-1 0 / 1 / 1 (n=20) · mp-2 0 / 1 / 1 (n=20) · mp-3 0 / 1 / 3 (n=20) · mp-4 0 / 1 / 1 (n=20) · mp-5 0 / 0.5 / 2 (n=20)

## Caveats
- localhost only (browser + SFU on same box)
- canvas CaptureStream synthetic video @15fps, no audio
- not 5 real cams
- not LAN / multi-machine
- headless Chrome in one process; stats scraped from harness table (polled 2s)
- Harness RTT = ICE candidate-pair currentRoundTripTime (browser↔SFU), ~loopback here; says nothing about WAN.
- Bitrate column is the harness's 2s delta; first poll per track is "—" and excluded.
