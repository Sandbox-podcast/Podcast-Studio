# S4 real-cam pass — Vision harness → MinIO (laptop)

**Label:** Sandbox laptop / Edge harness `:8088` / MediaPipe matted canvas `captureStream(30)` → S4 drop-in → MinIO localhost  
**Date:** 2026-10-05 (Paris UTC+2)  
**Operator:** Loïc (~60 s run, finished ~23:03 Paris)  
**Analyst:** Podcast Media (box analysis)

## 1. Object inventory (`spike/s4-dropin/`)

Queried live via `http://127.0.0.1:3320/api/admin/list-objects` and `/api/admin/list-incomplete` on LAPTOP-BI8P2KF3.

| Field | Value |
|---|---|
| Objects under prefix | **1** |
| Key | `spike/s4-dropin/vision-host-1791233953193.webm` |
| Size (Head/list) | **5304090** bytes |
| lastModified (UTC) | 2026-10-05T21:00:13.565Z |
| lastModified (Paris) | **2026-10-05T23:00:13.565+02:00** |
| Incomplete MPUs | **[]** (none) |
| Upload status | **COMPLETE** (object present, no incomplete MPU) |
| Other tonight runs after 22:41 | **none** (sole object under prefix) |
| Filename `Date.now()` start (Paris) | **2026-10-05T22:59:13.193+02:00** |
| Wall create→complete | **60.372** s |
| Left in bucket | **yes** (not deleted — evidence) |
| Download SHA-256 | `45e5c3c3cceb2f97719c90b796b4dbbba64ac877526f09d6dc06df0431ac3449` |
| Box path | `/workspace/podcast-studio/s4-realcam/vision-host-1791233953193.webm` |

Server logs (`server.log`) only contain the startup line — no per-part byte counters. Local vs remote byte comparison from logs: **N/A** (not logged). Downloaded size **5304090** equals listed object size **5304090** → upload integrity byte match.

## 2. Raw ffprobe

```
format_name: matroska,webm
nb_streams: 1
size: 5304090
duration: null   (typical timesliced MediaRecorder — no container duration until remux)
bit_rate: null
```

| Stream | codec | type | resolution | avg_frame_rate | r_frame_rate | notes |
|---|---|---|---|---|---|---|
| 0 | vp8 | video | **1280×720** | 30/1 | 30/1 | tag `alpha_mode=1` (matted canvas) |

**Audio:** **absent** (no audio stream).

## 3. Remux

Command (no audio → no `setts`):

```bash
ffmpeg -hide_banner -nostats -y -v warning \
  -i vision-host-1791233953193.webm -map 0 -c copy \
  vision-host-1791233953193.remux.webm
```

| Metric | Value |
|---|---|
| rc | **0** |
| wall_s | **0.096** |
| cpu_s (user+sys children) | **0.099** |
| stderr warnings | **none** |
| in_bytes | 5304090 |
| out_bytes | **5304550** |

### Remux ffprobe

| Field | Value |
|---|---|
| format.duration | **59.989000** s |
| format.size | 5304550 |
| format.bit_rate | **707403** bps |
| video | vp8 1280×720, avg/r **30/1**, tag DURATION **00:00:59.989000000**, ALPHA_MODE **1** |
| audio | **none** |

### Cues (ebml-cues.py)

| File | cuesTopLevel | Cluster count | notes |
|---|---|---|---|
| raw | **false** | 1 (unknown-size Segment) | `segmentUnknownSize: true`, rawCuesIdOccurrences **0** |
| remux | **true** | **11** | Cues **1**, SeekHead/Info/Tracks/Tags present |

### Decode-null (remux)

- rc **0**
- 1 warning: `Application provided invalid, non monotonically increasing dts to muxer in stream 0: 1060 >= 1060`

## 4. Video packet / frame stats (remux)

Source: `ffprobe -select_streams v:0 -show_entries packet=pts_time,dts_time,size,flags`.

| Metric | Value |
|---|---|
| packetCount (≈ frames) | **982** |
| firstPts | 0.000 |
| lastPts | 59.956 |
| spanS (last−first) | **59.956** |
| effective fps (intervals) | **16.362** (= (982−1)/59.956) |
| keyframes | **10** |
| gapMs min / median / mean / max | **7.0 / 35.0 / 61.117 / 27221.0** |
| gaps > 100 ms | **2** |

