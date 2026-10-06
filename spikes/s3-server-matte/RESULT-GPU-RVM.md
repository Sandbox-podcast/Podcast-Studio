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

### Designer verdict (2026-10-06 02:24 Paris)
- **Stills: PASS** (hair + hands, no leak).
- **Motion: FAIL.** On a fast gesture around **33–34 s** of the source, the hand turns semi-transparent ("ghost hand") and a white leak from the original background appears beside it.
- Scope (lead): this blocks the quality of the **delivered matte**. It does **not** block the master choice (raw cam). It argues for keeping the raw.
- So E2-fgr is the POC post-processing choice **for stills only**. It is not validated in motion. E2b stays the fallback.
- Next (CUDA run, not DirectML): clean C + E2-fgr with no encode in the pass and erosion on GPU; same 25–40 s sequence at downsample_ratio 0.4 / 0.6 / 1.0; side-by-side at 32 s and 33.2–34.0 s. PASS = opaque palm, no checker through it, no white leak. If ds is not enough, the next lever is a temporal mask.

## Live control-room cadence (reminder, backlog P1)
- The matted canvas is capped at ~**14 distinct fps** by the paint rate. Media `distinct_fps.py`: matted **14.0**, raw **29.8**. LiveKit also sees ~14 fps.
- Criterion: **≥24 distinct fps** (not 30 ticks with duplicates). Backlog P1, **no fix tonight**.
- `tools/distinct_fps.py` will be used for the next live take.

## Files
- `gpu-e2/result-C.json`, `result-E2-fgr.json`, `result-bg-prep.json`, `result-E2b-contended.json`, `result-gpu-e2.json` (aggregate written by the run; its E2b entry = contended), `gpu_bench_e2.py`, `clip-frame-32s.png`.

## Nuit 2026-10-06 : matting navigateur v7 en live (laptop MID i7-11370H, pas le LOW-END i5+iGPU)

Mesures uniquement, 1 run chacune, loopback local.

**v7 côté invité, même onglet que `ab-file-2L-on` (03:36–03:38)** : paint 16,5 fps, traitement p50 33,4 / p95 55,4 ms ; couche HD envoyée 1280×720@15 ; sub HD 14,4 fps distincts, part ≥24 = 0,0, 4 gels (2,24 s). Verdict Designer : FAIL régie (cadence et qualité).

**v7 sur N flux dans un seul onglet Edge, côté régie (04:15–04:23, 60 s par palier)** — MediaPipe sur l'Iris Xe (ANGLE Intel D3D11), pas la RTX :

| N | Paint fps / flux | p50 / p95 traitement | CPU onglet / machine |
|---|---|---|---|
| 1 | 24,5 | 21,6 / 30,5 ms | 17,6 % / 53 % |
| 2 | ~15,5 | 28 / 36,7 ms | 22,4 % / 61 % |
| 3 | 9,7 | 31 / 39,5 ms | 22,8 % / 70 % |
| 5 | ~5,2 | 35 / 43,6 ms | 26,9 % / 95 % |

Verdict Designer : FAIL dès N = 2 (barre ≥24 fps, p95 < 41 ms). Défauts qualité : crâne vert, mains fantômes, fuite bureau/écran, bord de joue coupé.
Non testés (ni ouverts ni fermés) : worker/OffscreenCanvas, dGPU forcé. Le temps réel serveur (1 puis 5 flux) se mesure au run CUDA.
Données box : `/workspace/uploads/vision-multi/`, harness `/workspace/s3-ab-v7/multi/`.

## 2026-10-06 matin : DirectML RTX 3070 (laptop) puis CUDA RTX 4080 SUPER (desktop-ai)

Mesures seulement. Les verdicts qualité sont ceux de Designer et du lead. Clip : `vision-host-raw-1791240416301.webm`, segment 25–40 s, 1280×720 à 30 fps. Modèle `rvm_mobilenetv3_fp32.onnx`. Scripts dans `scripts/`.

### DirectML, RTX 3070 Laptop (device 1), « ordre de grandeur RTX 3070 Laptop »
Temps réel, C ds 0,4, N = 1 : 23,8 fps tenus, latence p50 58,6 / p95 77,4 ms, inférence p50 32,5 / p95 44,8 ms, GPU 35 % (max 42 %).
À N = 2 (sessions DML dans des threads), le pilote NVIDIA D3D12 a planté (`nvwgf2umx.dll`, c0000005). Pas de chiffre : c'est un crash, pas un plafond.

