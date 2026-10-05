# Spike S4 — WebCodecs + fragmented MP4 (parallel track)

> Summarized from the localhost / headless / synthetic sketch (`spikes/s4/webcodecs/RESULT.md`).
> **Correction vs that RESULT.md:** WebM remux is **proven** by S4 pass 2a — comparison rows below are updated.
> Soft-lock POC path remains WebM + remux + OPFS pending Loïc OK — see [`S4-recording.md`](./S4-recording.md) §Verdict.

**Label: localhost / headless / synthetic.** Everything ran on the shared box. This is **not** the Sandbox-hardware pass.
**Run by:** Podcast Media · **2026-10-05, 18:49–19:07 CEST (UTC+2)**
**Code:** [`spikes/s4/webcodecs/`](./s4/webcodecs/) (parallel to `lab-pass1` / `lab-pass2`)
**Raw data:** local run outputs under `out/` (not committed); see `RESULT.md` in that folder

## Setup

| Item | Value |
|---|---|
| Browsers | **System Google Chrome 154.0.8037.57** (`channel: 'chrome'`, already installed at `/opt/google/chrome`, nothing to install) and **Playwright Chromium 131.0.6778.33**. Both headless via Playwright 1.49.1 |
| GPU | None (`/dev/dri` missing, WebGL = SwiftShader). Every encoder below is **software** |
| Box | 8 vCPU, load average ~1.5–3.6 from other agents during the runs |
| Source | `canvas.captureStream(30)` at 1920×1080, the **same animated scene** as `s4-lab`, plus a WebAudio sawtooth/LFO (marker runs: 1 kHz beep plus a white flash every 2 s) |
| Pipeline | `MediaStreamTrackProcessor` → `VideoEncoder` / `AudioEncoder` → **mediabunny 1.61.3** `Mp4OutputFormat({fastStart:'fragmented', minimumFragmentDuration:1})` → `StreamTarget` → writes grouped into ≥5 MiB parts → presigned multipart PUT to MinIO **while recording** |
| Codec pick | avc1 High → Main → Baseline, else vp9. mp4a, else opus |
| Video config | 4.5 Mbps `bitrateMode:variable`, `latencyMode:realtime`, keyframe forced every 60 frames (~2 s), drop a frame if `encodeQueueSize > 10` |
| Audio config | opus 48 kHz stereo 128 kbps (**mp4a not available in either browser**) |
| MinIO | `127.0.0.1:9000`, bucket `podcast-recordings-poc`, prefix `spike/s4-webcodecs/`. Credentials from [`../minio/.env`](./s4/minio/.env.example) or env vars only |
| Spike server | `127.0.0.1:3330` (probe page `:3331`), stopped after each run |
| Recording | 60 s per run |

## 1. Codec support matrix (`isConfigSupported`, 1920×1080 at 30 fps, 6 Mbps)

`any` = `no-preference`, `hw` = `prefer-hardware`, `sw` = `prefer-software`.

| Config | Chromium 131 any / hw / sw | **Chrome 154** any / hw / sw |
|---|---|---|
| avc1 Baseline 3.1 `42E01F` (level too low for 1080p) | no / no / no | no / no / no |
| avc1 Baseline 4.0 `42E028` | no / no / no | **yes / no / yes** |
| avc1 Constrained Baseline 4.0 `42C028` | no / no / no | **yes / no / yes** |
| avc1 Main 4.0 `4D4028` | no / no / no | **yes / no / yes** |
| avc1 High 4.0 `640028` | no / no / no | **yes / no / yes** |
| avc1 High 4.2 `64002A` | no / no / no | **yes / no / yes** |
| vp8 | yes / no / yes | yes / no / yes |
| vp9 `vp09.00.40.08` | yes / no / yes | yes / no / yes |
| av1 `av01.0.08M.08` | yes / no / yes | yes / no / yes |
| opus 48k/2ch | yes | yes |
| mp4a AAC-LC `mp4a.40.2` | **no** | **no** |
| mp4a HE-AAC `mp4a.40.5` | no | no |

