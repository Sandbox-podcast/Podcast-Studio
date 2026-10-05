# MinIO — S4 POC storage (Sandbox LAN)

> **Prep / not executed on production.** Loïc decision (2026-10-05): S4 POC object storage is **locked** to self-hosted **MinIO** on the Sandbox LAN ($0, S3-compatible → [D-01](../../../docs/DECISIONS.md) still holds). Cloud candidates (R2/S3/GCS) remain **post-POC**.

Runs on the **same LAN host** as self-hosted **LiveKit OSS** (S1). `MINIO_LAN_HOST` is a placeholder until that machine’s IP/hostname is known.

## Coexistence with LiveKit OSS (same host)

| Service | Typical ports | This compose |
| --- | --- | --- |
| LiveKit HTTP / API | **7880** | — |
| LiveKit WebRTC TCP | **7881** | — |
| LiveKit ICE UDP | **50000–60000** (range) | — |
| MinIO S3 API | — | `${MINIO_API_PORT}` default **9000** |
| MinIO Console | — | `${MINIO_CONSOLE_PORT}` default **9001** |

If 9000/9001 conflict with other lab services, override `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` in `.env` only — do not hardcode the LAN address in this repo.

Clients on the LAN should use:

`http://${MINIO_LAN_HOST}:${MINIO_API_PORT}`

## Bring-up (on LAN host)

```bash
cd spikes/s4/minio
cp .env.example .env
# Edit .env: MINIO_LAN_HOST, credentials, optional ports / MPU days

docker compose up -d
docker compose logs minio-init
```

`minio-init` is a one-shot: bucket `${MINIO_BUCKET_NAME}`, CORS (presigned PUT + **ETag** exposed), ILM rule to abort incomplete multipart uploads after `${MINIO_ABORT_INCOMPLETE_MPU_DAYS}` days.

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

- Console and API are bound to host ports; restrict access to Sandbox LAN firewall rules.
- Tighten `cors.json` `AllowedOrigins` when the spike web origin is known (TODO in lab).
- Root credentials in `.env` only; rotate after POC if needed.
