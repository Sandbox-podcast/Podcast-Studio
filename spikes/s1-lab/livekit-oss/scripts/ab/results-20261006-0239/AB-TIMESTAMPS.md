# S1 laptop A/B — 2026-10-06T02:53:31.240

Harness http://localhost:5190/ab/index.html · S4 http://127.0.0.1:3320 · warmup 20s · window 120s · sample 2000ms

| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ab-file-3L-off | DONE | 2026-10-06T02:40:05.320 | 2026-10-06T02:42:07.626 | — | — | OFF | ab-file-3L-off-sub-hi-rx.webm (36785724 B) |
| ab-file-3L-on | DONE | 2026-10-06T02:42:47.024 | 2026-10-06T02:44:47.853 | 2026-10-06T02:42:47.326 | 2026-10-06T02:44:47.848 | stopped+exported | ab-file-3L-on-sub-hi-rx.webm (21801607 B) |
| ab-file-2L-off | DONE | 2026-10-06T02:45:27.797 | 2026-10-06T02:47:30.350 | — | — | OFF | ab-file-2L-off-sub-hi-rx.webm (36697263 B) |
| ab-file-2L-on | DONE | 2026-10-06T02:48:09.758 | 2026-10-06T02:50:10.958 | 2026-10-06T02:48:09.993 | 2026-10-06T02:50:10.951 | stopped+exported | ab-file-2L-on-sub-hi-rx.webm (35725886 B) |
| ab-cam-3L-on | DONE | 2026-10-06T02:50:49.757 | 2026-10-06T02:52:50.636 | 2026-10-06T02:50:49.764 | 2026-10-06T02:52:50.634 | STOP FAIL not recording | — |

Distinct fps (box): `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm`

Raw: outbound-rid-series.csv · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json