So real Chrome on Linux gives **H.264 in software only** (no GPU here) and **no AAC encoder**. The resulting MP4 is **H.264 + Opus**. Two things are not tested here: AAC through Chrome on Windows/macOS, and hardware H.264 on Sandbox machines.

## 2. Measured results (final runs, after the fixes in §4)

| Metric | **Chrome 154, avc1 + opus** | Chromium 131, vp9 + opus (fallback) |
|---|---|---|
| Run start | 19:03:19 CEST | 19:04:30 CEST |
| Encoder config used | `avc1.640028` (High 4.0), software, 4.5 Mbps VBR realtime. Decoder config: avcC 39 B, bt709, full range | `vp09.00.40.08`, software, 4.5 Mbps VBR realtime |
| Recording wall time | 60 000.7 ms | 60 006.7 ms |
| **Measured bitrate (total)** | **4.589 Mbps** (video 4.456, audio 0.129) | **3.260 Mbps** (video 3.127, audio 0.129). VP9 realtime undershoots the 4.5 Mbps target |
| File size | **34 419 917 B** | 24 456 387 B |
| Frames delivered by MSTP | 1797 / 1800 nominal (29.95 fps) | 1781 / 1800 (29.7 fps) |
| Frames dropped by our encoder policy | **0** | **0** |
| Max `encodeQueueSize` | 3 (1 s samples: always 0) | 2 |
| Capture gaps > 70 ms (main-thread stalls) | 2 (133.5 ms, 76.1 ms at ~17 s) | 5 (up to 201.8 ms) |
| Audio gap-fill (silence inserted to keep sync) | 63.1 ms (2 fills) | 148.9 ms (1 fill) |
| **CPU, whole browser process tree** (% of one core, recording window) | **112.0 %** (renderer 98.4, gpu 7.8, browser 4.3) | **201.7 %** (renderer 195.9) |
| Fragments | 31 (~2 s, start on keyframes) | 31 |
| Parts uploaded during recording | 7: parts 1–5 at rec+10/20/30/40/50 s (5.48–5.49 MiB each, PUT 36–71 ms), part 6 at stop, part 7 = 2 913 B tail (mfra) | 5 (at rec+14/28/43/57 s, then tail) |
| Upload complete after stop | +95 ms | +60 ms |
| **sha256 local = remote** | **match** `b66b7fd1…52e7` (34 419 917 B) | **match** `710d30e8…6df6` |
| **ffprobe format.duration** | **60.060 s** (present) | **60.061 s** (present) |
| Stream durations | video 59.985 s · audio 60.060 s | video 59.962 s · audio 60.060 s |
| Full decode (`ffmpeg -f null`) warnings | **0** | **0** |
| Seek test, ffmpeg `-ss 30` | exit 0, nearest keyframe 28.12 s, first decoded frame **30.020 s**, PNG shows the scene at ~30 s, 0 container/decoder warnings | exit 0, keyframe 28.40 s, first frame **30.030 s**, 0 warnings |
| Seek test in the browser (`<video>` straight from a MinIO presigned URL) | duration 60.06, seekable [0, 60.06], seek to 30 s in **115.8 ms**, readyState 4 | duration 60.06, seek 200.8 ms |
| A/V track ends (container) | audio start − video start 0 ms · end diff **+21.3 ms** | +0.3 ms · end diff +61.8 ms |
| Incomplete MPUs after run | 0 | 0 |

### A/V sync inside the file (marker test: 60 s, 31 flash/beep pairs, audio onset − video onset)

| Run | Median | Range | Note |
|---|---|---|---|
| **Chrome 154, final code** (19:01:49 CEST) | **−1.6 ms** | −17.3 … +5.0 | no drift over 60 s; video onset measured to the frame (~33 ms) |
| **Chromium 131, final code** (19:05:38 CEST) | **+3.2 ms** | −22.3 … +4.3 | no drift |
| Chrome 154, raw capture timestamps trusted (20 s, run 2) | **+320.8 ms** | +315.8 … +326.4 | the bug found in run 2, see §4 |

