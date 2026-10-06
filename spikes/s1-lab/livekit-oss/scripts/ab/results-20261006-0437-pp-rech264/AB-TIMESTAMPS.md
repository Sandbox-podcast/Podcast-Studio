# S1 laptop A/B — 2026-10-06T04:40:58.889

Harness http://localhost:5190/ab/index.html · codec vp8 · S4 http://127.0.0.1:3320 · warmup 20s · window 120s · sample 2000ms

| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ab-file-2L-on-pp-rech264 | DONE | 2026-10-06T04:38:45.622 | 2026-10-06T04:40:46.771 | 2026-10-06T04:38:45.898 | 2026-10-06T04:40:46.767 | stopped+exported | ab-file-2L-on-pp-rech264-sub-hi-rx.webm (34031873 B) |

Distinct fps (box): `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm`

Raw: outbound-rid-series.csv · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json
