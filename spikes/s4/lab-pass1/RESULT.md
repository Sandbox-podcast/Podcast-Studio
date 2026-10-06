# S4 lab pass — local-dev / headless / synthetic

**Label:** localhost headless lab on the shared box — **NOT** the Sandbox-hardware pass.  
**Run by:** Podcast Media · **2026-10-05 18:34:55–18:38:44 CEST (UTC+2)**  
**Code:** `/workspace/podcast-studio/s4-lab/` (not pushed; ready to port into a PR later)  
**Raw JSON:** `out/summary.json`, `out/main-results.json`, `out/sync-results.json`, `out/integrity.json`, `out/ffprobe-count.json`

S4 pass/fail **thresholds = TODO** (Loïc owns them). Statuses below are lab-outcome labels only (did the procedure complete with measured integrity), not product gate decisions.

---

## Setup

| Item | Value |
|---|---|
| Browser | Playwright Chromium **131.0.6778.33** (lab). System Google Chrome 154.0.8037.57 present but not used for the lab. |
| Flags | `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, `--autoplay-policy=no-user-gesture-required` |
| Media source (primary) | **canvas.captureStream(30)** @ 1920×1080 animated scene + **WebAudio** sawtooth oscillator (LFO on frequency) via `MediaStreamDestination` |
| Fake-device flags | Present as belt-and-suspenders; pipeline did **not** call `getUserMedia` |
| Lab API / static | `http://127.0.0.1:3320` (`server.mjs` — multipart create/presign/list/complete/abort) |
| MinIO | `http://127.0.0.1:9000`, bucket `podcast-recordings-poc`, path-style, region `us-east-1` (existing `podcast-s4-minio`; **not** stopped) |
| Ports avoided | 7880, 7881, UDP 50000–50200, 5190, 8080, 9000, 9001 |
| Part size | 5 MiB (5 242 880 B) except last part |
| Target record | 180 s, `videoBitsPerSecond` hint 8 000 000, mime `video/webm;codecs=vp8,opus`, timeslice 1000 ms |

---

## 1. Recording (MediaRecorder + mime probe + WebCodecs feasibility)

**Outcome: PASS (lab)**

### MediaRecorder.isTypeSupported (Playwright Chromium 131)

Reported supported:
- `video/webm;codecs=vp8,opus`
- `video/webm;codecs=vp9,opus`
- `video/webm;codecs=vp9`
- `video/webm;codecs=vp8`
- `video/webm`
- `video/mp4` *(bare — no `avc1…` / `mp4a…` variant returned true)*
- `audio/webm;codecs=opus`

**Not** supported among candidates tried: `video/mp4;codecs=avc1.42E01E,mp4a.40.2`, `video/mp4;codecs=avc1.4D401E,mp4a.40.2`.

**Used for main pass:** `video/webm;codecs=vp8,opus` (chosen for higher measured bitrate vs vp9 in a prior 20 s check: ~4.42 Mbps vs ~1.66 Mbps).

### Main recording measurements

| Metric | Measured |
|---|---|
| Elapsed | **180 037.7 ms** (~180.04 s) |
| Timeslice chunks | **177** |
| Local assembled bytes | **99 812 767** (~95.2 MiB) |
| Measured bitrate | **4 435 194 bit/s** (~4.435 Mbps) — below 8 Mbps hint |
| Errors | none |

### WebCodecs feasibility (no muxer built)

- `VideoEncoder` / `AudioEncoder` present.
- Video `isConfigSupported` @ 1280×720 / 2.5 Mbps / 30 fps: **vp8 yes**, **vp09.00.10.08 yes**, **avc1.42E01E no**, **av01.0.04M.08 yes**.
- Audio: **opus yes**, **mp4a.40.2 no**.

---

## 2. Segments → multipart upload (while recording)

**Outcome: PASS (lab)**

