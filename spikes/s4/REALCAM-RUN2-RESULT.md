# S4 real-cam TAKE 2 — dual session (raw + matted)

**Label:** Laptop LAPTOP-BI8P2KF3 / Edge harness `?v=s4-dual2` / S4 drop-in v2 / tab foreground / LiveKit publish on / mic ON  
**Wall time (Paris UTC+2):** ~23:28:48 start (results `visibility.iso`) → objects complete **23:29:49** (`lastModified` 2026-10-05T21:29:49Z)  
**Operator:** Loïc (clap at start, then spoke)  
**Analyst:** Podcast Media (box)  
**Incomplete MPUs:** none · **Objects left in bucket:** yes (not deleted)

## 1. Objects found (newer than take 1)

| Key | Size (B) | lastModified (UTC) | lastModified (Paris) |
|---|---:|---|---|
| `spike/s4-dropin/vision-host-raw-1791235728700.webm` | **19484895** | 2026-10-05T21:29:49.037Z | **23:29:49.037+02** |
| `spike/s4-dropin/vision-host-matted-1791235728833.webm` | **14756998** | 2026-10-05T21:29:49.155Z | **23:29:49.155+02** |
| `…/vision-host-raw-1791235728700.results.json` | 21532 | 21:29:49.294Z | 23:29:49.294+02 |
| `…/vision-host-matted-1791235728833.results.json` | 20957 | 21:29:49.357Z | 23:29:49.357+02 |
| take 1 (unchanged) `vision-host-1791233953193.webm` | 5304090 | 21:00:13.565Z | 23:00:13.565+02 |

Take 1 key kept for reference; analysis below is **take 2 only**.

### Recorder exportResults (authoritative session telemetry)

| | raw | matted |
|---|---|---|
| label | raw | matted |
| mimeType | `video/webm;codecs=vp8,opus` | same |
| watchdogMode | MediaStreamTrackProcessor | same |
| **gaps (>500 ms)** | **[]** | **[]** |
| **visibility** | `[{state:visible, tMs:0}]` only | same (tMs:0) |
| errors | [] | [] |
| elapsedMs | **60098.4** | **60056.3** |
| chunks | 59 | 59 |
| localBytes | **19484895** | **14756998** |
| remoteContentLength | **19484895** | **14756998** |
| **byte loss** | **0** | **0** |
| parts uploaded | 4 × (5+5+5+3.58 MiB) | 3 × (5+5+4.07 MiB) |
| video/audio tracks | 1 / 1 | 1 / 1 |
| download SHA-256 | `875be053…12044` (= integrity.localSha256) | `9ad12eb3…84963b` |

Filename starts: raw `Date.now()` → **22:28:48.700 UTC / 23:28:48.700 Paris**; matted **23:28:48.833 Paris**.

## 2. Per-file metrics (after remux)

Remux: `ffmpeg -i in -map 0 -c copy -bsf:a "setts=…"` (both have audio).

| Metric | raw | matted |
|---|---|---|
| remux wall / CPU (s) | **0.165 / 0.175** | **0.101 / 0.109** |
| format.duration (s) | **60.008** | **60.029** |
| Cues (remux) | **yes** (top-level) | **yes** |
| Cues (raw timesliced) | no | no |
| video | VP8 **1280×720** ALPHA_MODE **1** | VP8 **1280×720** ALPHA_MODE **1** |
| video tag DURATION | 00:00:59.954 | 00:01:00.001 |
| audio | Opus 48 kHz mono | Opus 48 kHz mono |
| audio tag DURATION | 00:01:00.008 | 00:01:00.029 |
| A/V tag duration diff (V−A) | **−54.0 ms** | **−28.0 ms** |
| video packets (≈frames) | **1800** | **1801** |
| effective fps (intervals) | **30.0068** | **30.016** |
| gapMs max / median | **53.0 / ~33** | **47.0 / ~33** |
| gaps **>200 ms** | **none** | **none** |
| gaps >100 ms | 0 | 0 |
| lossPct vs 30 fps (deficit/expected) | **−0.0784 %** (surplus) | **−0.1089 %** (surplus) |
| bitrate (fileBytes×8/format.duration) | **2.598 Mbps** | **1.967 Mbps** |
| ffprobe format.bit_rate | 2597601 | 1966614 |

## 3. Picture content (critical)

Survey stills at t = 0,1,2,5,10,20,30,45,55 s:

- **raw:** real LifeCam picture of Loïc + room throughout (see `run2/raw-person-t5s.png`, `run2/raw-at-clap-onset-735ms.png`).
- **matted:** **entire take is the Vision harness placeholder**  
  **"S3 synthetic smoke (no camera) · vision-s3 · 1280×720"**  
  (see `run2/matted-synthetic-t5s.png`, `run2/matted-synthetic-t30s.png`, `run2/matted-at-clap-onset-655ms.png`).  
  Mean RGB stays ~`(36–38, 51–53, 72–75)` at every sampled time — no person / no MediaPipe matte.

**Implication:** the `matted` session did **not** capture `previewCanvas` with live matting; it captured the synthetic smoke canvas (or that canvas was what `captureStream` was bound to). Pipeline metrics on matted are still valid as a recorder stress test, but **matted is not usable as an HQ master of the show**.

## 4. Clap / sync

### Cross-file audio (shared mic track) — measured, reliable

| Method | Result |
|---|---|
| Normalized cross-correlation (first 8 s, ±→8 kHz, ±500 ms lag) | **matted lags raw by +80.0 ms** (peak/medianAbs **68.47**) |
| Clap-onset gate (high post-onset RMS + sharp rise) | raw clap **735.0 ms**; matted clap **655.0 ms**; Δ(matted−raw) **−80.0 ms** |

Onset Δ matches cross-corr magnitude (sign: matted’s clap lands 80 ms earlier in its own timeline ↔ recording start skew of ~133 ms between sessions + shared clock; the **cross-corr +80 ms** is the continuous alignment of the two audio waveforms).

### Intra-file A/V sync via clap (visual vs audio) — **not reliable**

Attempted: audio clap onset + frame-diff peak in ±700 ms window.

| File | Audio clap | Why visual clap fails |
|---|---|---|
| raw | **735.0 ms** (rmsPost 0.330, peakAbs 1.000) | At clap time, still shows face/shoulders — **hands not in frame** (clap likely below crop). Frame-diff peak in window has promVsMedian **1.11** (weak). |
| matted | **655.0 ms** (same mic energy) | **No person in picture** (synthetic smoke). Any motion peak is smoke animation, not a clap. |

**Conclusion:** do **not** claim a measured A/V clap offset for either file. Sync ≤100 ms threshold → **N/A (unmeasurable this take)**.  
(Container A/V duration tags differ by −54 / −28 ms; that is mux metadata, not clap sync.)

## 5. Threshold verdicts (option B)

| Criterion | raw | matted |
|---|---|---|
| Sync ≤ 100 ms | **N/A** (clap visual not recoverable) | **N/A** (no subject in video) |
| Resume ≤ 15 s | **N/A** (no network cut) | **N/A** |
| Loss ≤ 1 % | **PASS** (0 gaps >200 ms; ~30.01 fps; surplus vs 30 fps) | **PASS** (same) |
| Bitrate ≥ 1 Mbps | **PASS (2.598)** | **PASS (1.967)** |
| Upload integrity | **PASS** (0 byte loss; 4/4 parts) | **PASS** (0 byte loss; 3/3 parts) |
| Watchdog / visibility | **PASS** (no gaps; always visible) | **PASS** (no gaps; always visible) |
| Content fitness (HQ master) | **PASS** (real cam) | **FAIL** (synthetic smoke, not matte) |

## 6. Raw vs matted for HQ-master decision

| | raw | matted (this take) |
|---|---|---|
| Content | Real cam + mic | Synthetic smoke placeholder |
| File size | 19.5 MB | 14.8 MB |
| Bitrate | 2.60 Mbps | 1.97 Mbps |
| FPS stability | 30.01, gap max 53 ms | 30.02, gap max 47 ms |
| Watchdog gaps | none | none |
| CPU-related drops | none observed | none observed |

**Recommendation (1 line):** For take 2, choose **raw** as the only viable HQ master; **re-run matted** with `previewCanvas` confirmed as the MediaPipe composite (not the S3 synthetic-smoke layer) before deciding matted-vs-raw+server-matte.

## 7. Artifacts

```
/workspace/podcast-studio/s4-realcam/RESULT-RUN2.md
/workspace/podcast-studio/s4-realcam/run2/
  vision-host-raw-1791235728700.webm|.results.json
  vision-host-matted-1791235728833.webm|.results.json
  raw.remux.webm  matted.remux.webm
  packet-stats-*.json  remux-summary.json  clap-sync-v2.json  run2-metrics.json
  raw-person-t5s.png
  raw-at-clap-onset-735ms.png
  matted-synthetic-t5s.png  matted-synthetic-t30s.png
  matted-at-clap-onset-655ms.png
  survey/*.png
```
