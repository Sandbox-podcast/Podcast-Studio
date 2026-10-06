# S4 multipart presigned upload prototype (prep)

> **Not product code.** Minimal Next.js 15 app for the S4 lab: server helpers + browser sketch for multipart upload to **MinIO on the Sandbox LAN** ([`../minio`](../minio)).

## Prerequisites

- MinIO up on LAN (`docker compose` in `../minio`) with bucket + CORS applied.
- Copy `.env.example` → `.env` and set `S3_ENDPOINT` to `http://${MINIO_LAN_HOST}:${MINIO_API_PORT}` (placeholders until host is known).

## Run (on a machine that can reach MinIO)

```bash
cd spikes/s4/multipart-proto
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3310` from a browser on the **same LAN** as MinIO (or tunnel for dev only).

## API (server-side)

| Route | Role |
| --- | --- |
| `POST /api/multipart/create` | `CreateMultipartUpload` |
| `POST /api/multipart/presign-part` | Presigned `UploadPart` URL |
| `GET /api/multipart/list-parts` | Resume: list completed parts |
| `POST /api/multipart/complete` | `CompleteMultipartUpload` |
| `POST /api/multipart/abort` | `AbortMultipartUpload` |

Implementation: [`lib/s3.ts`](./lib/s3.ts) (`S3Client` + `forcePathStyle: true`).

## Browser sketch

[`lib/upload-client.ts`](./lib/upload-client.ts) + [`app/page.tsx`](./app/page.tsx): PUT each chunk to presigned URLs, read **ETag**, on cut call **ListParts** and skip uploaded part numbers before **Complete**.

Thresholds (part size, cut duration, pass/fail) are **TODO** in the lab runbook — see [`../../S4-protocol-prep.md`](../../S4-protocol-prep.md).
