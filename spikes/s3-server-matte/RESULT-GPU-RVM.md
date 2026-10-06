# S3 server-matte: RVM on RTX 3070 (DirectML), take 4 raw, variants C / E2-fgr / E2b

> **WIP, draft PR #4.** Every number is **measured** unless marked *derived/estimate*. Timebox stopped at 02:17 (3070 handed to RTC). No clean re-run of E2-fgr/E2b.

- **Date / host:** 2026-10-06, 01:58 to 02:17 Europe/Paris, `LAPTOP-BI8P2KF3` (i7-11370H 4C/8T, RTX 3070 Laptop 8 GB + Iris Xe, Windows), onnxruntime-directml 1.19.2.
- **Source:** `s4-realcam/run4/vision-host-raw-1791240416301.webm`, 1798 frames, 30 fps, 59.93 s, 1280×720.
- **Model:** `rvm_mobilenetv3_fp32.onnx`, `downsample_ratio` 0.4 for all variants.
- **Script:** `gpu-e2/gpu_bench_e2.py`. Its post-processing is the same as Media's `spikes/s4/rvm-variants/e2/rvm_e2_post.py` (PR #2):
  - E2-fgr = RVM fgr + 1 px erosion only where α<0.5;
  - E2b = despill against the temporal background (mean of raw where α<0.02), opaque pixels → fgr, no erosion.

## GPU confirmation
- **DML `device_id=1` = RTX 3070.** Probe over 120 frames: dev1 ran 35.4 ms/inf, nvidia-smi up to 33 %, 354 MiB.
- **`device_id=0` = Intel Iris Xe**: 105 ms/inf, nvidia-smi at **0 %**.
- ⚠ The 01:09 run in `RESULT-SERVER-MATTE.md` (laptop, "RVM 19.8 wall fps, DML device 0") **must be re-checked**: device 0 is the iGPU in this probe.
- Every run below uses dev1. nvidia-smi was sampled every 1 s during each run: "NVIDIA GeForce RTX 3070 Laptop GPU", 8 to 49 % util, 354 MiB (see `nvidiaSmiSamples` in the JSONs).

## Results (full clip, 1798 frames, dev1)

| Variant | Window (Paris) | Concurrent with | wallFps | **s/min TOTAL** | **s/min inference only** | inf ms avg / p95 | preproc ms | post ms avg | s/min post | Status |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| **C** (no post) | 01:58:57–02:00:51 | nothing | 15.93 | **112.97** | **69.21** | 38.2 / 60.4 | 10.8 | 1.9 | 3.4 | **clean** |
| **E2-fgr** | 02:00:51–02:05:34 | **inline encode of the checker clip** (numpy composite + libx264 CRF18) + stills, same process | 6.37 | **282.79** ⚠ | **117.13** ⚠ | 65.1 / 77.5 | 13.1 | **29.6** | **53.21** | contaminated by the clip encode |
| bg-prep (E2b prep pass) | 02:05:34–02:08:20 | nothing | 10.82 | 166.37 | 78.17 | 43.3 / 75.2 | 21.3 (s/min) | 26.2 (temporal accumulation) | 47.16 | clean, but this is a prep pass, not a variant |
| **E2b** | 02:08:20–02:14:47 | **duplicate RVM job of mine** (`e2b_only.py`, PID 5364) on the same GPU/CPU, 02:09:04 → ~02:12 (≈3 of 6.5 min) | 4.65 | **386.98** ⚠ | 141.37 ⚠ | 78.6 / 130.5 | 11.3 | **113.0** | 203.43 | **contended, not clean** |

- *Derived (estimate, not measured):* clean E2-fgr ≈ C TOTAL 113 + post 53 ≈ **~166 s/min**. It needs a clean re-run without the clip encode.
- E2b: no clean figure. The clean re-run (`e2b_clean.py`) was stopped at 02:17 with no result (GPU handed to RTC).
- **Does the +25 ms post vanish on GPU? No.** The erosion (PIL `MinFilter(3)`) and the E2b despill run **on the CPU** in Python. Measured on this laptop:
  - erosion **29.6 ms/frame** (Media's box Xeon: 25 ms);
  - despill **~113 ms/frame**, under contention.
  - These costs only go away if the post-processing moves to the GPU (DML/torch op or shader). Not done.

## Flicker clip (Designer)
- `flicker-E2-fgr-checker-25-40s.mp4` (box `/workspace/uploads/`, not committed, 5.4 MB):
  - 15 s, t = 25 to 40 s (hands raised), 1280×720, 30 fps, 450 frames, H.264 CRF18;
  - E2-fgr over a 16 px checker (200/120).
- Full 60 s version: on the laptop at `s3-server-matte/gpu-e2/flicker-E2-fgr-checker.mp4`.
- Still `gpu-e2/clip-frame-32s.png`: both hands whole, open fingers, light edge on the hair. The motion verdict belongs to Designer.

## Live control-room cadence (reminder, backlog P1)
- The matted canvas is capped at ~**14 distinct fps** by the paint rate. Media `distinct_fps.py`: matted **14.0**, raw **29.8**. LiveKit also sees ~14 fps.
- Criterion: **≥24 distinct fps** (not 30 ticks with duplicates). Backlog P1, **no fix tonight**.
- `tools/distinct_fps.py` will be used for the next live take.

## Files
- `gpu-e2/result-C.json`, `result-E2-fgr.json`, `result-bg-prep.json`, `result-E2b-contended.json`, `result-gpu-e2.json` (aggregate written by the run; its E2b entry = contended), `gpu_bench_e2.py`, `clip-frame-32s.png`.
