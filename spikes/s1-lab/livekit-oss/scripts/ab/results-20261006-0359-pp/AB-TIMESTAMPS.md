# S1 laptop A/B — 2026-10-06T04:04:42.571

Harness http://localhost:5190/ab/index.html · codec vp8 · S4 http://127.0.0.1:3320 · warmup 20s · window 120s · sample 2000ms

| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ab-file-2L-off-pp | DONE | 2026-10-06T03:59:43.945 | 2026-10-06T04:01:44.646 | — | — | OFF | ab-file-2L-off-pp-sub-hi-rx.webm (37497623 B) |
| ab-file-2L-on-pp | DONE | 2026-10-06T04:02:27.353 | 2026-10-06T04:04:30.787 | 2026-10-06T04:02:27.758 | 2026-10-06T04:04:30.780 | stopped+exported | ab-file-2L-on-pp-sub-hi-rx.webm (37529901 B) |

Distinct fps (box): `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm`

Raw: outbound-rid-series.csv · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json
