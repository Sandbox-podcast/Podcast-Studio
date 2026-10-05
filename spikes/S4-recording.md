# Spike S4 — enregistrement local HQ + upload S3-compatible

> **Pass 1 + 1b — localhost, Chromium headless, synthetic media (canvas + oscillator); NOT Sandbox hardware, NOT multi-machine; no hardware verdict.**  
> Préliminaire · 2026-10-05 · Podcast Media · D-01 / [ARCHITECTURE](../docs/ARCHITECTURE.md) §6–7 · MinIO POC : [`spikes/s4/minio/README.md`](./s4/minio/README.md) (**pgsty/minio** verrouillé).

**Overall (pass 1 + 1b local/synthetic):** **4/4 locked thresholds PASS on loopback**; caveats: remux needed (duration N/A), in-memory buffer, no real hardware/network; **resume must be re-measured on real uplink**.

## Draft PASS/FAIL (pass 1, local)

| Criterion | Verdict (pass 1) | Notes |
| --- | --- | --- |
| (a) Browser local recording produces a playable file | **PASS** (caveat) | `ffprobe` reads streams; `format.duration` **N/A**; DTS warnings → remux likely needed |
| (b) Segments uploaded to S3-compatible storage during recording | **PASS** | 20 parts while ~180 s record; see [§2](#2-segments--multipart-upload-while-recording) |
| (c) Resume after 10 s / 30 s storage cut; only missing parts re-sent | **PASS** | MinIO route abort; list-parts then parts 2 / 4–6 only |
| (d) Integrity sha256 local == remote | **PASS** | `c7ee6282c5bb8724a4eb392e7d8d25b89baacad5c9a84bb8a2e22682eebabfc0` |
| (e) No orphan incomplete uploads after cleanup | **PASS** | 0 incomplete MPUs under lab prefix |
| (f) Multi-track sync | **PASS** (baseline) | vs threshold ≤ 100 ms: `firstChunkAbsDeltaMs` **+57.7 ms**, `timeOriginDeltaMs` **−65.8 ms** (2 contexts, 45 s, same box, headless); real devices / multi-machine **not tested** |
| (g) Real devices / Sandbox hardware / multi-machine | **NOT TESTED** | — |

### Numeric thresholds (locked option B — Loïc, 2026-10-05)

| Threshold | Limit | Pass 1 vs limit |
| --- | --- | --- |
| Sync offset | **≤ 100 ms** | **PASS** — measured `firstChunkAbsDeltaMs` **+57.7 ms** and `timeOriginDeltaMs` **−65.8 ms** (2 contexts, 45 s, same box, headless). Baseline only; real devices / multi-machine not tested. |
| Bitrate | **≥ 1 Mbps** | **PASS** — measured **~4.435 Mbps** (4 435 194 bit/s); synthetic canvas source, not a camera characterization. |
| Data loss | **≤ 1 %** | **PASS** — **0 %** (sha256 local == remote, **99 812 767** B both sides). |
| Resume time (reconnect → all missing parts uploaded) | **≤ 15 s** | **PASS (local loopback)** — pass **1b** (`out/resume-results.json`): cut-10s offline **10 017.6 ms**, **resumeMs 48.8 ms**, parts re-sent **[2]**; cut-30s offline **30 013.6 ms**, **resumeMs 165.6 ms**, parts re-sent **[4, 5, 6]**; list-parts **11.5** / **31.6 ms**; each 5 MiB re-PUT **34–47 ms**. Integrity sha256 local==remote (**41 650 820** B, **75 040.9 ms** rec, **~4.44 Mbps**, **8** parts); **0** incomplete MPUs. |

> **Arithmetic caveat (not a measurement):** on loopback, re-send is near-instant. On a real link, **resumeMs ≈ buffered bytes / uplink**. At **~4.4 Mbps**, a **30 s** cut buffers **~15 MiB** → **~6.3 s** at **20 Mbps** uplink, **~12.6 s** at **10 Mbps**; below roughly **8–9 Mbps** uplink a 30 s cut would exceed **15 s**. The lab also signals reconnect itself, so **network-detection latency is not included**. Re-measure on Sandbox LAN / real uplink (pass 2).

Raw artefacts : [`spikes/s4/lab-pass1/`](./s4/lab-pass1/) (`RESULT.md`, `out/summary.json`, `out/resume-results.json`, …).

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

### 3. Cuts + resume + integrity (pass 1)

| Cut | Requested | Actual |
| --- | --- | --- |
| cut-10s | 10 000 ms | **10 063 ms** |
| cut-30s | 30 000 ms | **30 028 ms** |

After cut-10s: list-parts `[1]`; part **2** re-uploaded. After cut-30s: list-parts `[1,2,3]`; parts **4–6** uploaded.

| Check | Result |
| --- | --- |
| Remote ContentLength | **99 812 767** |
| sha256 local / remote | **match** (`c7ee6282…babfc0`) |

### 3b. Resume timing (pass 1b — instrumented)

Dedicated run: `node run-lab.mjs --resume-only` → `out/resume-results.json`. See [Numeric thresholds](#numeric-thresholds-locked-option-b--loïc-2026-10-05) for **resumeMs** vs **≤ 15 s** and loopback caveat.

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

- **S4 numeric thresholds** — locked (option B, Loïc 2026-10-05); pass **1b** measured resume on loopback only — **pass 2** on real uplink required.
- **Container strategy** — timesliced WebM + server remux vs WebCodecs / fragmented MP4.
- **Durable client buffer** — OPFS / IndexedDB / File System Access for real network cuts (pass 1: in-memory only).
- **Cut fidelity** — route abort vs NIC / firewall vs Docker partition on Sandbox LAN.

## Next steps (pass 2)

- Run on **Sandbox LAN host** with [`spikes/s4/minio/`](./s4/minio/) compose and real **`MINIO_LAN_HOST`**; **re-measure resumeMs** on real uplink (not loopback).
- Real camera/mic, **multi-machine**, include **low-end i5** laptop target.
- **`ffmpeg -c copy` remux** and **OPFS / IndexedDB durable buffer** — pending Loïc OK on WebM + server remux path.
- Update this report (remove “preliminary” when hardware pass is complete).