| Variante | ds | s/min total | s/min inférence seule | inf p50/p95 ms | post p50 ms |
|---|---|---|---|---|---|
| C | 0,4 | 97,81 | 66,7 | 35,94 / 41,92 | 8,88 |
| E2-fgr | 0,4 | 171,76 | 81,93 | 34,78 / 75,55 | 37,87 |
| C | 0,6 | 112,03 | 78,29 | 41,31 / 47,81 | 9,54 |
| E2-fgr | 0,6 | 187,47 | 102,35 | 56,98 / 63,76 | 37,21 |
| C | 1,0 | 166,06 | 127,97 | 68,78 / 83,25 | 10,83 |
| E2-fgr | 1,0 | 238,77 | 138,65 | 72,64 / 104,21 | 41,1 |

Designer : ds 0,4 est le meilleur, PASS réservé. ds 0,6 et 1,0 sont FAIL. Sur ces stills, C et E2-fgr ne se distinguent pas.

### CUDA, desktop-ai, « ordre de grandeur GPU desktop (RTX 4080 SUPER), GPU partagé avec le bureau »
onnxruntime-gpu 1.30.0 avec les wheels pip CUDA 13 / cuDNN 9, dans un venv isolé de 1,87 Go (`C:\Users\azero\podcast-studio\cuda-venv`). Aucune install système, pilote 610.88 inchangé.

| Variante | ds | s/min total | s/min inférence seule | inf p50/p95 ms | post p50 ms |
|---|---|---|---|---|---|
| C | 0,25 | 28,67 | 16,98 | 8,26 / 10,0 | 3,01 |
| C | 0,4 | 30,72 | 18,61 | 10,18 / 11,4 | 3,09 |
| E2-fgr | 0,4 | 66,9 | 23,9 | 10,95 / 21,93 | 19,31 |

Temps réel, C ds 0,4, cadence 30 fps par flux, **un process par flux** :

| N | fps par flux | latence p95 max | inf p50 | GPU moy / max |
|---|---|---|---|---|
| 1 | 29,92 | 23,7 ms | 11,6 ms | 27 / 55 % |
| 2 | 29,85 | 22,7 ms | 13,4–13,8 ms | 38 / 46 % |
| 3 | 29,45–29,67 | 57,2 ms | 21–22,7 ms | 52 / 62 % |
| 5 | 24,6–25,8 | 77,9 ms | 27,9–29,4 ms | 73 / 86 % |

**N = 5 dans un seul process batché (batch 5) : non concluant, résultat contaminé.** Deux tests Rbitnet (`bitnet_core`) ont démarré sur le GPU à 12:05:26 puis 12:06:17, alors que le run allait de 12:04:44 à 12:05:44. Résultat mesuré : 11,9 fps par flux. La boucle de ce harness est sérielle : préparation CPU ~32 ms, puis inférence du batch ~46 ms (soit 9,3 ms par image). Le pic VRAM est attribué à Rbitnet. Le lead n'a pas retenu de version optimisée pour le POC.

Designer : C ds 0,25 est le meilleur, PASS réservé en live. **Pas de PASS master** (halo le long des doigts et de la paume, halo en haut des cheveux, mèche de fond restée dans le masque). E2-fgr n'apporte rien et il est abandonné.

### Traitement des bords sur stills (C ds 0,25)
Coût p50 par image, CPU sur un seul thread, numpy/PIL non optimisé, Ryzen 7 9800X3D :
- a, décontamination de la couleur (blur-fusion) : 391 ms. Designer : aucun gain visible, écartée.
- b, alpha resserré de 1 px puis flou σ 0,8 : 24 ms. Designer : seul gain visible (liseré plus fin), mais le liseré reste visible sur fond sombre. **Retenu par le lead comme candidat de bord pour le live**, à porter en shader/GPU.
- c = a + b : 416 ms. Designer : identique à b, écarté.
- b à 2 px : stills calculés sur la box (matte en CPU EP), coût box 60–69 ms (b à 1 px : 32–34 ms sur la box). Verdict « main rapide 33,4 s rongée ou pas » : en attente de Designer.

Pour le master re-détouré, le lead note une nouvelle piste S3 : un détourage serveur plus lourd, en async. Choix du modèle et OK de Loïc avant tout téléchargement.
