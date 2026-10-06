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

Spike-level lock for the S4 POC; repo ADRs: [DECISIONS.md](../docs/DECISIONS.md) (**D-06**–**D-11**, [PR #13](https://github.com/Sandbox-podcast/Podcast-Studio/pull/13)).

### Decisions 2026-10-06 (Loïc)

- **D-06 — Master HQ:** raw camera + mic; delivery matte = **async server-side re-matting** with RVM (re-mattable master). Browser matted canvas = live / régie preview only.
- **D-07 — Recording codec:** **MediaRecorder VP8/WebM** stays locked; **H.264 (QuickSync)** amendment **not adopted** — remains a **measured option only** in spike docs ([`AB-LAPTOP-RESULTS.md`](./s4/AB-LAPTOP-RESULTS.md) §2026-10-06 night).
- **D-09 — Background tab:** recording gap when the tab is backgrounded → **Phase 1 UI criterion**; track via drop-in watchdog **`results.gaps`** ([#14](https://github.com/Sandbox-podcast/Podcast-Studio/issues/14)).

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

## Real-cam pass 3 (laptop, run 1)

**Label:** Sandbox laptop · Edge harness `:8088` · MediaPipe matted canvas `captureStream(30)` → S4 drop-in v2 → MinIO localhost. **2026-10-05** (~23:03 Paris). Full analysis: [`spikes/s4/REALCAM-RUN1-RESULT.md`](./s4/REALCAM-RUN1-RESULT.md).

| Area | Verdict | Measured facts |
| --- | --- | --- |
| **Pipeline** | **PASS** | Object `spike/s4-dropin/vision-host-1791233953193.webm` **5 304 090** B, **COMPLETE**, 0 incomplete MPUs; download size = list size (**0** byte upload loss). Remux `-map 0 -c copy`: **59.989** s + Cues, wall **0.096** s / CPU **0.099** s |
| **Capture** | **FAIL** | **27.221** s frame hole (PTS **8.061 → 35.282**) from `requestAnimationFrame` pause in a **background Edge tab** (confirmed by Vision) |
| **Loss / bitrate** (full file vs option B) | **FAIL** | Container **0.707** Mbps; active span excl. gap **1.295** Mbps; ~**45.4 %** frame deficit vs 30 fps |
| **Sync** | **N/A** | Video-only (no audio stream) |
| **Resume** | **N/A** | Not exercised |
| **Matte** | — | VP8 **1280×720**, `alpha_mode=1` preserved |

**Drop-in v2** ([`spikes/s4/dropin/`](./s4/dropin/)): concurrent `startSession` / `stopAll`, gap watchdog (>500 ms via `MediaStreamTrackProcessor`), visibility logging, `exportResults()` → `<key>.results.json`.

**Open decision (run 1):** **HQ master = matted canvas vs raw cam+mic + server matte** — take 2 completed below; **still open pending take 3** (fixed matted canvas + in-frame clap).

---

## Real-cam pass 3 (laptop, run 2 — dual raw/matted)

**Label:** Edge harness `?v=s4-dual2` · S4 drop-in v2 dual session · tab **foreground** · ~**23:28–23:29** Paris **2026-10-05**. Full analysis: [`spikes/s4/REALCAM-RUN2-RESULT.md`](./s4/REALCAM-RUN2-RESULT.md).

| Area | raw | matted |
| --- | --- | --- |
| **Duration / fps** | **60.008** s remux; **~30.007** fps effective | **60.029** s; **~30.016** fps |
| **Gaps** | max **53** ms; none **>200** ms; watchdog `[]` | max **47** ms; same |
| **Upload** | **0** byte loss (**19 484 895** B) | **0** byte loss (**14 756 998** B) |
| **Loss / bitrate (option B)** | **PASS** / **2.598** Mbps | **PASS** / **1.967** Mbps |
| **Content (HQ master)** | **PASS** (real LifeCam) | **FAIL** — Vision **S3 synthetic smoke** canvas, not MediaPipe composite |
| **Sync** | **N/A** (intra-file clap: hands out of frame) | **N/A** (no subject in video) |
| **Resume** | **N/A** | **N/A** |

**Cross-file audio (shared mic):** matted lags raw by **+80.0** ms (normalized cross-correlation). Not a locked threshold verdict.

**vs run 1:** Foreground tab — **no** **27.221** s `requestAnimationFrame` freeze reproduced; watchdog gaps empty.

**Master-HQ decision:** **[D-06](../docs/DECISIONS.md)** (Loïc **2026-10-06**); run 4 evidence below.

---

## Real-cam pass 3 (laptop, run 3)

**Label:** Edge `?v=s4-matfix2` · dual raw/matted · tab foreground · ~**00:06:29–00:07:29** Paris **2026-10-05**. Full analysis: [`spikes/s4/REALCAM-RUN3-RESULT.md`](./s4/REALCAM-RUN3-RESULT.md).

| Area | raw | matted |
| --- | --- | --- |
| **Duration / fps** | **~59.934** s remux; **~30.000** fps | **~60.024** s; **~30.005** fps |
| **Gaps** | max **52** ms; none **>200** ms | max **48** ms; same |
| **Upload** | **0** byte loss (**17 797 685** B) | **0** byte loss (**18 272 786** B) |
| **Loss / bitrate (option B)** | **PASS** / **~2.376** Mbps | **PASS** / **~2.435** Mbps |
| **Smoke canvas (run 2 bug)** | — | **PASS** (fixed) |
| **Content (HQ master)** | Real full-frame cam | **FAIL** — **Mock backend** ellipse (fixed circular crop, opaque RGB outside); **not** MediaPipe person matte |
| **Audio in WebM** | **None** (despite `audioTracks:1` in telemetry) | **None** |
| **Sync** | **N/A** (no audio stream) | **N/A** |

**Root cause (Vision):** shared mic track with LiveKit — fix path: **dedicated mic clones** + Mock→MediaPipe default (`?v=s4-matfix3`).

**Visual clap (cross-file, moderate confidence):** raw **1667** ms vs matted **1567** ms → Δ **−100** ms (matted earlier). Not an audio-lag measurement (no Opus in files).

### Recorder v2.1 audio guard (box tests)

[`run-audio-guard-test.mjs`](./s4/dropin/run-audio-guard-test.mjs) on the shared box:

| Case | Result |
| --- | --- |
| **Live** WebAudio mic-like | **600** samples seen; first at **44** ms; **vp8+opus** in output |
| **Ended-at-start** track | `audioMissing`; completion refused |
| **Stop mid-take** | `track_ended` issue at **2515** ms |

---

## Run 4 (real cam, MediaPipe, dual canvas)

**Label:** Edge `?v=s4-matte7` · drop-in v2.1 · MediaPipe · per-recording mic clone · ~**60 s** Paris **2026-10-05**. Details: [`spikes/s4/RESULT-RUN4.md`](./s4/RESULT-RUN4.md).

| Area | raw | matted |
| --- | --- | --- |
| **Option B sync** | **PASS** (~**25** ms intra A/V) | **PASS** (~**11** ms) |
| **Loss ≤ 1 %** | **PASS** (**0.53** %) | **FAIL** (**53** % vs 30 fps; ~**14** fps effective, median frame Δ **74** ms — offscreen `recordCanvas` at MediaPipe paint rate; **no** holes **>200** ms; not fixed this night) |
| **Bitrate ≥ 1 Mbps** | **PASS** (**2.63** Mbps) | **PASS** (**1.72** Mbps) |
| **Upload / Opus** | **0** byte loss; Opus; **923** audio samples | same (**916** samples) |
| **Alpha** | opaque | **real** VP8 alpha (~**47** % transparent / **24** % opaque / **30** % partial mean, libvpx decode) |

**Master-HQ ([D-06](../docs/DECISIONS.md), Loïc 2026-10-06):** **raw cam+mic** = master HQ; **async server re-matting** with RVM on raw; browser **matted canvas** = live / régie preview only. Cost/throughput: [`spikes/s4/S5-RVM-COST.md`](./s4/S5-RVM-COST.md) — measured box **RVM mobilenetv3** CPU Xeon 8c **17.26** fps / **104** s per minute; Vision laptop ~**19.8** fps / ~**91** s per minute = **Iris Xe (iGPU) via DirectML, CPU-bound pipeline** (relabelled 2026-10-06 02:18: DML device 0 is the Iris Xe, not the 3070); clean **RTX 3070** DirectML run (variant C, ds 0.4) **113** s/min total / **69** inference-only, GPU 8–38 % util → all s/min are CPU-bound, €/episode = **pessimistic upper bound** (EU GPU list prices fetched **2026-10-06**; L4/L40S throughput rows are **unsourced estimates**, labelled in that doc).

**RVM checkerboard (Designer):** grade **near-PASS** (not a hard PASS) — halo on hair and a few leaks on arm/torso at **45** s visible on checker; hands OK; still clearly better than browser v8. Final quality call still **open** (flicker clip pending; Loïc decides). Assets: [`run4/media/server-matte/`](./s4/run4/media/server-matte/).

**RVM variants (box CPU, Xeon 8c, no GPU — [`RESULT-RUN4.md` §8](./s4/RESULT-RUN4.md)):** mobilenetv3 ds0.375 **104** s/min; ds0.4 **112** s/min; resnet50 ~**191** s/min (extrapolated **15–55** s). Variant **E** (ds0.4 + white despill + 1 px alpha erosion) best on proxies: hair semi-transparent luma **−26** %, arm/torso gap alpha **0.61→0.56**, ~**+7** % compute vs baseline. **Designer (variants):** **E** confirmed best — hair halo clearly improved; arm/torso leak at **45** s still open → **near-PASS (improved)**, not a hard PASS. **D** resnet50 = **NO-GO** on cost/quality.

**E2 colour (box CPU):** Loïc’s hair is naturally grey-white; E’s despill **darkens the semi-transparent band** (CIEDE2000 ΔE band **16.1** vs **5.6** for A at t=**45** s; opaque pixels unchanged, ΔE ~**1.46**) — the “halo luma” proxy conflates spill removal with real hair colour ([§8 E2](./s4/RESULT-RUN4.md)). **E2-fgr** (RVM `fgr` in band + erosion only where α&lt;0.5): ΔE band **5.2**, halo luma **163**, gap α **0.58**, ~**156** s/min box CPU (C **111.5** + **25** ms/frame post). **Designer (Akasha, 01:35, POC look only):** **E2-fgr** visual **LOCK** (“chrome POC”); **E** = colour **FAIL** (greyed hair fringe); **E2b** acceptable fallback; arm/torso leak @**45** s → backlog **P1**. **E2b** (temporal bg, no erosion): best ΔE band (**3.7**) at **213** s/min box CPU. [`run4/media/server-matte/variants/e2/`](./s4/run4/media/server-matte/variants/e2/) · [`rvm-variants/e2/`](./s4/rvm-variants/e2/). Master HQ: **[D-06](../docs/DECISIONS.md)**.

**Designer flicker verdict (2026-10-06 02:25, clip 25–40 s, E2-fgr on checker):** E2-fgr **PASS on stills, FAIL in motion** — **ghost hand** during a fast gesture (~**33–34** s of source): palm semi-transparent, checkerboard visible through it, white patch of the original background leaking beside it. Hair edge shimmers slightly frame to frame (minor). Cause attributed to the **model under motion blur**, not the post-process → **E2-fgr stays the POC post-process**. **Fast gestures = P1**, blocking the quality of the **delivered matte** (same level as the **45** s arm/torso leak); **not** blocking a raw HQ master (argues for keeping raw so it can be re-matted later). **Next:** Vision CUDA run (tomorrow) compares `downsample_ratio` **0.4 / 0.6 / 1.0** on 25–40 s (same instants **32** s and **33.2–34.0** s side by side, with s/min per ds); **temporal mask** is the next lead if needed.

## LAN multi-machine pass

### Protocol (pending Loïc’s firewall OK)

**Status:** not run — **no numbers yet**. Blocks on laptop **Private** firewall approval so other LAN clients can reach MinIO + LiveKit (see [Open decisions](#open-decisions)).

**Context (RTC):** PR **#3** five-person soak ([commit `82eaa91`](https://github.com/Sandbox-podcast/Podcast-Studio/commit/82eaa91)) showed live HD often capped by **client CPU**, not SFU headroom: `outbound-rtp` `qualityLimitationReason` dominated by **`cpu`** (**55** % of **880** samples); LiveKit SFU CPU ~**25** % on that run.

**Load model (each real client):** two encoders at once — (1) **local HQ** `MediaRecorder` (raw cam+mic, optionally matted preview path) and (2) **simulcast publish** to the SFU.

**Protocol (per client machine, same time window):** **A/B** — local HQ recording **on** vs **off**. While publishing, capture:

- `outbound-rtp` **`qualityLimitationReason`** and **`qualityLimitationDurations`**
- Sent **resolution / fps** per simulcast layer
- **Browser process CPU**

On the HQ file (when recording is on), run the **S4 gates**: sync **≤ 100 ms**, loss **≤ 1 %**, bitrate **≥ 1 Mbps**, plus the shared **distinct-frame** criterion (**≥ 24** distinct fps in **1 s** windows; see [Distinct-frame criterion](#distinct-frame-criterion-24-distinct-fps)).

**Goal:** determine whether local HQ recording taxes live HD simulcast, and whether heavy live publish limits HQ capture quality — bidirectional interaction, not assumed.

### Distinct-frame criterion (≥24 distinct fps)

**Agreed team bar** (Media / RTC / Vision / Designer): in each **1 s** window, count **near-distinct** frames (threshold **0.5** MAD on gray, not container `nb_frames`). Report **`windows_1s_share_ge24`** (share of windows with ≥ 24 near-distinct frames), plus **min**, **median**, **p5**, and **`windows_1s_lt24_count`**. Exact-hash window stats are kept as `*_exact` for comparison only — do **not** use exact-hash share for live/regie PASS/FAIL ([issue #10](https://github.com/Sandbox-podcast/Podcast-Studio/issues/10)).

**Read share ≥ 24 RELATIVE to the source ceiling** on the same take (e.g. received stream share ÷ source share). A fixed **0.95** of source is the Designer bar for régie cadence when applied. **Threshold sensitivity:** on VP8 2L-on received, share≥24 goes **0.843 @ 0.5 → 0.950 @ 0.3 → 0.967 @ 0.2** (source unchanged) — see [`AB-LAPTOP-RESULTS.md`](./s4/AB-LAPTOP-RESULTS.md).

**Tool:** [`tools/distinct_fps.py`](../tools/distinct_fps.py) (v2: native per-frame size, near-dup windows) · fixtures [`tools/testdata/`](../tools/testdata/) (synthetic `dup15_from30.mp4` + JSON only — no camera footage in repo).

```bash
python3 tools/distinct_fps.py --threshold 0.5 --json-out r.json file.webm
python3 tools/distinct_fps.py --size-mode first file.webm   # v1-compatible decode
python3 tools/distinct_fps.py --dump-pairs pairs.json file.webm
```

Decode uses **`-fps_mode passthrough`**; default **`--size-mode native`** keeps each frame at its own size (simulcast layer switches). **`--size-mode first`** reproduces v1 (implicit rescale to frame 0).

**Run 4 (take 4, threshold 0.5):** raw **29.8** distinct fps, **100** % of 1-s windows ≥ 24 (min **28**); matted **14.0**, **0** % (min **12**). Synthetic doubled-frame clip (`dup15_from30.mp4`): **15.0** distinct fps.

**Calibration (after VP8 re-encode):** exact pixel/hash match catches **0/30** intentional duplicate pairs — **near-duplicate** count is the metric. Mean-abs-diff on full-frame gray (**p50 / p95**): true distinct talking-head **1.02 / 2.90**; intentional dups @ VP8 **1.5 Mbps** 720p **0.31 / 0.92**; dups @ **150 kbps** 320×180 **0.26 / 1.30**. Threshold **0.5** catches ~**87** % of dups @ 1.5 Mbps with ~**8** % false-dup on talking-head consecutive frames → **undercounts conservatively** (won’t fake-pass a half-rate stream).

**Limitation:** static scenes are not measurable — truly distinct frames can look like duplicates when motion is minimal.

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
