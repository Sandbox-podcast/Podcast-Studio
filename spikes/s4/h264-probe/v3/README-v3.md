# H.264 HW-encode check v3 (decisive) — S4

Why v3: on LAPTOP-BI8P2KF3 the Intel Iris Xe (LUID `0x00000000_0x0001163E`) exposes **no `VideoEncode` engine** — only
VideoDecode (eng1, eng4), VideoProcessing (eng3), 3D, Copy. QuickSync encode most likely shows up under **VideoDecode**.
`VideoEncode` exists only on the RTX 3070 (LUID `..._0x00012950`). v2 only watched `VideoEncode`, so it could not see QuickSync.

## Files
| file | where | what |
|---|---|---|
| `hw-check-v3.mjs` | laptop | own browser (Playwright temp profile, synthetic canvas 1280x720@30 + oscillator, **no camera**, never touches Loïc's Edge). Phases: `idle-browser` (8 s), `mr-h264` (MediaRecorder `video/webm;codecs=h264`), `mr-vp8` (`video/webm;codecs=vp8,opus`), `ve-avc1-hw`, `ve-avc1-sw` (VideoEncoder avc1.42E01F 720p30 realtime, prefer-hardware / prefer-software). 20 s each, 1.5 s settle before each. MR: 2.5 Mbps, timeslice 1000, chunks counted then discarded in the page (nothing written except results.json). One compact line per phase. |
| `sample-gpu-v3.ps1` | laptop | ONE sampler for the whole run (PS 5, CIM only, French-Windows safe), 1 JSON line/s: CPU of OUR browser tree + machine CPU; GPU engines `engtype_Video*` + `engtype_3D`, formatted AND raw-delta, summed **per LUID\|engtype** and **per LUID\|engN\|engtype** (eng1 vs eng4); our tree per LUID\|engtype and per PID; `pidNames` for PIDs active on any Video* engine |
| (unchanged) `sample-cpu.ps1`, `ve-control.mjs`, `probe.mjs`, `run-probe.ps1` | | v2 tools, kept |

Sample attribution: the sampler and `nvidia-smi -l 1` run for the whole session; a sample (covers the ~1 s before it arrives) counts for a phase if it arrives in [start+0.9 s, end+0.3 s]. Engine keys missing in a sample count as 0.

## Laptop run (PowerShell 5 — `;` not `&&`; no `$env` edits needed)
1. Box → laptop (CopyFromBox), into `C:\Users\azero\podcast-studio\s4-h264-probe\tool\`:
   - `/workspace/podcast-studio/s4-h264/hw-check-v3.mjs` → `C:\Users\azero\podcast-studio\s4-h264-probe\tool\hw-check-v3.mjs`
   - `/workspace/podcast-studio/s4-h264/sample-gpu-v3.ps1` → `C:\Users\azero\podcast-studio\s4-h264-probe\tool\sample-gpu-v3.ps1`
   (the .ps1 must sit next to the .mjs)
2. Run (~110 s, light; one hidden off-screen 400x300 window):
```powershell
Set-Location C:\Users\azero\podcast-studio\s4-h264-probe\tool; & 'C:\Users\azero\AppData\Roaming\nvm\v20.11.0\node.exe' .\hw-check-v3.mjs --pw C:\Users\azero\podcast-studio\s4-dropin\node_modules\playwright-core --out C:\Users\azero\podcast-studio\s4-h264-probe --channel msedge --headed --secs 20
```
3. Output: `C:\Users\azero\podcast-studio\s4-h264-probe\hwv3-<UTC-ts>-headed\results.json` (phases + summaries + all raw samples). Bring it back with CopyToBox → `/workspace/podcast-studio/s4-h264/runs/hwv3-headed/results.json`.
   Optional headless comparison: same command without `--headed`.

## Reading the compact lines
```
mr-h264      mime=video/webm;codecs=h264 2.41Mbps ch=20 err=0 | cpu1core 65/70 sys 30/30 | 1163E:3D 29.7/32[32/32]{tree 11.1/12} 1163E:VDecode 32.5/35[35/35]{tree 32.5/35} 12950:VEncode 0.9/1[0/0] | nvsmi enc 1/2 gpu 4/5 | n=14
```
(example built from mocked samples, not real data) — `cpu1core` = our tree, % of one core, mean/max; per engine `LUIDtail:engtype raw-mean/max[formatted mean/max]{our tree mean/max}`; `VDecode`/`VEncode`/`VProcessing` = Video*; `nvsmi enc` = NVENC util.

Decision logic (compare against `ve-avc1-hw` = known HW path vs `ve-avc1-sw` = known SW path, and `idle-browser` = baseline):
- **QuickSync used** → `1163E:VDecode` (our tree) rises clearly above idle in `ve-avc1-hw`, and the same in `mr-h264`; tree CPU in `mr-h264` close to `ve-avc1-hw`, well below `ve-avc1-sw`. `perLuidEng` in results.json tells eng1 vs eng4.
- **NVENC used** → `12950:VEncode` > 0 and/or `nvsmi enc` > 0 in that phase.
- **Software (OpenH264)** → no Video* rise vs idle, CPU like `ve-avc1-sw`.
- `mr-vp8` = software VP8 baseline (expected: no Video* encode activity).
If VDecode also moves in `ve-avc1-sw`/`mr-vp8`, it's not encode (e.g. the canvas/compositor path) → look at the hw-minus-sw difference, not the absolute value.

## Box checks done (2026-10-06 ~04:00 Paris)
- `node --check hw-check-v3.mjs` OK.
- Dry run on box: `node hw-check-v3.mjs --channel chrome --secs 3 --idle-secs 3 --pw /usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core --out dryrun-v3` → all 5 phases ran (Linux fallback = tree CPU only, GPU n/a; `ve-avc1-hw` skipped because headless Linux Chrome reports isConfigSupported=false — on the laptop the v2 run showed avc1 prefer-hardware working: 601 frames, 0 errors). Output `dryrun-v3/hwv3-*/results.json`.
- PowerShell: parsed with portable pwsh 7.4.6 (`Parser::ParseFile`, 0 errors for all .ps1), then `sample-gpu-v3.ps1` was **executed against mocked CIM classes** (fake Iris VideoDecode eng1/eng4 + 3D, foreign 3D PID, NV VideoEncode PID): tree CPU, system CPU, per LUID|engtype / per eng / tree / per-PID / pidNames values came out exactly as expected; node summary + compact line checked on those samples. PS 5 syntax reviewed by hand (no `??`, `?.`, ternary, `&&`, `||=`; only `[ordered]`, `ConvertTo-Json -Depth`, Stopwatch — all PS 3+). Not run on real Windows.
