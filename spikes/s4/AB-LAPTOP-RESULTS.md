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

## Related

- A/B analyzer: [`analyze_ab.py`](./analyze_ab.py) (`--source inbox`, filter `ab-`)
- Distinct-frame tool fix: **Fixes #10** — [`tools/distinct_fps.py`](../../tools/distinct_fps.py)
- Criterion doc: [`S4-recording.md`](../S4-recording.md) § Distinct-frame criterion
- LAN multi-machine protocol (pending): same parent doc
