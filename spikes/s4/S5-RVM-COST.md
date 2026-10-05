# S5 — Async RVM re-matting cost (1 h episode × 5 guests = 5 h of 720p30 raw)
**Fetched:** 2026-10-06 (Paris). Prices excl. VAT unless noted.  
**Workload:** Robust Video Matting mobilenetv3 on 720p30 masters.

## Measured throughput (do not invent)
| Source | Device | wallFps | s/min footage | realtime | wall hours / episode (5 h serial) |
|---|---|---:|---:|---:|---:|
| Vision laptop | RTX 3070 DirectML | 19.8 | 91 | 0.66× | **7.58** |
| Box (Podcast Media) | Xeon 8c CPU ORT | 17.26 | 104.3 | 0.575× | **8.69** |

5 parallel jobs (one GPU each): wall ≈ hours for **1 h** of video = serial/5.
- 3070-class serial 7.58 h → parallel **1.52 h** wall if 5 GPUs.
- Box CPU serial 8.69 h → parallel **1.74 h** if 5×8-core boxes.

## Estimated throughput (separate from measured)
> **Caveat:** the multipliers below are unsourced working assumptions (no published RVM benchmark on L4/L40S/A10 found); treat € figures in EST rows as order-of-magnitude only. Vision's 3070 figure was taken under Edge load (lower bound).
| GPU | Assumed mult vs 3070 | Est. wall h / episode serial | Est. wall h / episode ×5 parallel |
|---|---:|---:|---:|
| L4 | 1.30× | 5.83 | 1.17 |
| L40S | 2.86× | 2.65 | 0.53 |
| A10 | 0.90× | 8.42 | 1.68 |

Assumptions:
- **L4:** ESTIMATE: L4 ~1.3× RTX 3070 wall for RVM (Ada datacenter vs consumer Ada/Ampere 3070); not measured on L4
- **L40S:** ESTIMATE: L40S ~2.2× L4 ≈ 2.86× 3070; not measured
- **A10:** ESTIMATE: A10 ~0.9× 3070 for this workload; not measured

## EU cloud € / episode (compute only)
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
- Cheapest EU on-demand for this async job: **OVH L4 €0.75/h** or **Scaleway L4 €0.79/h** → ~**€4–5 / episode serial** at estimated L4 throughput, or ~**€4–5 / episode** with 5× parallel (same €, less wall clock).
- Measured 3070-class (~7.6 h serial): if rented at ~€0.75–0.79/h → ~**€5.7–6.0 / episode**.
- Box CPU alone is free here but **8.69 h serial / episode** — fine for spikes, not for prod SLA.
- Always-on Hetzner GEX44 (~€234/mo) makes sense only if utilization is high (many episodes + other GPU work).