### Crash/truncation check (extra; fMP4 only)
- First 3 parts only (17 238 369 B, what MinIO would hold after a crash at ~30 s): `ffprobe` duration 30.12 s, 900 video / 1505 audio packets, **0 decode warnings**, seek to 15 s OK.
- Arbitrary cut mid-fragment (17 000 000 B): plays every complete fragment (870 / 1405 packets), 0 warnings.
- I didn't run the same check on the WebM path.

## 3. Comparison with the WebM path (figures copied from `s4-lab/RESULT.md`, not re-measured)

| | **WebM: MediaRecorder timeslice** (s4-lab pass 1 / 1b) | **fMP4: WebCodecs + mediabunny** (this spike, Chrome final run) |
|---|---|---|
| Browser | Chromium 131 | Chrome 154 (vp9 fallback in Chromium 131) |
| Codecs | vp8 + opus, WebM | **H.264 High + opus**, fragmented MP4 |
| Recording length | 180 s (pass 1) / 75 s (1b) | 60 s |
| Measured bitrate | 4.435 Mbps (8 Mbps hint) / 4.44 Mbps | 4.589 Mbps (4.5 Mbps target) |
| Size | 99 812 767 B / 41 650 820 B | 34 419 917 B |
| Upload during recording | yes, 20 parts / 8 parts | yes, 7 parts (cut on fragment boundaries) |
| sha256 local = remote | match | match |
| Network cut + resume | PASS (10 s cut: 48.8 ms; 30 s cut: 165.6 ms, loopback) | **not tested** in this spike (same uploader pattern) |
| ffprobe duration | **N/A** before remux; **180.021 s** after pass-2a remux | **60.060 s** |
| Decode warnings | raw: DTS noise from test pipeline; after remux + setts: **0** real container defects (1 dup audio TS fixed by setts) | **0** |
| Seek test | raw: VP8 warnings; **after remux: 0 seek warnings** @ 60 s / 150 s | `-ss 30` clean, frame at 30.02 s; browser seek 116 ms |
| Needs a server remux before use | **yes — proven in pass 2a** (`-map 0 -c copy` → duration **180.021 s**, Cues, **0** seek warnings; optional `-bsf:a setts=…`) | **no** for ffmpeg/Chrome playback |
| CPU | not measured | 112 % of one core (H.264 software) · 202 % (VP9 software) |
| A/V sync inside the file | not measured | −1.6 ms median (marker test), **only after our own fixes** |
| Sync between two recordings | first-chunk delta 57.7 ms (2 contexts) | not measured |
| Truncated (crash) file playable | not measured | yes, to the last complete fragment |
| Product code | MediaRecorder does mux, timestamps and A/V | **we** handle encoder config, keyframes, fragments, timeline, A/V alignment, audio gap-fill, backpressure |

## 4. What broke along the way (the honest cost of "we own the timeline")

1. **Run 1: duplicate video PTS.** Passing `frameRate: 30` to mediabunny set a 1/30 timescale and rounded the jittery capture timestamps onto the same tick: 49 duplicate PTS in the vp9 file, 48 DTS warnings. Fix: don't set it (timescale 1/57600). Afterwards: 0 duplicate PTS and strictly increasing DTS in both files.
2. **Run 1: Chromium 131 audio clock.** WebAudio-track `AudioData.timestamp` is on a different clock from the canvas `VideoFrame.timestamp` (Δ ≈ **251 058 s**), so the file's duration came out as 251 118 s. Fix: align audio by when its first sample arrives.
3. **Run 2: Chrome 154, plausible but wrong.** Raw timestamps differ by only 205–326 ms, so they look like one clock. The marker test showed audio **+321 ms late** when we trusted them. Fix: align by first-sample arrival in every browser. Result: −1.6 ms median.
4. **Runs 3–4: A/V drift after main-thread stalls.** `AudioEncoder` output timestamps follow the **sample count**. A stall of 80–117 ms (capture gaps seen at the same moment) loses input audio, so all later audio shifts earlier. By the end of 60 s the audio track was 130 ms short in run 4 (105 ms of it in 2 stalls) and 249 ms short in run 3. Fix: MSTP audio `maxBufferSize: 100` plus **silence gap-fill** when capture timestamps run more than 15 ms ahead of the encoded samples. Result: no drift across 31 markers.

