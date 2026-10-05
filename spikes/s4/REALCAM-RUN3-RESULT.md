# S4 real-cam TAKE 3 — dual session after smoke fix (`?v=s4-matfix2`)

**Label:** Laptop / Edge `?v=s4-matfix2` / S4 drop-in v2 / tab foreground / mic on (claimed) / LiveKit ~00:06  
**Full take start (Paris):** raw **00:06:29.127**, matted **00:06:29.194** · complete ~**00:07:29** UTC+2  
**Analyst:** Podcast Media · objects **left in bucket** (not deleted)

## 0. Object inventory

Newer than take 2, two pairs appeared:

| Pair | Keys | Size | elapsed | note |
|---|---|---:|---:|---|
| **Aborted (~22 s)** | `…raw-1791237953617.webm` / `…matted-1791237953709.webm` | 7325083 / 6696990 | ~22.4 / 22.3 s | Tab **hidden** 10.6→13.3 s; matted watchdog gap **2747 ms** |
| **TAKE 3 full (~60 s)** ← analysed | `…raw-1791237989127.webm` / `…matted-1791237989194.webm` | **17797685** / **18272786** | **60036** / **60041** ms | Always **visible**; gaps **[]** |

Also `.results.json` for each. Incomplete MPUs: **none**. Take 1 & 2 untouched.

## 1. Content verification (stills viewed)

Survey: start, ~clap, 15/30/45/55 s.

| | raw | matted |
|---|---|---|
| Smoke (`S3 synthetic smoke`)? | **No** | **No** — smoke fix confirmed |
| Person visible? | **Yes** (full frame) | **Yes** early (inside circle); at t≈30 s person can leave the circle (room-only) |
| Matte style | Full cam rectangle | **Circular geometric crop** on black canvas — **not** a MediaPipe person-shaped silhouette |
| Background inside matte | Full room | Full room (not removed) |
| True alpha (ffmpeg → RGBA) | alpha plane **255 everywhere** | alpha plane **255 everywhere** (outside circle is **RGB black**, not transparent pixels) |
| `alpha_mode` tag | **1** | **1** |

**Content verdict:** Matted is **live camera through a circular vignette**, not synthetic smoke, and **not** a person cutout useful as keyed talent for S2. Black outside is composited RGB, not usable alpha as decoded.

Best evidence stills:
- Clap raw: `run3/raw-clap-1667ms.png`
- Clap matted: `run3/matted-clap-1567ms.png`

## 2. Metrics (full take 3)

### Upload / session telemetry (`exportResults`)

| | raw | matted |
|---|---|---|
| localBytes = remote | **17797685 = 17797685** (0 loss) | **18272786 = 18272786** (0 loss) |
| parts | 4 uploaded | 4 uploaded |
| watchdog gaps >500 ms | **[]** | **[]** |
| visibility | visible @0 only | visible @0 only |
| mime claimed | `video/webm;codecs=vp8,opus` | same |
| recording.audioTracks claimed | **1** | **1** |
| **Audio streams in file (ffprobe)** | **none** | **none** |

**Blocker:** Despite results claiming Opus + 1 audio track, both WebMs contain **video-only VP8**. No clap audio onset / A/V sync / cross-file audio lag can be measured from the files.

### Remux (`-c copy`; no `-bsf:a` needed — no audio)

| | raw | matted |
|---|---|---|
| wall / CPU (s) | **0.119 / 0.125** | **0.098 / 0.104** |
| format.duration (s) | **59.934** | **60.024** |
| Cues | **yes** | **yes** |
| video | VP8 **1280×720**, ALPHA_MODE **1** | same |
| video tag DURATION | **00:00:59.934000000** | **00:01:00.024000000** |
| bitrate (file×8/dur) | **2.376 Mbps** | **2.435 Mbps** |
| packets / eff fps | **1799 / 30.000** | **1801 / 30.005** |
| gap max / >200 ms | **52.0 ms / none** | **48.0 ms / none** |
| lossPct vs 30 fps | **−0.056 %** (surplus) | **−0.071 %** |



## 3. Sync

| Measurement | Result |
|---|---|
| Audio clap onset | **N/A — no audio stream in either object** |
| Visual clap (hands at face, viewed) | raw **1667 ms** (palms meeting, motion blur); matted **1567 ms** (hand(s) in clap motion inside circle; crop clips full two-hand meet) |
| Intra-file A/V offset | **N/A** (no audio) |
| Cross-file audio lag | **N/A** (no audio) |
| Cross-file visual clap Δ (matted − raw) | **1567 − 1667 = −100 ms** (matted earlier). Reliability: **moderate** — raw frame is clear two-hand impact; matted circle crops the gesture so peak frame is harder to pin to ±1 frame (~33 ms). |

## 4. Threshold verdicts (option B)

| Criterion | raw | matted |
|---|---|---|
| Sync ≤ 100 ms | **N/A** (no audio in file) | **N/A** |
| Resume ≤ 15 s | **N/A** | **N/A** |
| Loss ≤ 1 % | **PASS** | **PASS** |
| Bitrate ≥ 1 Mbps | **PASS (2.376)** | **PASS (2.435)** |
| Upload integrity | **PASS** | **PASS** |
| Watchdog / visibility | **PASS** | **PASS** |
| Content = MediaPipe person cutout | N/A (raw) | **FAIL** (circular crop, room BG kept) |
| Smoke gone | — | **PASS** |

## 5. Raw vs matted → HQ master

| | raw | matted |
|---|---|---|
| Size | 17.8 MB | 18.3 MB |
| Bitrate | 2.38 Mbps | 2.44 Mbps |
| FPS | 30.000, gap≤52 ms | 30.005, gap≤48 ms |
| Framing | Full 1280×720 talent+room | Circular window (~half FOV lost) |
| Alpha for S2 | Tag only; decoded opaque | Same — black RGB matte, **not** keyed talent |
| Audio | Missing in container | Missing in container |

**Recommendation:** Keep **raw** as HQ master for show picture+timing until (a) matted is a true person silhouette (or keyed BG) with usable alpha, and (b) Opus audio is actually present in the WebM. Take 3 proves the smoke-canvas bug is fixed and dual 60 s / 30 fps recording is solid, but the circular vignette is not an S2-ready matte.

## 6. Artifacts

```
/workspace/podcast-studio/s4-realcam/RESULT-RUN3.md
/workspace/podcast-studio/s4-realcam/run3/
  vision-host-raw-1791237989127.webm|.results.json
  vision-host-matted-1791237989194.webm|.results.json
  raw.remux.webm  matted.remux.webm
  remux-summary.json  packet-stats-*.json  run3-metrics.json  motion-peaks.json
  raw-clap-1667ms.png          # best clap still (raw)
  matted-clap-1567ms.png       # best clap still (matted)
  matted-content-t15s.png  raw-content-t15s.png
  survey/  frames-*/  clap-seq/
```
