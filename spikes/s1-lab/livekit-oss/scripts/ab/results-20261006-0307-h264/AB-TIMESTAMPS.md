# S1 laptop A/B — 2026-10-06T03:17:59.636

Harness http://localhost:5190/ab/index.html · codec h264 · S4 http://127.0.0.1:3320 · warmup 20s · window 120s · sample 2000ms

| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ab-file-3L-off-h264 | DONE | 2026-10-06T03:07:37.434 | 2026-10-06T03:09:39.812 | — | — | OFF | ab-file-3L-off-h264-sub-hi-rx.webm (27345056 B) |
| ab-file-3L-on-h264 | DONE | 2026-10-06T03:10:20.209 | 2026-10-06T03:12:21.129 | 2026-10-06T03:10:20.501 | 2026-10-06T03:12:21.124 | stopped+exported | ab-file-3L-on-h264-sub-hi-rx.webm (18929581 B) |
| ab-file-2L-off-h264 | DONE | 2026-10-06T03:13:02.602 | 2026-10-06T03:15:05.126 | — | — | OFF | ab-file-2L-off-h264-sub-hi-rx.webm (36905878 B) |
| ab-file-2L-on-h264 | DONE | 2026-10-06T03:15:46.058 | 2026-10-06T03:17:47.609 | 2026-10-06T03:15:46.311 | 2026-10-06T03:17:47.594 | stopped+exported | ab-file-2L-on-h264-sub-hi-rx.webm (36239172 B) |

Distinct fps (box): `python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm`

Raw: outbound-rid-series.csv · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json
