# Spike S4 — enregistrement local HQ + upload S3-compatible

> **Pass 1 — localhost, Chromium headless, synthetic media (canvas + oscillator); NOT Sandbox hardware, NOT multi-machine; no verdict.**  
> Préliminaire · 2026-10-05 · Podcast Media · D-01 / [ARCHITECTURE](../docs/ARCHITECTURE.md) §6–7 · MinIO POC : [`spikes/s4/minio/README.md`](./s4/minio/README.md) (**pgsty/minio** verrouillé).

**Overall (pass 1 local):** functional **PASS**, numeric verdict **pending thresholds**.

## Draft PASS/FAIL (pass 1, local)

| Criterion | Verdict (pass 1) | Notes |
| --- | --- | --- |
| (a) Browser local recording produces a playable file | **PASS** (caveat) | `ffprobe` reads streams; `format.duration` **N/A**; DTS warnings → remux likely needed |
| (b) Segments uploaded to S3-compatible storage during recording | **PASS** | 20 parts while ~180 s record; see [§2](#2-segments--multipart-upload-while-recording) |
| (c) Resume after 10 s / 30 s storage cut; only missing parts re-sent | **PASS** | MinIO route abort; list-parts then parts 2 / 4–6 only |
| (d) Integrity sha256 local == remote | **PASS** | `c7ee6282c5bb8724a4eb392e7d8d25b89baacad5c9a84bb8a2e22682eebabfc0` |
| (e) No orphan incomplete uploads after cleanup | **PASS** | 0 incomplete MPUs under lab prefix |
| (f) Multi-track sync | **MEASURED** | First-chunk offset **+57.7 ms** (A−B); product verdict **TODO** |
| (g) Real devices / Sandbox hardware / multi-machine | **NOT TESTED** | — |

### Numeric thresholds

| Threshold | Status |
| --- | --- |
| Max sync offset | **TODO — Loïc via lead** |
| Min bitrate | **TODO — Loïc via lead** |
| Max resume time | **TODO — Loïc via lead** |
| Max data loss | **TODO — Loïc via lead** |

Raw artefacts : [`spikes/s4/lab-pass1/`](./s4/lab-pass1/) (`RESULT.md`, `out/summary.json`, `out/main-results.json`, …).

---

## Setup

| Item | Value |
| --- | --- |
| Browser | Playwright Chromium **131.0.6778.33** (lab) |
| Media | **canvas.captureStream(30)** 1920×1080 + WebAudio sawtooth oscillator |
| Lab API | `http://127.0.0.1:3320` (`server.mjs`) |
| Storage | MinIO `http://127.0.0.1:9000`, bucket `podcast-recordings-poc`, path-style, region `us-east-1` |
| Part size | **5 242 880** B (5 MiB) except last part |
| Target record | **180 s**, mime `video/webm;codecs=vp8,opus`, timeslice **1000 ms**, video hint **8 000 000** bps |
| Run window | **2026-10-05 18:34:55–18:38:44 CEST** (`out/summary.json`) |

Network cut : Playwright `route.abort` on `**://127.0.0.1:9000/**` only (lab API stays up).

## Results

### 1. Recording (mime / bitrate / size)

| Metric | Measured |
| --- | --- |
| Elapsed | **180 037.7 ms** |
| Timeslice chunks | **177** |
| Local bytes | **99 812 767** (~95.2 MiB) |
| Measured bitrate | **4 435 194 bit/s** (~4.435 Mbps) — below 8 Mbps hint |
| Mime used | `video/webm;codecs=vp8,opus` |

### 2. Segments → multipart upload (while recording)

| Metric | Measured |
| --- | --- |
| Object key | `spike/s4-lab/rec/lab-main-1791218096742.webm` |
| Parts | **20** (19 × 5 242 880 + last **198 047** B) |
| Complete ETag | `"2225ec373385ed323222ff309473b0df-20"` |
| Per-part PUT (loopback) | **14.2–54.5 ms** |

### 3. Cuts + resume + integrity

| Cut | Requested | Actual |
| --- | --- | --- |
| cut-10s | 10 000 ms | **10 063 ms** |
| cut-30s | 30 000 ms | **30 028 ms** |

After cut-10s: list-parts `[1]`; part **2** re-uploaded. After cut-30s: list-parts `[1,2,3]`; parts **4–6** uploaded.

| Check | Result |
| --- | --- |
| Remote ContentLength | **99 812 767** |
| sha256 local / remote | **match** (`c7ee6282…babfc0`) |

### 4. ffprobe readability

- `format.duration` = **N/A**; stream durations **N/A**
- Video: vp8 1920×1080, **5381** frames → ~**179.55 s** estimated (`30000/1001` fps)
- Audio: opus 48 kHz stereo, **2996** packets
- `ffmpeg` null decode: **non-monotonic DTS** warnings; seek @ 60 s exited 0 with VP8 decoder errors on some packets

### 5. Multi-track sync (2 contexts, 45 s each)

| Track | Local bytes | Parts | firstChunkAt (perf ms) |
| --- | --- | --- | --- |
| lab-sync-a | 9 998 227 | 2 | 1591.40 |
| lab-sync-b | 10 070 942 | 2 | 1467.90 |

| Offset | ms |
| --- | --- |
| `wallStartDeltaMs` | **0** |
| `timeOriginDeltaMs` (A−B) | **-65.80** |
| `firstChunkAbsDeltaMs` (A−B) | **+57.70** |

### 6. WebCodecs (feasibility only)

- `VideoEncoder` / `AudioEncoder` present
- 1280×720 @ 2.5 Mbps / 30 fps: **vp8 yes**, **vp09.00.10.08 yes**, **avc1.42E01E no**, **av01.0.04M.08 yes**
- Audio: **opus yes**, **mp4a.40.2 no**
- No encode→mux pipeline built in pass 1

### 7. Cleanup

Incomplete MPUs under `spike/s4-lab/rec/` after run: **0**.

## Open decisions

- **S4 pass/fail thresholds** — **TODO**, Loïc via lead (see [Numeric thresholds](#numeric-thresholds)).
- **Container strategy** — timesliced WebM + server remux vs WebCodecs / fragmented MP4.
- **Durable client buffer** — OPFS / IndexedDB / File System Access for real network cuts (pass 1: in-memory only).
- **Cut fidelity** — route abort vs NIC / firewall vs Docker partition on Sandbox LAN.

## Next steps (pass 2)

- Run on **Sandbox LAN host** with [`spikes/s4/minio/`](./s4/minio/) compose and real **`MINIO_LAN_HOST`**.
- Real camera/mic, **multi-machine**, include **low-end i5** laptop target.
- Apply Loïc thresholds once defined; update this report (remove “preliminary” when hardware pass is complete).