Gaps > 100 ms (all):

| afterPacketIndex | gapMs | ptsBefore → ptsAfter |
|---|---|---|
| 154 | **152.0** | 5.129 → 5.281 |
| 239 | **27221.0** (**27.221 s**) | 8.061 → 35.282 |

### Segments around the 27.221 s freeze

| Segment | packets | pts span | effFps | bytes | bitrate |
|---|---|---|---|---|---|
| Before big gap | 240 | 0.000–8.061 s (**8.061** s) | **29.6489** | 1959243 | **1944416.8** bps |
| After big gap | 742 | 35.282–59.956 s (**24.674** s) | **30.0316** | 3337642 | **1082156.8** bps |

Active span excluding big gap: **32.735** s.  
Active bitrate (bytes×8/activeSpan): **1294488.5** bps (**1.2945** Mbps).

### Loss proxies

| Proxy | Value |
|---|---|
| expected frames @ 30 fps over span 59.956 s | **1798.68** |
| frame deficit vs 30 fps | **816.68** |
| lossPct vs 30 fps (deficit/expected) | **45.4044 %** |
| excess gap time vs 1/30 s nominal | **28.4973** s |
| lossPct excess-gap / span | **47.5304 %** |
| big-gap alone / container duration | 27.221 / 59.989 ≈ **45.38 %** |

Dominant loss driver: the **27.221 s** PTS hole (tab freeze / encoder stall / capture pause — not diagnosed beyond PTS). Outside that hole, fps ≈ 29.6–30.0.

## 5. Audio / sync

| Metric | Value |
|---|---|
| audio present | **no** |
| A/V start offset | **N/A** |
| A/V end offset | **N/A** |
| audio packet gaps | **N/A** |

## 6. Bitrate

| Definition | bps | Mbps |
|---|---|---|
| fileBytes×8 / format.duration (59.989) | **707341.7** | **0.7073** |
| ffprobe format.bit_rate (remux) | **707403** | **0.7074** |
| active only (excl. 27.221 s gap) | **1294488.5** | **1.2945** |
| before-gap segment | **1944416.8** | **1.9444** |
| after-gap segment | **1082156.8** | **1.0822** |

## 7. Locked S4 thresholds (option B) — verdicts

| Criterion | Threshold | Measured | Verdict |
|---|---|---|---|
| Sync (A/V) | ≤ 100 ms | no audio | **N/A** |
| Resume | ≤ 15 s | not exercised (no network cut) | **N/A** |
| Loss | ≤ 1 % | ~**45.4 %** frame deficit vs 30 fps (driven by 27.221 s gap); upload byte loss **0** (5304090=5304090) | **FAIL** (media timeline) |
| Bitrate | ≥ 1 Mbps | container **0.707 Mbps**; active excl. gap **1.295 Mbps** | **FAIL** (container/timeline); active segments alone would pass |

## 8. Oddities

1. **27.221 s video PTS discontinuity** mid-take (8.061 → 35.282). Capture resumed at ~30 fps afterward. This alone tanks container bitrate and loss proxies.
2. **Video-only** WebM — harness `previewCanvas.captureStream(30)` had **no audio track** attached (expected if Vision did not mux mic/WebAudio into the stream).
3. **`alpha_mode=1` / `ALPHA_MODE=1`** — confirms MediaPipe-composited (matted) canvas, 1280×720.
4. Raw timesliced WebM: unknown-size Segment, **no Cues**; remux restores Cues + seekable duration (**59.989** s) in **0.096** s wall.
5. One non-monotonic DTS warning on decode-null (MediaRecorder quirk); remux `-c copy` did not clear it (no audio `setts` applicable).
6. `avg_frame_rate` metadata says 30/1 but effective fps over full timeline is **16.36** because of the hole.

## 9. Artifacts on box

```
/workspace/podcast-studio/s4-realcam/
  vision-host-1791233953193.webm          # raw download
  vision-host-1791233953193.remux.webm    # -c copy remux
  raw-ffprobe.json
  remux-ffprobe.json
  remux-meta.json
  packet-stats.json
  segment-stats.json
  packets-v.csv
  cues-out.txt / cues-raw.txt
  decode-null.txt
  RESULT.md                               # this file
```

Laptop copy also at `C:\Users\azero\podcast-studio\s4-realcam\vision-host-1791233953193.webm` (download evidence; MinIO object retained).