- Object: `spike/s4-lab/rec/lab-main-1791218096742.webm`
- **20 parts**: 19 × 5 242 880 B + last **198 047** B
- Multipart ETag after complete: `"2225ec373385ed323222ff309473b0df-20"`
- Per-part presigned PUT upload times (loopback): **14.2–54.5 ms** (not representative of LAN/WAN)
- Local manifest kept part number, byte range, ETag, upload timing, attempt count (`out/summary.json` → `segmentsUpload.parts`)

Uploads of finished ≥5 MiB parts ran **during** recording (console shows part 1 uploaded before stop; parts continued through the session).

---

## 3. Network cut + resume

**Outcome: PASS (lab)**

Cut method: Playwright `page.route('**://127.0.0.1:9000/**', abort)` so **only MinIO** is blocked; lab API `:3320` stays up for list-parts/presign after reconnect. (Full CDP offline would also blackhole the lab API.)

| Cut | Requested | Actual | Wall start (CEST) |
|---|---|---|---|
| cut-10s | 10 000 ms | **10 063 ms** | 18:35:07 |
| cut-30s | 30 000 ms | **30 028 ms** | 18:35:29 |

Resume evidence (`out/browser-console.log`):
- After cut-10s: part **2** buffered offline; `list-parts` → `[1]`; only missing part 2 uploaded (attempts=2 on part 2).
- After cut-30s: parts **4, 5, 6** buffered offline; `list-parts` → `[1,2,3]`; uploaded 4–6 only (attempts=2 on parts 4–6).
- Recording continued locally through both cuts (final 177 chunks / 180 s wall).

### Integrity

| Check | Result |
|---|---|
| Local bytes | 99 812 767 |
| Remote HeadObject ContentLength | 99 812 767 |
| Local sha256 | `c7ee6282c5bb8724a4eb392e7d8d25b89baacad5c9a84bb8a2e22682eebabfc0` |
| Remote sha256 | **identical** |
| Size match | **true** |

### ffprobe / webm caveats (honest)

`ffprobe` **reads** the object (streams present) but **format.duration = N/A**, stream durations N/A, bit_rate N/A — classic **MediaRecorder timeslice WebM** missing finalized duration/seek metadata.

With `-count_frames`:
- video: vp8 1920×1080, **5381** frames, avg_frame_rate `30000/1001` → **~179.55 s** estimated
- audio: opus, 48 000 Hz, **2** channels, **2996** packets

`ffmpeg -i … -f null -` reported multiple **non-monotonically increasing DTS** warnings on stream 0. Seek test (`ffmpeg -ss 60 -i … -frames:v 1`) exited 0 but logged VP8 decoder “Invalid data” on some packets.

**Implication for product:** timesliced WebM may need remux/repair (e.g. `ffmpeg -c copy` remux, or a muxer that writes duration cues) before reliable seek/players; sha256 integrity of bytes ≠ clean container timestamps.

---

## 4. Multi-track sync (light) — measured only

**Outcome: MEASURED (no pass/fail)**

Two Playwright browser contexts, shared wall-clock gate (`goAt`), each 45 s record + upload.

| | lab-sync-a | lab-sync-b |
|---|---|---|
| Key | `…/lab-sync-a-1791218278891.webm` | `…/lab-sync-b-1791218278891.webm` |
| Local bytes | 9 998 227 | 10 070 942 |
| Parts | 2 | 2 |
| firstChunkAt (perf ms in context) | 1591.40 | 1467.90 |

Offsets:
- `wallStartDeltaMs` = **0** (both crossed gate at same `Date.now()`)
- `timeOriginDeltaMs` (A−B) = **-65.80 ms**
- `firstChunkAbsDeltaMs` (A−B, using `timeOrigin + firstChunkAt`) = **+57.70 ms**

Interpretation: same wall start; first MediaRecorder chunk abs times differ by tens of ms across contexts (headless, synthetic) — baseline only, not a product sync guarantee.

---

## 5. Abort / cleanup

**Outcome: PASS (lab)**

