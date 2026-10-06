# s4-h264 — MediaRecorder H.264 probe (Edge, laptop) + box remux check

**Safety:** the probe launches its OWN Edge via Playwright `launchServer` (fresh temp profile, separate process tree). It never attaches to or kills Loïc's Edge, never touches the camera or mic (synthetic 1280x720@30 canvas + 440 Hz OscillatorNode) and never kills other processes. Light load: ~1–1.5 min. The default plan records **vp8 baseline + the first supported H.264 mime per container** (webm / x-matroska / mp4), so ≤4 × 15 s. `-AllH264` records every supported h264/avc1 variant instead (longer).

## Files
| file | where it runs | what |
|---|---|---|
| `probe.mjs` | laptop (node 20) | isTypeSupported list + UA; VideoEncoder.isConfigSupported (avc1.42E01F / avc1.640028 / vp8 × prefer-hardware / prefer-software); 60-frame VideoEncoder runs; MediaRecorder 15 s @ 2.5 Mbps, timeslice 1000 per mime; `edge://gpu` video lines; writes `results.json` + recordings |
| `sample-cpu.ps1` | laptop (spawned by probe) | 1 s samples: CPU of the probe's own Edge tree (root PID + descendants), machine CPU, GPU **VideoEncode** engine util for those PIDs (Intel QSV or NVENC). Uses raw CIM perf classes because Get-Counter/typeperf names are localized on French Windows |
| `run-probe.ps1` | laptop | sets nvm node 20.11.0 on PATH; finds an existing `node_modules\playwright-core` (shallow search under `C:\Users\azero\podcast-studio`, then a few repo roots, depth 3, AppData excluded) or falls back to `npm install playwright-core` in `%TEMP%\s4-h264-pw` (no browser download, uses installed Edge) |
| `remux_check.py` | **box** | ffprobe (container, codec, profile, extradata/CodecPrivate), then the locked S4 remux `ffmpeg -i in -map 0 -c copy [-bsf:a setts=…] out.{webm,mkv,mp4}` (mp4+Opus retried with `-strict -2` if needed), decode check, then S4 gates (duration, bitrate, packets/eff fps/max gap/holes/loss vs 30) via `s4-ab/analyze_ab.py` helpers + `tools/distinct_fps.py --threshold 0.5`; joins publisher CPU / nvidia-smi from results.json |

## Laptop commands (only when the lead says the laptop is free)
1. Agent copies the 3 files to the laptop (CopyFromBox):
   - `/workspace/podcast-studio/s4-h264/probe.mjs` → `C:\Users\azero\podcast-studio\s4-h264-probe\tool\probe.mjs`
   - `/workspace/podcast-studio/s4-h264/sample-cpu.ps1` → `C:\Users\azero\podcast-studio\s4-h264-probe\tool\sample-cpu.ps1`
   - `/workspace/podcast-studio/s4-h264/run-probe.ps1` → `C:\Users\azero\podcast-studio\s4-h264-probe\tool\run-probe.ps1`
2. Run (laptop Shell, one line):
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\azero\podcast-studio\s4-h264-probe\tool\run-probe.ps1
   ```
   Options: `-PlaywrightDir <...\node_modules\playwright-core>` (skips the search), `-Secs 15`, `-Headed` (window parked off-screen at -2400,-2400; use if headless reports "Video Encode: Software only"), `-AllH264`.
   Output: `C:\Users\azero\podcast-studio\s4-h264-probe\run-<ISO-ts>\` → `results.json`, `rec-*.webm|mkv|mp4` (`*.actual.mkv` = requested webm but the recorder produced Matroska), `gpu-page.txt`.
3. Agent copies the run folder's files to the box (CopyToBox each file) → `/workspace/podcast-studio/s4-h264/runs/<run-ts>/`.

## Box command
```bash
python3 /workspace/podcast-studio/s4-h264/remux_check.py /workspace/podcast-studio/s4-h264/runs/<run-ts>
# → runs/<run-ts>/box-check/remux-report.md + remux-report.json (+ remux/ outputs)
```

## Interpreting the hardware proxy
- `VideoEncoder.isConfigSupported(prefer-hardware)` = true and the 60-frame prefer-hardware run without `Encoder creation error` → hardware H.264 path available to WebCodecs. MediaRecorder may still choose software.
- **Optimus laptop:** Edge usually encodes on the **Iris Xe** (Intel QSV). nvidia-smi `utilization.encoder` will then stay at 0; look at `gpuVideoEncodePct` (any vendor, our PIDs only) and the `edge://gpu` "Video Encode" line.
- Publisher CPU is `treeCpuPctOneCore` (% of one logical core, can exceed 100) and `treeCpuPctMachine` (÷ logical cores). Compare h264 vs the vp8 baseline in the same run.

