# S1 laptop A/B — 2026-10-06T17:19:44.150

Harness http://localhost:5190/ab/index.html · codec vp8 · S4 http://127.0.0.1:3320 · warmup 20s · window 120s · sample 1000ms (cpu 2000ms)

| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ab-cam-2L-on | DONE | 2026-10-06T17:17:30.874 | 2026-10-06T17:19:31.671 | 2026-10-06T17:17:31.122 | 2026-10-06T17:19:31.668 | stopped+exported | ab-cam-2L-on-sub-hi-rx.webm (37572410 B) |

Distinct fps (box): `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm`

Raw: outbound-rid-series.csv (src_* = media-source) · media-source-series.csv · bwe-series.csv (publisher candidate-pair availableOutgoingBitrate) · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json