- Incomplete MPUs under `spike/s4-lab/rec/` after run: **0** (nothing to abort).
- Warmup objects `smoke25-*` and `brate-*` deleted post-run.
- **Left in bucket** (prefix `spike/s4-lab/rec/`):

| Key | Size |
|---|---|
| `lab-main-1791218096742.webm` | 99 812 767 |
| `lab-sync-a-1791218278891.webm` | 9 998 227 |
| `lab-sync-b-1791218278891.webm` | 10 070 942 |

---

## Skipped / not done

| Item | Reason |
|---|---|
| Real camera / mic | None on this box; synthetic canvas+WebAudio used |
| Full WebCodecs encode→mux pipeline | Feasibility probe only (per brief) |
| IndexedDB / OPFS durable buffer | Memory buffer only for this lab; survives tab kill **not** tested |
| True CDP full-offline | Would block lab API; MinIO-port abort used instead |
| LAN / multi-machine / real Sandbox host | Explicitly out of scope for this pass |
| Product S4 threshold gating | TODO — Loïc |

---

## Caveats (must carry into any read of these numbers)

1. **localhost loopback** — upload ms are not WAN/LAN.
2. **Headless Chromium** via Playwright — not a user Chrome session.
3. **Synthetic media** — not a podcast cam/mic; bitrate/content differ from real scenes.
4. **WebM timeslice container** — duration N/A, DTS warnings, seek fragility.
5. **Resume buffer = in-memory Blobs** — page crash would lose pending parts (OPFS/IDB not exercised).
6. **Network cut = app-level block of MinIO host** — not a NIC unplug / Docker network partition.
7. Prior MinIO image decision (`pgsty/minio` vs `silo`) still open at product level; this lab used the already-running container.

---

## Open questions for the real Sandbox-hardware pass

1. What are Loïc’s **S4 pass/fail thresholds** (bitrate floor, max resume gap, max part PUT time on LAN, acceptable webm remux step)?
2. Accept timesliced WebM + remux, or move to **WebCodecs + fragmented MP4 / custom mux** for seekable files?
3. Durable local buffer: **OPFS vs IndexedDB vs File System Access** on Windows target laptops?
4. Cut model: browser route abort vs OS/firewall vs docker network — which matches Sandbox failure modes?
5. Multi-participant sync: NTP / LiveKit RTP timestamps / shared server clock — firstChunk offsets alone are insufficient.
6. Confirm **MinIO image** (`pgsty/minio` frozen vs `pgsty/silo`) before LAN exposure.
7. Real cams @ target resolution/bitrate on Sandbox machines (this pass’s 4.4 Mbps synthetic is not a camera characterization).

---

## How to re-run (box)

```bash
# MinIO must already be up (do NOT docker compose down -v)
cd /workspace/podcast-studio/s4-lab
node server.mjs          # :3320
# other terminal:
S4_DURATION_SEC=180 S4_SYNC_DURATION_SEC=45 node run-lab.mjs
# results → RESULT.md / out/*.json / artifacts/lab-main-remote.webm
```

---

## Pass 1b — resume timing

**Label:** localhost / headless / synthetic, on the shared box. **NOT** the Sandbox-hardware pass.
**Run by:** Podcast Media · **2026-10-05 18:43:29–18:44:45 CEST (UTC+2)** · Playwright Chromium 131.0.6778.33
**Raw:** `out/resume-results.json` (per-cut timeline + `events[]`), `out/resume-console.log`, `artifacts/lab-resume-remote.webm`
**Threshold (Loïc lock B):** resume ≤ 15 000 ms. **Resume** means the time from the network reconnect until every part missing at reconnect has been re-uploaded (catch-up complete).

