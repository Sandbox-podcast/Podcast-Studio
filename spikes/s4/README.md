# S4 spike assets

Loïc decision (2026-10-05): **POC storage locked** to self-hosted **`pgsty/minio`** on the Sandbox LAN (S3-compatible, $0). Same host as **LiveKit OSS** (S1); LAN hostname/IP **TBD**. [D-01](../../docs/DECISIONS.md) unchanged; R2/S3/Mux/Stream remain **post-POC** ([`S4-S5-candidates-prep.md`](../S4-S5-candidates-prep.md)).

| Path | Purpose |
| --- | --- |
| [`minio/`](./minio/) | Docker Compose **`pgsty/minio`** (digest-pinned) + `mc` init; server-wide CORS / stale MPU via env |
| [`multipart-proto/`](./multipart-proto/) | Next.js 15 lab helper + browser multipart/resume sketch |
| [`lab-pass1/`](./lab-pass1/) | Pass 1 + 1b lab harness (localhost 2026-10-05) |
| [`lab-pass2/`](./lab-pass2/) | Pass 2a remux scripts + 2b OPFS crash harness |
| [`dropin/`](./dropin/) | S4 drop-in recorder v2.2 (Vision / studio integration) |
| [`analyze_ab.py`](./analyze_ab.py) | A/B inbox/S3 analyzer: remux, S4 gates, `distinct_fps` (H.264 → `.remux.mkv`) |
| [`REALCAM-RUN1-RESULT.md`](./REALCAM-RUN1-RESULT.md) | Real-cam pass 3 run 1 analysis (laptop) |
| [`REALCAM-RUN2-RESULT.md`](./REALCAM-RUN2-RESULT.md) | Real-cam pass 3 run 2 — dual raw/matted |
| [`REALCAM-RUN3-RESULT.md`](./REALCAM-RUN3-RESULT.md) | Real-cam pass 3 run 3 — matfix2 + audio guard |
| [`RESULT-RUN4.md`](./RESULT-RUN4.md) | Real-cam take 4 — MediaPipe dual canvas |
| [`S5-RVM-COST.md`](./S5-RVM-COST.md) | Async RVM server matting cost notes |
| [`run4/`](./run4/) | Contact stills + server-matte RVM checker assets |
| [`webcodecs/`](./webcodecs/) | WebCodecs / fMP4 parallel sketch (sources + `RESULT.md`) |
| [`../S4-recording.md`](../S4-recording.md) | **Preliminary** report + **locked** POC verdict (Loïc 2026-10-05) |
| [`../S4-webcodecs.md`](../S4-webcodecs.md) | WebCodecs spike summary (parallel track) |

Canonical protocol: [`../S4-protocol-prep.md`](../S4-protocol-prep.md).
