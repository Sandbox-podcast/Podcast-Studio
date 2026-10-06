# S4 lab (local-dev)

Browser MediaRecorder → ≥5 MiB parts → presigned multipart upload to the box MinIO, with MinIO-only network cuts and resume.

**Not product code. Not the Sandbox-hardware pass.** See `RESULT.md` for the measured run.

## Layout

- `server.mjs` — static + multipart API on `127.0.0.1:3320`
- `public/recorder.html` + `recorder.js` — synthetic canvas/audio recorder + uploader
- `run-lab.mjs` — Playwright Chromium orchestrator
- `cleanup.mjs` — abort incomplete MPUs under the lab prefix
- `out/` — JSON logs from the last run
- `artifacts/` — downloaded remote object(s)

Does not use ports 7880/7881/5190/8080/9000/9001.
