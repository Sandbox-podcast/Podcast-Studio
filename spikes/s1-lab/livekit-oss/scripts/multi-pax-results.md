# S1 multi-pax smoke — LiveKit OSS (localhost)

- **Verdict: PASS** — connected 5/5 · saw ≥1 out or in video 5/5
- Run: 2026-10-05T18:28:38 Europe/Paris → 2026-10-05T18:29:33 Europe/Paris
- Config: room `s1-lab` · 5 isolated contexts · publish mode `canvas` · hold 50s · sample every 5s · headless=true · Chrome `/usr/bin/google-chrome`
- Script: `scripts/multi-pax-smoke.mjs` · raw: `scripts/multi-pax-results.json`

## Criteria (connectivity only — no perf thresholds invented)
1. All 5 participants reach status `connected` within 30s → **5/5**
2. Each participant shows ≥1 outbound video row OR ≥1 remote inbound video row → **5/5**

## Per participant
| id | join (ms) | final status | out video | remotes seen (in video) | out RTT ms min/med/max | in bitrate kbps min/med/max | left cleanly |
|---|---|---|---|---|---|---|---|
| mp-1 | 1511 | connected — s1-lab (canvas, no cam) | yes | 5 (mp-2, mp-3, mp-4, mp-5, vision-s3) | 0 / 0.5 / 1 (n=10) | 73 / 112 / 162 (n=50) | yes |
| mp-2 | 1443 | connected — s1-lab (canvas, no cam) | yes | 5 (mp-1, mp-3, mp-4, mp-5, vision-s3) | 0 / 1 / 2 (n=10) | 65 / 117 / 172 (n=50) | yes |
| mp-3 | 1391 | connected — s1-lab (canvas, no cam) | yes | 5 (mp-1, mp-2, mp-4, mp-5, vision-s3) | 0 / 0.5 / 1 (n=10) | 59 / 118.5 / 180 (n=50) | yes |
| mp-4 | 1481 | connected — s1-lab (canvas, no cam) | yes | 5 (mp-1, mp-2, mp-3, mp-5, vision-s3) | 0 / 0.5 / 1 (n=10) | 78 / 116.5 / 174 (n=50) | yes |
| mp-5 | 1402 | connected — s1-lab (canvas, no cam) | yes | 5 (mp-1, mp-2, mp-3, mp-4, vision-s3) | 0 / 0 / 1 (n=10) | 79 / 118 / 162 (n=50) | yes |

## Aggregate getStats samples (min / median / max, all sampled rows)
| metric | outbound video | inbound video |
|---|---|---|
| rows sampled | 50 | 250 |
| RTT (ms) | 0 / 0 / 2 (n=50) | 0 / 0 / 2 (n=250) |
| bitrate (kbps) | 0 / 0 / 1260 (n=50) | 59 / 117 / 180 (n=250) |
| loss (%) | n/a | 0 / 0 / 0 (n=250) |
| jitter (ms) | n/a | 0 / 0 / 9 (n=250) |
| fps | 9 / 15 / 15 (n=23) | 12 / 15 / 21 (n=250) |
| resolutions | 640×360, —, 320×180 | 320×180 |

## Raw outbound simulcast layers (script-side RTCPeerConnection getStats, harness untouched)
The harness table shows only the *first* outbound-rtp layer; with dynacast, unsubscribed layers pause → "0 bps" there is not a publish failure.
| id | layer | bitrate kbps min/med/max | fps min/med/max | last res | active | qualityLimitation |
|---|---|---|---|---|---|---|
| mp-1 | h | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-1 | q | 99.3 / 116.1 / 130 (n=9) | 14 / 15 / 15 (n=10) | 320x180 | true | none |
| mp-1 | f | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-2 | q | 99.4 / 113.4 / 134.5 (n=9) | 15 / 15 / 15 (n=10) | 320x180 | true | none |
| mp-2 | h | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-2 | f | 0 / 0 / 0 (n=9) | — | — | false | none |
| mp-3 | h | 0 / 0 / 0 (n=9) | 5 / 5 / 5 (n=1) | — | false | none |
| mp-3 | q | 92.9 / 110.8 / 129.1 (n=9) | 14 / 15 / 16 (n=10) | 320x180 | true | none |
| mp-3 | f | 0 / 0 / 0 (n=9) | 5 / 5 / 5 (n=1) | — | false | none |
| mp-4 | q | 88 / 118.3 / 129.7 (n=9) | 14 / 15 / 15 (n=10) | 320x180 | true | none |
| mp-4 | h | 0 / 0 / 0 (n=9) | 13 / 13 / 13 (n=1) | — | false | none |
| mp-4 | f | 0 / 0 / 0 (n=9) | 13 / 13 / 13 (n=1) | — | false | none |
| mp-5 | h | 0 / 0 / 15.5 (n=9) | 15 / 15 / 15 (n=1) | — | false | none |
| mp-5 | q | 82.8 / 119 / 128.4 (n=9) | 14 / 15 / 15 (n=10) | 320x180 | true | none |
| mp-5 | f | 0 / 0 / 71.5 (n=9) | 15 / 15 / 15 (n=1) | — | false | none |

Raw ICE RTT (nominated pairs, all PCs) per pax: mp-1 0 / 0.5 / 1 (n=20) · mp-2 0 / 1 / 2 (n=20) · mp-3 0 / 0.5 / 1 (n=20) · mp-4 0 / 0 / 1 (n=20) · mp-5 0 / 0 / 1 (n=20)

## Caveats
- localhost only (browser + SFU on same box)
- canvas CaptureStream synthetic video @15fps, no audio
- not 5 real cams
- not LAN / multi-machine
- headless Chrome in one process; stats scraped from harness table (polled 2s)
- room was shared: non-script participant(s) also present: vision-s3
- Harness RTT = ICE candidate-pair currentRoundTripTime (browser↔SFU), ~loopback here; says nothing about WAN.
- Bitrate column is the harness's 2s delta; first poll per track is "—" and excluded.
- **Harness fix (post-run):** `pickRtpReport` now picks the active simulcast layer (max bytes, then FPS) — outbound 0 bps false negative from this run is addressed in `public/harness.js`; re-run smoke to refresh outbound aggregates.
