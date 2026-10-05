# S4 real-cam TAKE 4 — dual session (`?v=s4-matte7`, MediaPipe live + Opus)

**Label:** Laptop / Edge `?v=s4-matte7` / S4 drop-in **v2.1** / MediaPipe backend / dual canvas (matted = transparent offscreen `recordCanvas`) / per-recording mic clone / LiveKit parallel  
**Full take (Paris):** Loïc « fini » ~**00:50** · raw key `…0416301` / matted `…0417028` (start Δ **727 ms**) · ~**60 s**  
**Analyst:** Podcast Media · objects **left in bucket**  
**Vision cite:** Playwright v8 on run4-raw `fpsAvg 24.6 / p5 18`; Designer FAIL live guest on v8 (halo, hair fringe, fingers). Soft lean master HQ = raw — Loïc decides.

## 0. Objects

| | Key | Size |
|---|---|---:|
| raw | `spike/s4-dropin/vision-host-raw-1791240416301.webm` | **19719798** |
| matted | `spike/s4-dropin/vision-host-matted-1791240417028.webm` | **12879521** |

+ `.results.json` each. Local: `run4/media/` (alongside Vision; nothing deleted).

## 1. Content + alpha

| | raw | matted |
|---|---|---|
| Person silhouette | full frame | **yes** (MediaPipe person) |
| Quality (Designer/lead) | N/A | staircase edges, grey hair fringe, screen leak BR, gesture holes |
| Alpha (`-c:v libvpx` → RGBA) | opaque 100% | **real** (mean ~47% transparent / 24% opaque / 30% partial over 6 frames) |
| Naive decode | opaque | **flattens** alpha |
| `alpha_mode` | 1 | 1 |

Contact (live Edge matted vs raw): `run4/contact/contact-matted.png`, `contact-raw.png`.

## 2. Telemetry / remux / audio

| | raw | matted |
|---|---|---|
| local=remote | **19719798** | **12879521** |
| gaps / visibility | [] / visible@0 | [] / visible@0 |
| results.audio | samplesSeen **923**, first **675 ms**, issues [] | **916**, **579 ms**, [] |
| completeOk / audioMissing | true / false | true / false |
| ffprobe audio | **opus** mono 48 kHz | **opus** mono 48 kHz |
| duration remux | **60.018 s** | **60.088 s** |
| Cues | yes | yes |
| bitrate | **2.628 Mbps** | **1.715 Mbps** |
| packets / eff fps | **1791 / 29.875** | **843 / 14.041** |
| gap max / >200 ms | 84 ms / **0** | 130 ms / **0** |
| lossPct vs 30 fps | **0.53%** | **53.2%** |

**Take-3 audio blocker fixed** (Opus in both files + watchdog).

## 2b. Matted cadence (known issue — no fix work here)

Packet Δt histogram confirms Vision’s paint-rate hypothesis:

| | raw | matted |
|---|---|---|
| median Δt | **33 ms** (~30 fps) | **74 ms** (~13.5 fps) |
| frac in 20–40 ms | **85.5%** | **9.3%** |
| frac in 55–80 ms | **0.9%** | **47.4%** |
| holes >200 ms | **0** | **0** |
| near-dup Δt&lt;1 ms | 0 | 0 |

Even spacing ~71 ms mean, **not** bursty/duplicated — canvas/`captureStream` advances when MediaPipe paints (~14 fps), not a forced 30 Hz clock. Tracked as **known issue** for Vision (flicker clip owned by Vision). Option B loss vs 30 fps: matted **FAIL 53%**; raw **PASS**.

## 3. Sync (clap visible)

| | |
|---|---|
| Audio onset | raw **1957.5 ms** · matted **1277.5 ms** |
| Visual clap | raw **~1933 ms** · matted **~1267 ms** |
| Intra A/V | raw **+24.5 ms** · matted **+10.5 ms** |
| Cross wall audio Δ | **+47 ms** |
| Resume | N/A |

Stills: `run4/raw-clap-1933ms.png`, `run4/matted-clap-1267ms.png`.

## 4. Option B verdicts

| Criterion | raw | matted |
|---|---|---|
| Sync ≤100 ms | **PASS** | **PASS** |
| Resume ≤15 s | N/A | N/A |
| Loss ≤1% (vs 30 fps) | **PASS (0.53%)** | **FAIL (53%)** — cadence known issue |
| Bitrate ≥1 Mbps | **PASS 2.628** | **PASS 1.715** |
| Upload / watchdog | **PASS** | **PASS** |
| Opus + audio guard | **PASS** | **PASS** |
| Matte quality for S2 HQ | — | **FAIL** (silhouette yes; edges/hair/leak no) |

