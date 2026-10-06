# S4 laptop A/B — measured results (box analysis)

**Label:** single run per condition · **one laptop** · **loopback** · not a multi-machine LAN pass.  
**Generated:** 2026-10-06 (Paris). Measured numbers below are from this run set unless marked **ESTIMATE**.

> **S4 POC lock (Loïc 2026-10-05):** MediaRecorder **WebM VP8+Opus** + server remux + OPFS remains **locked**.  
> **H.264 for the HQ master** = **amendment** to that lock (container **mkv/mp4**, not WebM) — **option only**, not decided.

---

## 1. Régie cadence vs take-4 source ceiling (issue #10)

Box analysis **2026-10-06 ~03:45**. Inputs: `/workspace/s1-soak/ab/run-003936/` (VP8 publish) + `/workspace/s1-soak/ab/run-010706-h264/` (harness `codec h264`).  
**Note:** received `*-sub-hi-rx.webm` files in the "h264" run are **VP8** (ffprobe); "h264" = publish codec — subscriber `MediaRecorder` still writes VP8.

**Methods** (near-dup threshold **0.5** unless stated; tool = [`tools/distinct_fps.py`](../../tools/distinct_fps.py) **v2** after issue #10 fix):

| label | meaning |
|---|---|
| **v1 as-is** | `--size-mode first`: all frames rescaled to frame-0 size; 1 s windows on **exact-hash** distinct (issue #10b artefact) |
| **v2 native** | default: per-frame native size (`-noautoscale`); 1 s windows on **near-distinct** |
| **v1 decode + near windows** | v2 with `--size-mode first` (isolates size effect) |
| **complete windows** | v2 native excluding final partial window |

| condition | size segs | v1 median | v1 share≥24 | v1 ratio | v2 near fps | v2 median | v2 share≥24 | v2 p5 | v2 &lt;24 | **v2 ratio vs source** | v1-decode+near share | v2 complete-win share (&lt;24/n) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| SOURCE take4 raw | 1 | 30 | 1.000 | 1.000 | 29.84 | 30 | 1.000 | 29.0 | 0/60 | **1.000** | 1.000 | 1.000 (0/59) |
| VP8 2L-off | 1 | 30 | 0.975 | 0.975 | 26.26 | 27 | 0.877 | 19.1 | 15/122 | **0.877** | 0.877 | 0.884 (14/121) |
| VP8 2L-on | 2 | 29 | 0.984 | 0.984 | 25.48 | 26 | 0.843 | 17.0 | 19/121 | **0.843** | 0.826 | 0.850 (18/120) |
| VP8 3L-off | 2 | 30 | 1.000 | 1.000 | 26.09 | 27 | 0.853 | 17.0 | 18/122 | **0.853** | 0.853 | 0.860 (17/121) |
| VP8 3L-on | 3 | 30 | 0.818 | 0.818 | 23.30 | 25 | 0.603 | 7.0 | 48/121 | **0.603** | 0.579 | 0.608 (47/120) |
| h264-run 2L-off | 1 | 30 | 1.000 | 1.000 | 26.93 | 27 | 0.959 | 24.0 | 5/122 | **0.959** | 0.959 | 0.959 (5/121) |
| h264-run 2L-on | 2 | 30 | 0.992 | 0.992 | 24.91 | 26 | 0.779 | 14.1 | 27/122 | **0.779** | 0.779 | 0.785 (26/121) |
| h264-run 3L-off | 7 | 27 | 0.615 | 0.615 | 20.92 | 22.5 | 0.467 | 4.1 | 65/122 | **0.467** | 0.434 | 0.467 (65/122) |
| h264-run 3L-on | 3 | 30 | 0.843 | 0.843 | 20.17 | 21 | 0.355 | 4.0 | 78/121 | **0.355** | 0.331 | 0.358 (77/120) |

**Designer criterion (2L-on share ≥ 95 % of source share; source share = 1.000):**

- **v2 native:** VP8 2L-on **0.843 → FAIL** (ratio 0.843); complete windows **0.850 → FAIL**. "h264" run 2L-on **0.779 → FAIL**.
- **v1 as-is (exact basis):** VP8 2L-on **0.984 → would PASS** — issue #10 (b): exact hashes of re-encoded repeats never match.

**Size effect (issue #10a):** v1-decode vs v2-native near fps differ by **0.14–0.50 fps** on multi-segment streams; share moves by up to **0.033**.

### Threshold sensitivity (VP8 2L-on received stream)

| thr | near fps | share≥24 | median | p5 | &lt;24 | min |
|---:|---:|---:|---:|---:|---:|---:|
| 0.5 | 25.477 | **0.843** | 26.0 | 17.0 | 19 | 6 |
| 0.3 | 27.741 | **0.950** | 28.0 | 24.0 | 6 | 12 |
| 0.2 | 28.421 | **0.967** | 29.0 | 25.0 | 4 | 16 |

At **0.3** VP8 2L-on share reaches **0.950** (borderline vs 95 % of source); at **0.2**, **0.967**. Source ceiling unchanged at any threshold.

### Loop-point artefact (28–34 s / 88–94 s)

Windows &lt;24 cluster at **28–34 s** and **88–94 s** (60 s apart = source length), plus 2–4 s, 20 s, and the final partial window. Publisher file source **loops** at rx ~**34.5 s** and ~**94.5 s** (rx 34 s → source last frame **59.92 s**; rx 35 s → source **0.27 s**).

- Window **34 s:** 23 near-dups flagged — **all same source frame (1790)**; last-frame hold at file-loop boundary (**test harness**, not network).
- Most confident dups are **real repeats**; deficit is partly **loop boundary**, not SFU cadence alone.

**Recommendation:** next A/B uses a **non-looping** source or **excludes ±3 s** around the loop before applying the 95 % criterion.

---

## 2. ab-run1 — S4 HQ local recording gates

**Generated 2026-10-06T03:33:10** (box). Filter `ab-`, source `inbox`. **Four** `ab-*` raw HQ recordings (**120 s** each).

| condition | duration | loss vs 30 fps | bitrate | distinct near(0.5) · win≥24 (min) | upload | A/V sync (clap) |
|---|---|---|---|---|---|---|
| ab-file-2L-on-h264 | 119.997 s PASS | 0 % PASS | 2.86 Mbps PASS | 28.596 · **1.0** (min 28) PASS | complete OK | N/A |
| ab-file-2L-on | 120.001 s PASS | 0 % PASS | 2.862 Mbps PASS | 28.517 · **1.0** (min 31) PASS | complete OK | N/A |
| ab-file-3L-on-h264 | 120.007 s PASS | 0 % PASS | 2.862 Mbps PASS | 28.624 · **1.0** (min 31) PASS | complete OK | N/A |
| ab-file-3L-on | 119.999 s PASS | 0 % PASS | 2.863 Mbps PASS | 28.446 · **1.0** (min 31) PASS | complete OK | N/A |

**Verdict:** **S4 HQ rec gates PASS** on all four: **120 s**, **0 %** loss, **~2.86 Mbps**, **~28.5** near-distinct fps, upload complete. **Sync not measurable** (no clap). Remux rc 0, setts, 0 warnings (per-file detail in source `ab-run1-report.md`).

---

## 3. H.264 MediaRecorder probe (Edge 154 laptop) + box remux

**UA:** HeadlessChrome/Edg **154** · **15 s** @ 2.5 Mbps (probe run). See tooling [`h264-probe/`](./h264-probe/README.md).

### Measured (laptop probe + box `remux_check.py`)

| finding | measured |
|---|---|
| `video/webm;codecs=h264` supported | **True** |
| Recorder output for that mime | **`video/x-matroska;codecs=avc1,opus`** (not WebM) |
| Profile | **Constrained Baseline** |
| Remux H.264 → **webm** | **FAIL** (VP8/VP9/AV1 only in WebM) |
| Remux H.264 → **mkv** / **mp4** | **OK** |
| Remux VP8 → **mp4** | **FAIL** (expected) |
| Publisher CPU (1-core median, probe PIDs) | VP8 **~104 %** vs H.264 **36–44 %** |
| GPU VideoEncode / NVENC (filtered to probe PIDs) | **0 %** in this 15 s headless run |

### Not decided yet

- **Hardware vs software** encode path for MediaRecorder H.264 — **not decided**; **60 s unfiltered** rerun pending (`run-probe.ps1 -Only h264 -Secs 60 -Both`).
- Probe used **headless synthetic canvas** → **loss gate not meaningful** on the 15 s clips (high loss % in table); bitrate/distinct on remuxed outputs are probe sanity only.

Full mime matrix and per-file rows: see embedded `remux-report.md` content in repo history / box `remux-report.json` from the run folder.

---

## 2026-10-06 night: MediaRecorder H.264 (QuickSync) check + H.264-rec A/B (indicative, 1 run)

Tooling: [`h264-probe/v3/`](./h264-probe/v3/) (`hw-check-v3.mjs`, `sample-gpu-v3.ps1`, `README-v3.md`; run [`runs/hwv3-headed/results.json`](./h264-probe/v3/runs/hwv3-headed/results.json)). Back-and-forth A/B reports: [`ab-reports/ab-pp-vp8-rec.md`](./ab-reports/ab-pp-vp8-rec.md), [`ab-reports/ab-pp-h264-rec.md`](./ab-reports/ab-pp-h264-rec.md).

- **Positive control (VideoEncoder avc1, 20 s each):** prefer-hardware **26.5 %** of one core vs prefer-software **46.9 %**. The Intel Iris Xe exposes **no** `VideoEncode` engine type in Windows GPU counters (only VideoDecode ×2, VideoProcessing, 3D, Copy); VideoEncode exists only on the RTX 3070, so earlier “0 % VideoEncode” readings only proved **no NVENC**.
- **HW-check v3 (headed, per-phase, our tab’s Intel VideoDecode utilisation / CPU of one core):** ve-avc1-hw **6.2 % / 50.6 %**; mr-h264 **5.7 % / 62.8 %**; mr-vp8 **1.0 % / 98.6 %**; ve-avc1-sw **0.9 % / 71.8 %**. NVENC **0**. **Conclusion:** Edge MediaRecorder `video/webm;codecs=h264` uses **Intel QuickSync** (encode work shows under the VideoDecode engine on this iGPU). Machine was busier during this run (**56 %** system CPU at idle). This corrects the earlier “likely software” hint.
- **Edge output** for `video/webm;codecs=h264` is **Matroska/avc1 Constrained Baseline** (file still named `.webm`); remux to webm **fails**, mkv/mp4 **OK**; drop-in **v2.2** ([#11](https://github.com/Sandbox-podcast/Podcast-Studio/issues/11)) and [`analyze_ab.py`](./analyze_ab.py) handle it.
- **S4 gates on the VP8 rec** of the back-and-forth 2L-on run (**04:02**): **PASS** (1280×720 VP8, **120.0 s**, loss **0.15 %**, **2.64 Mbps**, near-distinct **28.4 fps**, all 1 s windows ≥24).
- **S4 gates on the H.264 rec** of the back-and-forth 2L-on run (**04:37**, `recorderMimeType` `video/webm;codecs=h264`): **PASS** on all measurable gates (1280×720 H.264 CB, **120.0 s**, loss **0.03 %**, max gap **52 ms**, **2.68 Mbps**, upload complete local=remote, all **120** one-second windows ≥28 exact-distinct frames incl. 90–120 s). Near-distinct at 0.5 = **26.5 fps** vs **28.4** for VP8 rec (cause unverified; exact-distinct **30.0**, no frame loss). A/V sync not measurable (no clean clap).
- **Live side** of that run (measured by Podcast RTC, PR #3 `769e6b7`; judged by Designer): share≥24 at **0.3** = **0.70** vs **0.93** with VP8 rec; HD layer still **640×360** median; drop concentrated in last ~**30 s** with machine at **70–85 %** CPU, cause **NOT VALIDATED**. **Lead synthesis (pre-decision):** H.264 rec showed **no live benefit** on 1 run; the only argument for an S4 amendment is the **rec-only CPU gain**.

### Decisions 2026-10-06 (Loïc)

Recorded in [DECISIONS.md](../../docs/DECISIONS.md) via [PR #13](https://github.com/Sandbox-podcast/Podcast-Studio/pull/13) (**D-06**–**D-11**):

- **D-06:** master HQ = **raw camera + mic**, re-mattable **async server-side RVM** matte.
- **D-07:** recording codec stays **MediaRecorder VP8/WebM**; **H.264 (QuickSync) amendment not adopted** — documented here as a measured option only.
- **D-09:** **background-tab** recording gap → **Phase 1 UI criterion**, tracked in [#14](https://github.com/Sandbox-podcast/Podcast-Studio/issues/14) using drop-in **`results.gaps`**.

---

## Related

- A/B analyzer: [`analyze_ab.py`](./analyze_ab.py) (`--source inbox`, filter `ab-`)
- Distinct-frame tool fix: **Fixes #10** — [`tools/distinct_fps.py`](../../tools/distinct_fps.py)
- Criterion doc: [`S4-recording.md`](../S4-recording.md) § Distinct-frame criterion
- LAN multi-machine protocol (pending): same parent doc
- H.264 hw-check v3: [`h264-probe/v3/`](./h264-probe/v3/)

---

## 2026-10-06 daytime: S4 HQ rec vs live (cam A/B pairs) + LAN upload desktop-ai → MinIO (indicative, 1 run each)

Box analysis, single run per condition. **Measured numbers only.** Reports: [`ab-reports/2026-10-06-cam3L-1101.md`](./ab-reports/2026-10-06-cam3L-1101.md) · [`ab-reports/2026-10-06-pair-1132-1135.md`](./ab-reports/2026-10-06-pair-1132-1135.md) · [`ab-reports/2026-10-06-solo-1150-1154.md`](./ab-reports/2026-10-06-solo-1150-1154.md) · [`lan-upload/REPORT-desktop-ai.md`](./lan-upload/REPORT-desktop-ai.md). Tools: [`tools/capture_loss.py`](./tools/capture_loss.py), [`tools/pair_windows.py`](./tools/pair_windows.py), [`analyze_ab.py`](./analyze_ab.py), [`../../tools/distinct_fps.py`](../../tools/distinct_fps.py) v2. Live-side series: Podcast RTC, PR #3 (`d763ad0` pair, `65dba99` solo). No camera footage committed.

**Capture-relative loss (new metric, published alongside raw loss; lead-approved).** For each pair of consecutive RTC `media-source` samples: *expected* = delta of the cumulative `src_frames` counter (frames captured by the camera; not the plain fps field), *written* = rec frames whose pts fall in the same interval (aligned with `recording.wallStartIso` and the CSV `ts` stats timestamp); only intervals fully inside the rec are used. **capture-relative loss = Σ max(0, expected − written) / Σ expected** (net = (Σ expected − Σ written) / Σ expected; *noise floor* = same clipped value on intervals where both are ≥ 28 fps, i.e. ±1-frame boundary jitter). **The S4 gate is unchanged:** raw loss = max(0, 1 − video packets / (container duration × 30)) **≤ 1 %** and no gap > 200 ms.

| run (Paris) | setup | raw loss (gate) | capture-relative (net / floor) | distinct fps exact / near · share≥24 | rec during live high-layer cut |
|---|---|---|---|---|---|
| cam-3L-on 11:01 | laptop, no 2nd publisher | 0.51 %, max gap 162 ms — PASS | N/A (no media-source sampling) | 29.862 / 29.837 · **0.992** | no cut |
| cam-2L-on 11:32 | + desktop-ai 2nd publisher | **1.10 %**, 3 gaps > 200 ms — **FAIL** | **0.32 %** (−0.06 % / 0.30 %) | 29.679 / 29.654 · 0.983 | cut RTC 10.8–47.7 s: rec **30.00** distinct fps, 1280×720 |
| cam-3L-on 11:35 | + desktop-ai 2nd publisher | **2.35 %**, 400 ms gap — **FAIL** (+ watchdog gap 533 ms) | **0.24 %** (−0.09 % / 0.09 %) | 29.304 / 29.279 · 0.958 | cut RTC 51.7–110.7 s: rec **30.00** distinct fps, 1280×720 |
| cam-2L-on 11:51 (solo) | laptop only | **2.87 %**, 1 gap 224 ms (= camera dip) — **FAIL** | **0.413 %** (−0.177 % / 0.359 %) | 29.146 / 29.121 · 0.950 | cut RTC 87.0–121.5 s: rec **30.00** distinct fps (30.03 by pts), 1280×720 |
| cam-3L-on 11:54 (solo) | laptop only | 0.04 %, max gap 79 ms — **all gates PASS** | **0.115 %** (−0.086 % / 0.115 %) | 29.992 / 29.959 · **1.000** | no cut |

- Every rec dip lines up (same 2 s interval, ±1–3 fps) with a **camera capture dip** in RTC's `media-source` series (e.g. solo 2L: capture 16.5 fps vs rec 16.7 at RTC 31.8–33.9 s; pair 3L: 15.2 vs 14.5 at 28.8–31.0 s). Over the covered spans the camera itself delivered 29.07–29.96 fps, which accounts for the raw-loss gap to 30 fps. Upload complete, local = remote, on all five recs.
- The **live** high layer was suspended by the publisher bandwidth estimator (`qualityLimitationReason=bandwidth`) in pair 2L/3L and solo 2L, also **without** a 2nd publisher (solo 2L). Each switch to bandwidth fell in an interval with a camera capture dip, but 2 deeper camera dips triggered no switch. **Cause: NON VALIDÉE.** The local HQ rec (separate MediaRecorder encoder) stayed 1280×720 ~30 distinct fps through every cut.
- **LAN upload desktop-ai (2.5GbE) → laptop MinIO (Wi-Fi), presigned SigV4 multipart, 5 MiB parts:** 64 MiB sequential **332 Mbps**, 256 MiB sequential **441 Mbps**, 256 MiB with 4 parts in flight **642 Mbps**; resume after a simulated client cut: restart → complete **1.44 s**, only missing parts re-sent; HEAD size/ETag and GET-back **sha256 match** on all 4 objects; test objects deleted, no pending uploads. No MinIO credentials on desktop-ai; signed URLs not kept.

---

## 2026-10-06 evening: alternating seq 17:07 (2L-a · 3L-a · 2L-b · 3L-b), laptop only, 1 s sampling (indicative, N=2 per condition)

Box analysis, one run per condition and pass. **Measured numbers only.** Report: [`ab-reports/2026-10-06-seq-170746.md`](./ab-reports/2026-10-06-seq-170746.md). Tools: [`tools/seq_windows.py`](./tools/seq_windows.py), [`tools/capture_loss.py`](./tools/capture_loss.py), [`analyze_ab.py`](./analyze_ab.py), [`../../tools/distinct_fps.py`](../../tools/distinct_fps.py) v2. Live-side series: Podcast RTC, PR #3 commit `b8c06c9` (`results-20261006-1707-seq/`). No camera footage committed. Ok Loïc 18:31 Paris.

**S4 gates: 4/4 PASS.** Raw loss 0.01 / 0.08 / 0.02 / 0.03 % (max gap 60–79 ms, 0 holes > 200 ms); distinct fps exact = near (0.3 and 0.5) 30.000 / 29.995 / 30.004 / 29.996; share of 1 s windows ≥24 = **120/120** on all 4 counts; bitrate 2.616 / 2.623 / 2.628 / 2.613 Mbps; 1280×720 constant; upload complete local=remote; watchdog gaps [].

**Rec unaffected by 2L live degradation.** 2L-a: rid-h cut RTC t=1→27 then ramp to t≈42 — rec mean distinct fps **30.00** inside cut, **30.00** in ramp, **30.00** outside (≤0.03 fps by pts). 2L-b: rid-h 720p30 under target until t≈50 (1.085–1.576 Mbps) — rec **30.02** vs **30.00** after. 3L control over the same windows 29.99–30.04. No rec-side 2L vs 3L difference measured (bitrate, raw loss, share≥24, net capture-loss all overlap).

**Capture-relative loss — report net (lead adoption 17:45).** Clipped at 1 s sampling equals the noise floor (0.812 / 1.065 / 0.981 / 1.262 %) and **must not be used as a gate** (boundary ±1-frame bias ~2× larger than at 2 s; 3L clipped >1 % with zero frames missing). **Net:** −0.084…0.000 % (2L-a 0.000, 3L-a 0.000, 2L-b −0.056, 3L-b −0.084). Matches RTC. Camera dips <24: 0/480 samples.

**Lead D-12 = 3L for live (indicatif, N=2).** Both 3L runs clean (720p30, QLR none); both 2L runs started with low/slow BWE (2L-a QLR bandwidth ≈54 s, 2L-b under target to t≈50). S4 HQ master validated indicative on this sequence (decoupled from live).
