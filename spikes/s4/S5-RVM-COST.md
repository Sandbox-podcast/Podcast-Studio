# S5 — Async RVM re-matting cost (1 h episode × 5 guests = 5 h of 720p30 raw)
**Fetched:** 2026-10-06 (Paris). Prices excl. VAT unless noted.  
**Workload:** Robust Video Matting mobilenetv3 on 720p30 masters.

> **Read this first — every s/min below is from a CPU-bound pipeline, not GPU capacity.**  
> All throughput rows (box CPU, Iris Xe/DirectML, RTX 3070/DirectML) are bottlenecked by decode, pre/post-processing (PIL on CPU) and the DirectML path. On the clean RTX 3070 run nvidia-smi showed only **8–38 % GPU utilisation** (354 MiB).  
> Consequently every € / episode figure in this doc is a **PESSIMISTIC UPPER BOUND**, not an estimate of real cost.  
> **Real cost measurement = CUDA run** (torch or onnxruntime-gpu, decode + erosion on GPU), first on the RTX 3070, then on an L4. Scheduled for **tomorrow (Vision)** — not tonight.

## Measured throughput (do not invent)
| Source | Device | wallFps | s/min footage | realtime | wall hours / episode (5 h serial) |
|---|---|---:|---:|---:|---:|
| Vision laptop, 01:09 run (`DML device 0`) | **Iris Xe (iGPU) via DirectML, CPU-bound pipeline** | 19.8 | 91 | 0.66× | **7.58** |
| Vision laptop, take 4, 1798 fr, ds 0.4, variant C (clean) | **RTX 3070 Laptop via DirectML** (`device_id=1`), CPU-bound pipeline | 15.93 | **112.97** total · **69.21** inference-only | 0.53× | **9.41** total (5.77 inference-only, *derived*) |
| Box (Podcast Media) | Xeon 8c CPU ORT, ds 0.375 | 17.26 | 104.3 | 0.575× | **8.69** |

- **Relabel (2026-10-06 02:18, Vision):** the 01:09 "19.8 fps / 91 s/min" figure was previously labelled RTX 3070. DML device 0 on this laptop is the **Intel Iris Xe**, not the 3070 (probe: dev0 105 ms/inf at 0 % nvidia-smi; dev1 = 3070, 35.4 ms/inf).
- Clean 3070 run: nvidia-smi **8–38 %** util, **354 MiB** → GPU mostly idle; wall time dominated by the CPU side.
- Hours/episode = 300 min × s/min ÷ 3600 (arithmetic on measured s/min).

Source: Vision, PR #4 commit `26ad4e6`, `spikes/s3-server-matte/RESULT-GPU-RVM.md` (+ `gpu-e2/result-C.json`).

### RTX 3070 post-processing variants (Vision, same source)
| Variant | s/min | Status |
|---|---|---|
| C (no post) | 112.97 total / 69.21 inference | **measured, clean** |
| E2-fgr | 282.79 total (inference 117.13 + post 53.21) | **measured, NOT clean** — checker-clip encode ran in the same pass |
| E2-fgr clean | ~166 (C 113 + post 53) | **ESTIMATE, not a measurement** — needs clean re-run |
| E2b | — | measured 386.98 under contention (duplicate RVM job on same GPU/CPU): **not clean, do not cite** |

- **downsample_ratio:** the clean RTX 3070 row and box variant C are at ds **0.4** (box A/B and the box headline row: 0.375). Vision's CUDA run will also test ds **0.6 / 1.0** (Designer flicker FAIL on fast gestures, 2026-10-06 02:25); higher ds **will raise s/min** vs ds 0.4 — **no number until measured**.
- Erosion (PIL `MinFilter(3)`) runs **on the CPU**: **29.6 ms/frame** on the laptop (box Xeon: 25 ms). It does **not** go away on a GPU run unless ported to the GPU (DML/torch op or shader) — not done.

5 parallel jobs (one GPU each): wall ≈ serial / 5 (upper-bound inputs as above).
- RTX 3070 DML clean, serial 9.41 h → parallel **1.88 h** wall if 5 GPUs (*derived*).
- Iris Xe/CPU-bound 01:09 figure, serial 7.58 h → parallel **1.52 h** (*derived*).
- Box CPU serial 8.69 h → parallel **1.74 h** if 5×8-core boxes (*derived*).

## Estimated throughput (separate from measured)
> **Caveat:** the multipliers below are unsourced working assumptions (no published RVM benchmark on L4/L40S/A10 found); treat € figures in EST rows as order-of-magnitude only. **Baseline correction:** these rows were computed on the 91 s/min figure previously labelled "3070"; that figure is the **Iris Xe / CPU-bound** run. Rows are **not** re-based here (no new numbers invented); all EST rows inherit the CPU-bound pipeline and are **pessimistic upper bounds**. Re-base after the CUDA 3070 → L4 run.
| GPU | Assumed mult vs 91 s/min baseline (formerly "3070") | Est. wall h / episode serial | Est. wall h / episode ×5 parallel |
|---|---:|---:|---:|
| L4 | 1.30× | 5.83 | 1.17 |
| L40S | 2.86× | 2.65 | 0.53 |
| A10 | 0.90× | 8.42 | 1.68 |