## 5. Master recommendation (data; Loïc decides)

**Confirm soft lean:** raw cam+mic = **master HQ**; live matted canvas = régie/LiveKit only until fps+quality bar clear. Server RVM on raw is the delivery-matte path (see §6 + `S5-RVM-COST.md`).

## 6. Server RVM — box CPU (measured) + Vision laptop (cite)

| Source | Hardware | wallFps | s compute / min footage | realtime | notes |
|---|---|---:|---:|---:|---|
| **Box (this run)** | Intel Xeon **8 cores**, CPUExecutionProvider, ds=0.375 | **17.26** | **104.3** | **0.575×** | full 1798 frames; loadavg peak ~7 |
| Vision laptop | RTX **3070** DirectML (under Edge load) | **~19.8** | **~91** | **~0.66×** | cite only |
| Vision laptop | MP selfie_general CPU | **32.6** | **55** | **1.09×** | cite only |
| Vision laptop | MP multiclass CPU | **6** | **302** | **0.2×** | cite only |

**Checkerboard contact (missing from Vision’s green sheets):**  
`/workspace/podcast-studio/s4-realcam/run4/media/server-matte/contact-rvm-mobilenetv3-checker-box.png`  
Stills: `…/stills/rvm_mobilenetv3_t{05,15,25,35,45,55}_checker.png`  
Factual alpha notes (heuristic): corner leak **false** all 6; partial_frac 0.015–0.045. **Designer grade (checkerboard sheet): near-PASS (not hard PASS)** — halo on hair, a few arm/torso leaks at 45 s on checker; hands OK; clearly better than browser v8. Final quality call open (flicker clip pending; Loïc decides).

## 7. Artifacts

```
RESULT-RUN4.md
S5-RVM-COST.md
run4/media/{raw,matted webm+results, remux, cadence-*.json}
run4/contact/contact-{matted,raw}.png
run4/media/server-matte/contact-rvm-mobilenetv3-checker-box.png
run4/media/server-matte/result-rvm_mobilenetv3.json
run4/ROOM-*.md  (drafts for parent → SendToAgent)
```

## 8. RVM variants (box CPU)

Designer near-PASS follow-up (soft hair halo FAIL soft; arm/torso decor leak @45s). **Xeon 8c, no GPU.**

ROIs: gap `(760,200)–(860,300)`; hair `(480,40)–(780,180)`.

| Var | What | ds | wallFps | s/min | partial̄ | gap45 ᾱ ↓better | hair luma ↓better |
|---|---|---:|---:|---:|---:|---:|---:|
| **A** | mnet baseline (prior full run) | 0.375 | 17.26 | 104.3 | 0.0264 | 0.6092 | 169.55 |
| **B** | mnet (=A, not re-run) | 0.375 | 17.26 | 104.3 | 0.0264 | 0.6092 | 169.55 |
| **C** | mnet full 1798 | 0.4 | 16.15 | 111.5 | 0.0257 | 0.5937 | 163.8 |
| **D** | resnet50 EXTRAP timed 15–55s after warm | 0.375 | 9.41 | 191.3 | 0.0354 | 0.5797 | 170.33 |
| **E** | despill+1px erode ←C | 0.4 | 16.15 | 111.5 | 0.0259 | 0.559 | 125.67 |

**Paths:**
- `/workspace/podcast-studio/s4-realcam/run4/media/server-matte/variants/contact-variants-A-E-checker.png`
- `/workspace/podcast-studio/s4-realcam/run4/media/server-matte/variants/zoom-head-25-45-native.png`
- `/workspace/podcast-studio/s4-realcam/run4/media/server-matte/variants/roi-arm-torso-gap-t45.png`
- stills: `/workspace/podcast-studio/s4-realcam/run4/media/server-matte/variants/stills/{A..E}_t*_checker.png`

**Factual (Designer grades):** E←C lowers hair semitrans luma **169.6→125.7** and gap45 α **0.609→0.559** vs A/B. C alone edges B on gap/halo at **111.5 vs 104.3 s/min**. D resnet50: see table (extrapolated segment). Visually E is the strongest halo control among A–E on these proxies; residual soft fringe may remain.

