# S4 spike assets

Loïc decision (2026-10-05): **POC storage locked** to self-hosted **`pgsty/minio`** on the Sandbox LAN (S3-compatible, $0). Same host as **LiveKit OSS** (S1); LAN hostname/IP **TBD**. [D-01](../../docs/DECISIONS.md) unchanged; R2/S3/Mux/Stream remain **post-POC** ([`S4-S5-candidates-prep.md`](../S4-S5-candidates-prep.md)).

| Path | Purpose |
| --- | --- |
| [`minio/`](./minio/) | Docker Compose **`pgsty/minio`** (digest-pinned) + `mc` init; server-wide CORS / stale MPU via env |
| [`multipart-proto/`](./multipart-proto/) | Next.js 15 lab helper + browser multipart/resume sketch |
| [`lab-pass1/`](./lab-pass1/) | Pass 1 + 1b lab harness (localhost 2026-10-05) |
| [`lab-pass2/`](./lab-pass2/) | Pass 2a remux scripts + 2b OPFS crash harness |
| [`webcodecs/`](./webcodecs/) | WebCodecs / fMP4 parallel sketch (sources + `RESULT.md`) |
| [`../S4-recording.md`](../S4-recording.md) | **Preliminary** report + soft-lock verdict |
| [`../S4-webcodecs.md`](../S4-webcodecs.md) | WebCodecs spike summary (parallel track) |

Canonical protocol: [`../S4-protocol-prep.md`](../S4-protocol-prep.md).
