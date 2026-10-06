# S1 laptop A/B — 2026-10-06T17:24:03.279

Harness http://localhost:5190/ab/index.html · codec vp8 · S4 http://127.0.0.1:3320 · warmup 20s · window 120s · sample 1000ms (cpu 2000ms)

| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ab-cam-3L-on | DONE | 2026-10-06T17:21:50.292 | 2026-10-06T17:23:51.151 | 2026-10-06T17:21:50.625 | 2026-10-06T17:23:51.148 | stopped+exported | ab-cam-3L-on-sub-hi-rx.webm (37136715 B) |

Distinct fps (box): `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm`

Raw: outbound-rid-series.csv (src_* = media-source) · media-source-series.csv · bwe-series.csv (publisher candidate-pair availableOutgoingBitrate) · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json
