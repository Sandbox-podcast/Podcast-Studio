# Spike S4 — enregistrement local HQ + upload S3-compatible

## Verdict / recommendation

> **LOCKED** · Loïc confirmed · **2026-10-05 ~20:49 CEST** (consensus Media / RTC / Vision from ~20:17)

**POC = MediaRecorder WebM timeslice + server remux (`-map 0 -c copy -bsf:a setts=…`) + OPFS buffer — locked by Loïc 2026-10-05.** WebCodecs/fMP4 = **parallel documentation track only** — see [`spikes/S4-webcodecs.md`](./S4-webcodecs.md).

| Why this POC path (locked) | What fMP4 still wins on |
| --- | --- |
| Browser-handled A/V mux/sync on the MediaRecorder path | Playable **without** a remux step (`format.duration` present) |
| Avoids owning the encode timeline (WebCodecs spike hit **4 silent** A/V bugs before marker tests caught them) | Crash/truncation-safe down to the last complete fragment |
| Remux proven in pass **2a** (~0.3 s CPU / 180 s; duration + Cues; 0 seek warnings) | Native seek in ffmpeg and `<video>` without repair |
| OPFS crash recovery proven in pass **2b** (348 ms, 0 % loss vs delivered chunks) | — |

Spike-level lock for the S4 POC; promote to [DECISIONS.md](../docs/DECISIONS.md) only if the lead wants a repo-wide ADR.

---

## Pass 2a — remux (`-c copy`)

**Label:** box, ffmpeg 7.1.5. Inputs = pass-1 180 s + pass-1b 75 s WebM (byte-identical to MinIO). Run **2026-10-05 ~18:47–18:51 CEST**. Raw: [`spikes/s4/lab-pass2/RESULT.md`](./s4/lab-pass2/RESULT.md) §Pass 2a · `remux-proof.py` · `ebml-cues.py`.

### Before → after `ffmpeg -i in.webm -c copy -map 0 out.webm`

| | 180 s before | 180 s after | 75 s before | 75 s after |
| --- | --- | --- | --- | --- |
| format.duration | **N/A** | **180.021 s** | **N/A** | **75.009 s** |
| A/V duration diff (video − audio) | n/a | **−45.0 ms** | n/a | **−24.0 ms** |
| Cues | **none** | **present** (54 Clusters) | none | present (23 Clusters) |
| Seek `-ss 60 -frames:v 1` | rc 0, **46** warning lines | **0** warnings | 100 warnings | **0** warnings |
| Remux CPU (user+sys, 3 runs) | — | **~0.25–0.30 s** (~0.3 s / 180 s) | — | ~0.17–0.18 s |

### Timestamp fix

- One **duplicate audio timestamp** on the 180 s file (1 / 2996 Opus packets @ 96.422 s) from MediaRecorder. Fixed without re-encode by:
  ```text
  ffmpeg -i in.webm -map 0 -c copy \
    -bsf:a "setts=pts='if(lte(PTS,PREV_OUTPTS),PREV_OUTPTS+1,PTS)':dts='if(lte(DTS,PREV_OUTDTS),PREV_OUTDTS+1,DTS)'" \
    out.webm
  ```
- `+genpts`: **no effect**. `.mkv`: ok (same results). `.mp4` + `-c copy`: **refused** for vp8 (`codec not currently supported in container`).

### Verdict 2a

**`-map 0 -c copy` alone** restores duration + Cues + seekability (~0.2–0.3 s wall per ~100 MB). **Minimal clean cmd** adds the audio `setts` BSF. Residual A/V track-duration diff: −45 ms (180 s) / −24 ms (75 s).

---

## Pass 2b — OPFS crash recovery

**Label:** localhost / headless / synthetic, Playwright Chromium 131 persistent context. Run **2026-10-05 18:52:56–18:53:27 CEST**. Runner: `run-opfs-crash.mjs`.