Assumptions:
- **L4:** ESTIMATE: L4 ~1.3× baseline wall for RVM; not measured on L4 (unsourced)
- **L40S:** ESTIMATE: L40S ~2.2× L4 ≈ 2.86× baseline; not measured (unsourced)
- **A10:** ESTIMATE: A10 ~0.9× baseline for this workload; not measured (unsourced)

## EU cloud € / episode (compute only) — PESSIMISTIC UPPER BOUND
| Provider | SKU | €/h | Kind | Wall h (serial / ×5 parallel) | €/episode serial | €/episode ×5 | €/month @4 ep serial |
|---|---|---:|---|---|---:|---:|---:|
| Scaleway PAR | L4-1-24G | 0.79 | EST | 5.83 / 1.17 | **4.61** | **4.62** | 18.44 |
| Scaleway PAR-2 | L40S-1-48G | 1.47 | EST | 2.65 / 0.53 | **3.9** | **3.9** | 15.6 |
| OVHcloud GRA | l4-90 | 0.75 | EST | 5.83 / 1.17 | **4.37** | **4.39** | 17.48 |
| OVHcloud GRA | l40s-90 | 1.40 | EST | 2.65 / 0.53 | **3.71** | **3.71** | 14.84 |
| OVHcloud GRA | a10-45 | 0.76 | EST | 8.42 / 1.68 | **6.4** | **6.38** | 25.6 |
| OVHcloud GRA | t1-45 V100 | 0.70 | EST | 8.42 / 1.68 | **5.89** | **5.88** | 23.56 |
| Hetzner FSN | GEX44 RTX4000 Ada (monthly) | 0.3205 (≈€234/mo) | EST | 5.83 / 1.17 (×5 boxes) | 1.87 (util) | 1.88 (5×util) | **234** always-on |

### Price sources (URL + date)
- https://www.scaleway.com/en/pricing/gpu/ — fetched **2026-10-06** (Scaleway PAR)
- https://www.scaleway.com/en/l40s-gpu-instance/ (list €1.47/h start) — fetched **2026-10-06** (Scaleway PAR-2)
- https://www.ovhcloud.com/en-ie/public-cloud/prices/ — fetched **2026-10-06** (OVHcloud GRA)
- https://www.hetzner.com/dedicated-rootserver/gex44 (search/cache €234/mo excl. VAT; page 404 via fetch) — fetched **2026-10-06** (Hetzner FSN)
- Scaleway L40S start **€1.47/h**: https://www.scaleway.com/en/l40s-gpu-instance/ — fetched 2026-10-06
- Hetzner GEX44 **€234/mo** excl. VAT (search/secondary; dedicated page fetch 404): https://www.hetzner.com/dedicated-rootserver/gex44 — 2026-10-06

## Storage / episode
| Asset | Basis | Size / episode (5 h) |
|---|---|---:|
| Raw masters (×5 guests) | measured take4 raw **2.628 Mbps** ≈ **19.72 MB/min** | **~5.9 GB (≈5.5 GiB)** |
| Live Edge matted (reference only) | take4 matted ~12.9 MB/min | ~3.78 GiB |
| Server RVM output (ESTIMATE) | ~15.0 MB/min VP9-alpha-class placeholder — **not measured encode this run** | ~4.39 GiB |

## Recommendation (cost, not quality)
- Cheapest EU on-demand for this async job: **OVH L4 €0.75/h** or **Scaleway L4 €0.79/h** → ≤ ~**€4–5 / episode serial** at estimated L4 throughput, or ≤ ~**€4–5 / episode** with 5× parallel (same €, less wall clock). **Upper bound** (CPU-bound pipeline + unsourced multiplier).
- Measured Iris Xe/CPU-bound 01:09 figure (~7.6 h serial, formerly labelled 3070): if rented at ~€0.75–0.79/h → ≤ ~**€5.7–6.0 / episode** (upper bound).
- Measured RTX 3070 DML clean (9.41 h serial, CPU-bound; GPU 8–38 % util): slower than the Iris Xe figure, confirming the pipeline, not the GPU, sets the rate. Do not use it as GPU capacity.
- Real cost: pending CUDA run (decode + erosion on GPU) on 3070 then L4 — Vision, tomorrow.
- Box CPU alone is free here but **8.69 h serial / episode** — fine for spikes, not for prod SLA.
- Always-on Hetzner GEX44 (~€234/mo) makes sense only if utilization is high (many episodes + other GPU work).

## RVM variants cost (box CPU measured)

| Variant | s/min footage | wallFps | Episode serial h (5 h footage) | notes |
|---|---:|---:|---:|---|
| A/B mnet ds=0.375 | 104.3 | 17.26 | 8.69 | full |
| C mnet ds=0.4 | 111.5 | 16.15 | 9.29 | full; +7% vs A |
| D resnet50 ds=0.375 | 191.3 | 9.41 | 15.94 | **EXTRAP** from 15–55s timed after warm |
| E post on C | 111.5 (parent) | 16.15 | 9.29 | post stills-only negligible |

