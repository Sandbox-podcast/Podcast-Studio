# S1 laptop A/B — 2026-10-06T11:03:55.191

Harness http://localhost:5190/ab/index.html · codec vp8 · S4 http://127.0.0.1:3320 · warmup 20s · window 120s · sample 2000ms

| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ab-cam-3L-on | DONE | 2026-10-06T11:01:41.267 | 2026-10-06T11:03:43.318 | 2026-10-06T11:01:41.554 | 2026-10-06T11:03:43.316 | stopped+exported | ab-cam-3L-on-sub-hi-rx.webm (36446310 B) |

Distinct fps (box): `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm`

Raw: outbound-rid-series.csv · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json
