# MinIO — S4 POC storage (Sandbox LAN)

> **Prep.** Loïc decision (2026-10-05): S4 POC object storage is **locked** to self-hosted **MinIO-class** S3 on the Sandbox LAN ($0, S3-compatible → [D-01](../../../docs/DECISIONS.md) still holds). Cloud candidates (R2/S3/GCS) remain **post-POC**.

Runs on the **same LAN host** as self-hosted **LiveKit OSS** (S1). `MINIO_LAN_HOST` is a placeholder until that machine’s IP/hostname is known.

## Container images (OPEN DECISION — no winner in this repo)

Official `minio/minio` and `minio/mc` are **no longer pullable** from Docker Hub (2026-10-05 dev check); `quay.io/minio/*` denied; `dl.min.io` binaries return HTTP 410.

Compose defaults (overridable via `.env`):

| Variable | Default used in dev |
| --- | --- |
| `MINIO_IMAGE` | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` |
| `MC_IMAGE` | `pgsty/mc:RELEASE.2026-09-16T00-00-00Z` |

**Pending lead / Loïc:** frozen community fork `pgsty/minio` vs maintained successor `pgsty/silo` vs another S3-compatible server. Do not treat the default tags as a product decision.

## CORS and incomplete multipart uploads

This server **does not implement per-bucket CORS** (`PutBucketCors` → NotImplemented). Do not use `mc cors set` or a `cors.json` file.

Browser presigned PUTs use server-wide **`MINIO_API_CORS_ALLOW_ORIGIN`** (default `*` in compose — tighten in lab when the web origin is known).

Incomplete multipart uploads are cleaned via server-wide **`MINIO_API_STALE_UPLOADS_EXPIRY`** (default **168h**) and **`MINIO_API_STALE_UPLOADS_CLEANUP_INTERVAL`** (default **6h**), not bucket ILM. That expiry also caps how long a **paused** upload can be resumed before parts are dropped.

## Coexistence with LiveKit OSS (same host)

| Service | Typical ports | This compose |
| --- | --- | --- |
| LiveKit HTTP / API | **7880** | — |
| LiveKit WebRTC TCP | **7881** | — |
| LiveKit ICE UDP | **50000–60000** (range) | — |
| MinIO S3 API | — | `${MINIO_BIND_ADDR}`:`${MINIO_API_PORT}` default **9000** |
| MinIO Console | — | `${MINIO_BIND_ADDR}`:`${MINIO_CONSOLE_PORT}` default **9001** |

If 9000/9001 conflict with other lab services, override ports in `.env` only — do not hardcode the LAN address in this repo.

Clients on the LAN should use:

`http://${MINIO_LAN_HOST}:${MINIO_API_PORT}`

## Bring-up (on LAN host)

```bash
cd spikes/s4/minio
cp .env.example .env
# Edit .env: MINIO_LAN_HOST, credentials, optional MINIO_IMAGE / bind / CORS / stale upload expiry

docker compose up -d
docker compose logs minio-init
```

`minio-init` is a one-shot: create bucket `${MINIO_BUCKET_NAME}`, print effective CORS / stale-upload API settings. Init fails after **60s** with the real `mc` error if MinIO is unreachable (no infinite silent loop).

### Troubleshooting

If `minio-init` cannot reach `minio:9000` while the MinIO container is healthy, check the host **iptables/nftables FORWARD** policy (some dev boxes drop container↔container traffic on the default bridge). Fix firewall or use a local override — **do not** commit machine-specific `docker-compose.override.yml` to this repo.

## Smoke test (multipart, no app)

From a machine that can reach `MINIO_LAN_HOST` (replace placeholders):

```bash
export MC_HOST_minio="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@${MINIO_LAN_HOST}:${MINIO_API_PORT}"
mc alias set minio "${MC_HOST_minio}"
dd if=/dev/urandom of=/tmp/s4-chunk.bin bs=1M count=5
mc cp --disable-multipart /tmp/s4-chunk.bin "minio/${MINIO_BUCKET_NAME}/smoke/single.bin"
mc cp /tmp/s4-chunk.bin "minio/${MINIO_BUCKET_NAME}/smoke/multipart.bin"
```

Or use the [multipart prototype](../multipart-proto/README.md) API + browser page.

## Security notes (POC)

- Console and API are bound via `MINIO_BIND_ADDR`; restrict access to Sandbox LAN firewall rules.
- Tighten `MINIO_API_CORS_ALLOW_ORIGIN` when the spike web origin is known (TODO in lab).
- Root credentials in `.env` only; rotate after POC if needed.
