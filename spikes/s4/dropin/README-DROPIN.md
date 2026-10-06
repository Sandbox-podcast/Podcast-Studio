# S4 drop-in recorder v2.2 (Vision harness)

MediaRecorder → OPFS → presigned multipart upload for the MediaPipe harness at `http://127.0.0.1:8088/`.

Records **caller-owned** streams **before** the SFU. Does not stop the caller's tracks.

## Start the API server (laptop)

```powershell
$env:PATH = "C:\Users\azero\AppData\Roaming\nvm\v20.11.0;" + $env:PATH
$env:NVM_HOME = "C:\Users\azero\AppData\Roaming\nvm"
$env:S4_ENV_FILE = "C:\Users\azero\podcast-studio\minio\.env"
$env:S4_KEY_PREFIX = "spike/s4-dropin/"
$env:CORS_ORIGINS = "http://127.0.0.1:8088,http://localhost:8088"
$env:LAB_PORT = "3320"
cd C:\Users\azero\podcast-studio\s4-dropin
node server.mjs
```

Health: `http://127.0.0.1:3320/api/health`  
Script: `http://127.0.0.1:3320/s4-recorder.js`

Never put a `.env` inside this folder — always `S4_ENV_FILE` → `minio\.env`.

## API (v2)

```js
const h = await S4Recorder.startSession({
  stream,                 // MediaStream (required for harness)
  label: 'raw'|'matted',  // goes into object filename
  apiBase: 'http://127.0.0.1:3320',
  participant: 'host',
  durationSec: 0,         // >0 auto-stops; 0 = manual
  partMiB: 5,
  timeslice: 1000,
  vBitrate: 2500000,
  onGap: (g) => { /* { label, startMs, durationMs } */ },
  onAudioIssue: (i) => { /* { label, reason, tMs } — toast this */ },
  // expectAudio: true|false  // default: true if stream has audio tracks
  // mimeType: 'video/webm;codecs=h264'  // optional; v2.2 honours explicit types (no silent VP8 fallback)
});
h.stop();
h.results();              // snapshot — check results.audio / audioMissing / completeOk
await h.exportResults();  // POST /api/results → <key>.results.json in bucket + out/
await S4Recorder.stopAll(); // stop every session; resolves when all flushed/complete
```

**`mimeType` / H.264 (Edge):** requesting `video/webm;codecs=h264` is supported, but Edge often records **`video/x-matroska;codecs=avc1,opus`** (Matroska/avc1) while the blob may still be named `.webm`. After `startSession`, check **`results.recorderMimeType`** (and `requestedMimeType` / `mimeType`) — do not assume VP8 from the filename alone.

### Audio presence guard (v2.1)

At `startSession`, each audio track is logged (`readyState`, `muted`, `enabled`, `label`, `settings`). A watchdog (MediaStreamTrackProcessor, else AnalyserNode) counts real samples. Issues fire `onAudioIssue` and land in `results.audio.issues` when:

- track already `ended` / `muted` / disabled at start
- no samples (or all-zero RMS) in the first **2 s**
- `mute` / `ended` mid-take

At finalize, if audio was expected but `samplesSeen === 0`: `audioMissing: true`, `completeOk: false`, error string set — **bytes still upload** for diagnosis (same idea as gap reporting).

```js
onAudioIssue: (i) => {
  console.warn('S4 audio', i);
  // showToast(`Audio: ${i.reason}`);
},
```

v1 still works: `S4Recorder.startRecording(opts)` / `stopRecording()` (single session, awaits completion).

Gap watchdog (per session): prefers `MediaStreamTrackProcessor`, else hidden `<video>` + `requestVideoFrameCallback`. Logs gaps **> 500 ms** into `results.gaps` and calls `onGap`. Also logs `document.visibilitychange` into `results.visibility`.

## Dual-session take (raw + matted) — Vision

Reuse **one** `getUserMedia` for the camera (do not open a second camera):

```html
<script src="http://127.0.0.1:3320/s4-recorder.js"></script>
<script>
async function startDual() {
  // Prefer the page's existing getUserMedia stream if already open:
  const raw = window.__camStream
    || await navigator.mediaDevices.getUserMedia({
         video: { width: 1280, height: 720, frameRate: 30 },
         audio: true,
       });
  // Matted canvas video + SAME mic track(s)
  const matted = new MediaStream([
    ...previewCanvas.captureStream(30).getVideoTracks(),
    ...raw.getAudioTracks(),
  ]);

  const gaps = [];
  const onGap = (g) => { gaps.push(g); console.warn('S4 gap', g); /* toast */ };

  const rawH = await S4Recorder.startSession({
    stream: raw, label: 'raw', apiBase: 'http://127.0.0.1:3320',
    participant: 'host', durationSec: 0, onGap,
  });
  const matH = await S4Recorder.startSession({
    stream: matted, label: 'matted', apiBase: 'http://127.0.0.1:3320',
    participant: 'host', durationSec: 0, onGap,
  });

  // later:
  // await S4Recorder.stopAll();
  // await rawH.exportResults(); await matH.exportResults();
}
</script>
```

Keep the Edge tab **visible** during the take — a background tab pauses `requestAnimationFrame` / `captureStream` (run-1 27 s hole).

## Remux (server-side)

```bash
ffmpeg -y -i in.webm -map 0 -c copy \
  -bsf:a "setts=pts='if(lte(PTS,PREV_OUTPTS),PREV_OUTPTS+1,PTS)':dts='if(lte(DTS,PREV_OUTDTS),PREV_OUTDTS+1,DTS)'" \
  out.webm
```
