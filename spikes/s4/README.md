# S4 spike assets (prep / not executed)

Loïc decision (2026-10-05): **POC storage locked** to self-hosted **MinIO** on the Sandbox LAN (S3-compatible, $0). Same host as **LiveKit OSS** (S1); LAN hostname/IP **TBD**. [D-01](../../docs/DECISIONS.md) unchanged; R2/S3/Mux/Stream remain **post-POC** ([`S4-S5-candidates-prep.md`](../S4-S5-candidates-prep.md)).

| Path | Purpose |
| --- | --- |
| [`minio/`](./minio/) | Docker Compose **`pgsty/minio`** (digest-pinned) + `mc` init; server-wide CORS / stale MPU via env |
| [`multipart-proto/`](./multipart-proto/) | Next.js 15 lab helper + browser multipart/resume sketch |

Canonical protocol: [`../S4-protocol-prep.md`](../S4-protocol-prep.md).
