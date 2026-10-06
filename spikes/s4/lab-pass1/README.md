# S4 lab pass 1 (local-dev)

Browser MediaRecorder → ≥5 MiB parts → presigned multipart upload to MinIO, with MinIO-only network cuts and resume.

**Not product code.** See [`RESULT.md`](./RESULT.md) and repo report [`../../S4-recording.md`](../../S4-recording.md).

## Prerequisites

1. Start MinIO from [`../minio/`](../minio/) (`docker compose up -d`; image locked to **`pgsty/minio`** — see [`../minio/README.md`](../minio/README.md)).
2. Copy [`../minio/.env.example`](../minio/.env.example) → `../minio/.env` and set credentials (never commit `.env`).
3. Node **20+** and Playwright Chromium (installed via `npm install` in this folder).

Credentials are read by [`load-env.mjs`](./load-env.mjs) from `../minio/.env` by default, or from `S4_MINIO_ENV_FILE`, or from `MINIO_*` / `S3_*` environment variables.

## Run

```bash
cd spikes/s4/lab-pass1
npm install
npx playwright install chromium   # if needed

# terminal 1
node server.mjs                   # http://127.0.0.1:3320

# terminal 2
S4_DURATION_SEC=180 S4_SYNC_DURATION_SEC=45 node run-lab.mjs
```

Outputs: `RESULT.md` (human summary), `out/*.json`, logs under `out/`. Optional downloads go to `artifacts/` (not committed).

## Layout

| File | Role |
| --- | --- |
| `server.mjs` | Static + multipart API on `LAB_PORT` (default **3320**) |
| `public/recorder.html` / `recorder.js` | Synthetic canvas/audio recorder + uploader |
| `run-lab.mjs` | Playwright Chromium orchestrator |
| `cleanup.mjs` | Abort incomplete MPUs under the lab prefix |
| `out/` | JSON + logs from the archived pass 1 run |

Does not bind LiveKit ports (7880/7881) or MinIO console (9001).