All four were silent. sha256, ffprobe, "plays" and "seeks" all looked fine, so only a marker test exposes them.

## 5. Complexity cost

| Item | Measured |
|---|---|
| Recorder (`src/recorder.js`) | **306 lines** (274 not blank or comment). `record()` alone is 170 lines. Spike harness besides that: server 93, runner 110, analyze 47, avsync 15, probe 65 |
| WebM recorder for reference | `s4-lab/public/recorder.js` is 722 lines **including** cut/resume instrumentation, so not a like-for-like count |
| Dependency | `mediabunny` 1.61.3, **MPL-2.0**. Bundled locally with esbuild (no CDN): **135 235 B minified / 37 240 B gzip** (tree-shaken) |
| Keyframe/fragment control | Full: we force keyframes (every 60 frames) and mediabunny cuts fragments at ≥1 s on keyframes (here ~2 s). Parts end on box boundaries |
| A/V sync | **Ours**: timeline origin, cross-clock alignment, gap-fill. Four silent bugs in one afternoon (§4) |
| Not done in the sketch | Worker (everything runs on the main thread, which caused the stalls), OPFS buffer, cut/resume test, encoder error recovery, bitrate adaptation, mid-session codec or resolution change |

## 6. Blockers and open points

1. **No AAC encoder** in Chrome or Chromium on Linux, so Opus goes in MP4. ffmpeg and Chrome play it. Safari/QuickTime and post-production tools haven't been checked. AAC in Chrome on Windows/macOS (the Sandbox laptops) is untested.
2. **H.264 is software-only here** (no GPU): ~1 core at 1080p30. Hardware `prefer-hardware` support needs checking on Sandbox machines (`LAPTOP-BI8P2KF3`, i7+dGPU).
3. **A/V correctness depends on our code.** Arrival alignment and gap-fill held at −1.6 / +3.2 ms median in headless synthetic runs. Real mics/cameras (device clocks, `getUserMedia` timestamps) aren't tested.
4. **Main thread**: stalls of 76–202 ms happened while the box had other load. Production would need MSTP in a Worker.
5. **Not tested** in this spike: network cut/resume, OPFS durability, Firefox/Safari (MSTP/WebCodecs availability there was not checked), real cameras, LAN.
6. The WebM path's remux (`-c copy`) is **proven in pass 2a** (~0.3 s CPU / 180 s; duration 180.021 s; 0 seek warnings). Cost is measured; see `spikes/S4-recording.md` §Pass 2a.

## Cleanup
- Incomplete MPUs under `spike/s4-webcodecs/`: 0 aborted, **0 remaining**.
- Superseded run objects deleted. Kept in MinIO: `wc-chrome-avc1-1791219799067.mp4`, `wc-chromium-vp9-1791219869797.mp4`, `wc-marker60-chrome-1791219709510.mp4`, `wc-marker60-chromium-1791219938379.mp4` (local copies are in `artifacts/`).
- Servers on :3330/:3331 stopped. The MinIO container was not touched.

## Re-run
```bash
cd /workspace/podcast-studio/s4-webcodecs        # MinIO must already be up
npx esbuild src/recorder.js --bundle --format=iife --target=chrome120 --outfile=public/bundle.js
node probe-codecs.mjs                             # → out/codec-matrix.json
node run-spike.mjs --browser chrome   --duration 60 --tag chrome-avc1     # starts/stops server :3330 itself
node run-spike.mjs --browser chromium --duration 60 --tag chromium-vp9
node run-spike.mjs --browser chrome --duration 60 --marker --tag marker60-chrome && node avsync.mjs artifacts/<file>-remote.mp4 marker60-chrome
node cleanup.mjs                                  # aborts incomplete MPUs, lists objects
```