## Box dry-run (2026-10-06 03:13, HeadlessChrome 154 Linux, software only — not the laptop)
- All 10 mimes reported supported. VideoEncoder prefer-hardware = unsupported, and the run fails with `Encoder creation error` (no GPU); prefer-software is OK.
- `video/webm;codecs=h264` → recorder produced **`video/x-matroska;codecs=avc1,opus`**. `video/mp4;codecs=avc1` → `video/mp4;codecs=avc1,opus`.
- Remux: H.264 → `.webm` **FAIL** ("Only VP8 or VP9 or AV1 video and Vorbis or Opus audio … supported for WebM"); → `.mkv` **OK**; → `.mp4` **OK** (Opus without `-strict -2`). VP8 → `.mp4` FAIL (expected), → webm/mkv OK.
- Box eff fps 22–25 / loss 17–24 % reflect headless software rendering on a busy CPU, not the laptop.
- ffmpeg-generated h264+opus .mkv and vp8+opus .webm (6 s) → same remux pattern; gates PASS (30 distinct fps).

## Probe v2 (2026-10-06 03:34) — VideoEncode attribution + H.264-only 60 s, headless then headed
Changes:
- `sample-cpu.ps1` v2: adds an UNFILTERED 1 s sample of every GPU Engine `engtype_VideoEncode` instance, all PIDs and adapters:
  - from `Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine`: `vencAll.fmtSum`, `fmtPerLuid`, `fmtPerPid`;
  - raw-delta cross-check: `rawSum`, `rawPerPid`;
  - process names via `Get-Process` for any PID with VideoEncode > 0, with `inTree` = whether it belongs to our Edge.
  - It still reports our tree's CPU and machine CPU. nvidia-smi `utilization.encoder` is sampled at 1 s by the probe.
- `probe.mjs` v2:
  - **10 s idle baseline BEFORE our browser starts** (`results.idleBaseline`, includes other apps' encoders = noise floor);
  - `--only h264|vp8|<mime>`; `--label`; run folder `run-<ts>-headless|headed`;
  - per recording: `vencAll` (sum stats, per-LUID stats) and `videoEncodePids` = `[{pid, name, inOurTree, maxFmt, maxRaw}]`.
- `run-probe.ps1` v2: `-Only h264`, `-Secs 60`, `-IdleSecs 10`, `-Both` (= headless run, then headed run with the window off-screen).
- Safety unchanged: own Edge via Playwright `launchServer` (fresh temp profile), synthetic canvas + oscillator, never the camera, never attaches to or kills any other process. Sampling is read-only CIM queries.

Laptop (after CopyFromBox of probe.mjs, sample-cpu.ps1, run-probe.ps1 to `C:\Users\azero\podcast-studio\s4-h264-probe\tool\`):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\azero\podcast-studio\s4-h264-probe\tool\run-probe.ps1 -Only h264 -Secs 60 -Both
```
≈ 2 × (10 s idle + ~10 s support/VE + 60 s recording) ≈ 3 min. Output: `run-<ts>-headless\` and `run-<ts>-headed\`, each with `results.json` + `rec-video_webm_codecs_h264*.mkv|webm`.
Box: `python3 remux_check.py runs/<run-ts>-headless` (and `-headed`).

Dry-checks (box): `node --check probe.mjs` OK. pwsh 7.6.6 (portable, `~/pwsh/pwsh`) parses `sample-cpu.ps1` and `run-probe.ps1` with 0 errors. The JSON aggregation logic was tested in pwsh with fake GPU Engine names. Probe v2 dry-run in Chrome `--only h264` headless + headed OK (Windows-only fields null on Linux). CIM classes, Get-Process and nvidia-smi were NOT exercised: Windows-only.
