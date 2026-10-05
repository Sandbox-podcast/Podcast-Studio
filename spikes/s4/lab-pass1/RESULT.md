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
7. MinIO image for POC locked to **`pgsty/minio`** (see `spikes/s4/minio/README.md`); this lab used the already-running container on the dev box.

---

## Open questions for the real Sandbox-hardware pass

1. What are Loïc’s **S4 pass/fail thresholds** (bitrate floor, max resume gap, max part PUT time on LAN, acceptable webm remux step)?
2. Accept timesliced WebM + remux, or move to **WebCodecs + fragmented MP4 / custom mux** for seekable files?
3. Durable local buffer: **OPFS vs IndexedDB vs File System Access** on Windows target laptops?
4. Cut model: browser route abort vs OS/firewall vs docker network — which matches Sandbox failure modes?
5. Multi-participant sync: NTP / LiveKit RTP timestamps / shared server clock — firstChunk offsets alone are insufficient.
6. Revisit storage server only before **non-LAN / prod** exposure (POC image locked to `pgsty/minio`).
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