| Item | Value |
| --- | --- |
| Crash model | MinIO cut, then `page.close()` 20 s into the cut |
| Crash → object complete on S3 | **348 ms** |
| Data loss vs delivered chunks | **0 B = 0 %** (sha256 match, 16 797 569 B) |
| OPFS chunk write (n=29) | median **35.5 ms** (min 23.8 · max 88.9) |
| `recoverAll` | **192.2 ms** (re-PUT parts 2–3 + tail part 4 + complete) |

### Not covered

- ≤ ~**1 s** of media MediaRecorder had not delivered yet (timeslice)
- Hard kill / browser kill / **power loss** (only clean `page.close()` tested)

### Recorder bug fixed (manifest ordering)

At part cut, the manifest was written with `byteCursor` advanced **without** registering the new part → first crash run completed an object **missing part 3** (silent **~5 MiB** gap). Fixed: register part before manifest write; recorder **refuses to complete** if parts are not contiguous over `[0, byteCursor)`.

---

## Laptop LAN MinIO (host for LiveKit + MinIO)

| Item | Value |
| --- | --- |
| Host | **LAPTOP-BI8P2KF3** · LAN IP **192.168.1.68** |
| API / console | `http://192.168.1.68:9000` / `:9001` |
| Compose | Same digest-pinned **pgsty/minio** + **pgsty/mc** as this PR (**no** host-network override) |
| Credentials | Fresh; kept only on laptop `.env` — **never in repo** |
| Bucket | `podcast-recordings-poc` · CORS `*` · stale MPU expiry **168 h** |
| Smoke | **2026-10-05 ~19:30 CEST** — 40 MB multipart upload via `mc` + read-back · **sha256 match** · object deleted |
| LiveKit | Podcast RTC on the **same host** (ports 7880/7881 + UDP 50000–50200 + harness 5190) |

**Caveat:** Windows firewall allows Docker only on the **Public** profile; Wi-Fi is **Private** → other LAN devices are likely blocked until Loïc approves a Private inbound rule covering TCP **9000/9001** (MinIO) plus LiveKit **7880/7881/5190** and UDP **50000–50200**.

---

> **Pass 1 + 1b + 2a/2b — mostly localhost / headless / synthetic; laptop MinIO smoke only; NOT full Sandbox multi-machine hardware pass.**  
> Préliminaire · 2026-10-05 · Podcast Media · D-01 / [ARCHITECTURE](../docs/ARCHITECTURE.md) §6–7 · MinIO POC : [`spikes/s4/minio/README.md`](./s4/minio/README.md) (**pgsty/minio** verrouillé).

**Overall:** Pass **1 + 1b**: **4/4 locked thresholds PASS on loopback** (resume must still be **re-measured on real uplink**). Pass **2a/2b**: remux + OPFS crash recovery **PASS** on box (localhost). **POC path locked** (Loïc 2026-10-05).

## Draft PASS/FAIL (pass 1, local)

| Criterion | Verdict (pass 1) | Notes |
| --- | --- | --- |
| (a) Browser local recording produces a playable file | **PASS** (caveat) | Raw WebM: `format.duration` **N/A**, DTS warnings; pass **2a** remux → **180.021 s**, **0** seek warnings |
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

- **POC path** — **locked** (see [Verdict](#verdict--recommendation)); WebCodecs/fMP4 documentation only.
- **S4 numeric thresholds** — locked option B; **resumeMs** on **real uplink** still required (loopback pass 1b only).
- **WebCodecs / fMP4** — parallel documentation in [`S4-webcodecs.md`](./S4-webcodecs.md); not the POC implementation path.
- **Windows firewall (laptop)** — Private profile rule for MinIO + LiveKit — pending Loïc.

## Next steps

- **Loïc:** approve laptop **Private** firewall rule if other LAN devices must reach MinIO/LiveKit.
- **Pass 2 (hardware):** real camera/mic, **multi-machine**, low-end **i5** laptop; **re-measure resumeMs** against `192.168.1.68` or production LAN uplink.
- **Productionize remux:** server job using pass **2a** `ffmpeg` recipe; OPFS path from pass **2b** (per locked POC path).
- Remove “preliminary” when Sandbox hardware pass is complete.