### How it was measured
- `recorder.js` logs high-resolution timestamps (`performance.now()` plus `Date.now()` ISO) for: cut start, reconnect (`online=true`), list-parts request/response, each missing-part PUT start/end, and catch-up complete. Each cut also writes one `[s4-resume] {json}` console line.
- **Reconnect** = the page's `setOnline(true)`, called right after `page.unroute('**://127.0.0.1:9000/**')`. **Catch-up complete** = every part that wasn't uploaded at reconnect now has an ETag.
- Recording: 75 s, `video/webm;codecs=vp8,opus`, 8 Mbps hint, 1000 ms timeslice, 5 MiB parts. Cuts used the same mechanism as pass 1 (page.route abort on MinIO only; the lab API stays up).

### Per cut

| Cut | Cut start (CEST) | Reconnect (CEST) | Catch-up complete (CEST) | Offline | list-parts | Parts re-sent | **resumeMs** | Verdict (≤ 15 000 ms) |
|---|---|---|---|---|---|---|---|---|
| cut-10s | 18:43:40.811 | 18:43:50.829 | 18:43:50.878 | 10 017.6 ms | 11.5 ms (remote had [1]) | **[2]** (1 × 5 MiB, PUT 34.2 ms) | **48.8** | **PASS** |
| cut-30s | 18:44:02.885 | 18:44:32.898 | 18:44:33.064 | 30 013.6 ms | 31.6 ms (remote had [1,2,3]) | **[4, 5, 6]** (3 × 5 MiB, PUTs 40.8 / 41.7 / 46.5 ms) | **165.6** | **PASS** |

UTC ISO (as logged): cut-10s reconnect `2026-10-05T16:43:50.829Z` → catch-up `2026-10-05T16:43:50.878Z`; cut-30s reconnect `2026-10-05T16:44:32.898Z` → catch-up `2026-10-05T16:44:33.064Z`.

### Integrity and cleanup

| Item | Value |
|---|---|
| Recording | 75 040.9 ms, 74 chunks, 41 650 820 B, measured 4.44 Mbps, 8 parts (7 × 5 MiB + 4 950 660 B) |
| sha256 local | `ab7ab895080f7b6899b0eb980ce594a55af9fc16e655ac29db0ed9452757b649` |
| sha256 remote | `ab7ab895080f7b6899b0eb980ce594a55af9fc16e655ac29db0ed9452757b649` → **match**, size match 41 650 820 B |
| Incomplete MPUs | 0 aborted · **0 remaining** under `spike/s4-lab/rec/` |
| Overall (lab) | resume **PASS** · integrity **PASS** · cleanup **PASS** |

### Caveats (read before quoting)
1. **Loopback, not a real network.** Re-sending is LAN/loopback-fast (~35–47 ms per 5 MiB). On a real uplink, resume is roughly the buffered bytes divided by uplink speed: at ~4.4 Mbps, a 30 s cut buffers ~15 MiB, which takes ~6.3 s at 20 Mbps and ~12.6 s at 10 Mbps. **On an uplink under ~8–9 Mbps, a 30 s cut would exceed 15 s.** This has to be re-measured on Sandbox hardware and the real network.
2. Reconnect is signalled by the app (the runner calls `setOnline(true)`), not detected through the browser `online` event or a NIC change, so it doesn't include detection latency.
3. Resume counts only the parts that were missing at reconnect. Bytes still in the buffer (< 5 MiB, not yet a part) aren't counted; they go up with the next normal part.
4. The pending-part buffer is still in memory (no OPFS/IDB), the same as pass 1.
5. Lab fix found while instrumenting: in pass 1, `window.__s4.uploader` was only set after recording, so the runner's post-cut `resumeMissing()` call did nothing (the resume ran through the uploader's own queue instead). The uploader is now exposed during recording, and `resumeMissing()` is single-flight so the two paths can't double-send.

### Re-run
```bash
# MinIO already up (never docker compose down -v)
cd /workspace/podcast-studio/s4-lab
node server.mjs &                                   # :3320
node run-lab.mjs --resume-only                      # 75 s (S4_RESUME_DURATION_SEC to override) → out/resume-results.json
# smoke: S4_RESUME_DURATION_SEC=15 node run-lab.mjs --resume-only --no-cuts → out/resume-smoke.json
kill %1
```
