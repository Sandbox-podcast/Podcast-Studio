# S1 — Verdict draft (POC self-host SFU)

| | |
| --- | --- |
| **Date** | 2026-10-05 |
| **Auteur** | Podcast RTC |
| **Statut** | **DRAFT — ready for review** (Loïc / lead) |
| **Liens** | [`S1-sfu.md`](S1-sfu.md) · [`S1-QCM.md`](S1-QCM.md) · [`S1-D04-POC-override.md`](S1-D04-POC-override.md) |

---

## Evidence (measured — do not extend beyond citations)

| Item | Source |
| --- | --- |
| Stack POC **B — LiveKit OSS self-host** | Salon vote locked **2026-10-05** — [`S1-QCM.md`](S1-QCM.md) Q1 |
| Plafond SFU **€/h = N/A** (POC self-host) | Loïc via lead **2026-10-05** — [`S1-QCM.md`](S1-QCM.md) Vote 2, [`S1-sfu.md`](S1-sfu.md) |
| **LAB DEV local UP** (shared dev box) | Harness **:5190**, SFU **:7880**, room **`s1-lab`** — [`S1-sfu.md`](S1-sfu.md), [`s1-lab/livekit-oss/README.md`](s1-lab/livekit-oss/README.md) |
| Smoke **canvas join PASS** (no camera) | Headless / dev box — [`s1-lab/livekit-oss/`](s1-lab/livekit-oss/) |
| **Multi-pax local smoke (re-run post-fix)** **2026-10-05 18:40:56–18:41:51 Europe/Paris** | [`s1-lab/livekit-oss/scripts/multi-pax-results.md`](s1-lab/livekit-oss/scripts/multi-pax-results.md) · [`multi-pax-results.json`](s1-lab/livekit-oss/scripts/multi-pax-results.json) |
| → **5/5 connected**; **4 remotes each** (clean room) | Same |
| → **Outbound post-fix** (harness): **73 / 115 / 2410** kbps min/med/max (n=48) — **`pickRtpReport` validated** (`e512cb5`) | Same |
| → **Inbound** video: **73 / 112 / 164** kbps; loss **0 %**; FPS med **15**; res **320×180** | Same |
| → RTT **0–3 ms** | **Loopback only** on dev box — not WAN France |
| **LAB LAN laptop** **2026-10-05** (Europe/Paris) | [`S1-sfu.md`](S1-sfu.md) § LAB LAN LAPTOP · [`livekit-oss/README.md`](s1-lab/livekit-oss/README.md) |
| → Host **LAPTOP-BI8P2KF3** · deploy `C:\Users\azero\s1-livekit-oss` | Same |
| → LAN IPv4 **192.168.1.68** (Wi‑Fi); ignored: 169.254.x, 192.168.56.1 (VBox), 172.30.144.1 (WSL/Hyper-V) | Same |
| → URLs: harness `http://192.168.1.68:5190`, SFU `ws://192.168.1.68:7880`, room **`s1-lab`** | Same |
| → `livekit-server:v1.8.4` · `rtc.node_ip: 192.168.1.68` · TCP **7880/7881**, UDP **50000–50200** (no MinIO **9000/9001**) | Same |
| → Harness in Docker **`s1-harness`** (`node:20-bookworm`, **0.0.0.0:5190**) — host npm broken on laptop | Same |
| → Smoke RTC: harness HTTP **200**, token → `ws://192.168.1.68:7880` + JWT, LiveKit HTTP **200**, log `nodeIP=192.168.1.68` | Same |
| → Vision (host-local synth, same laptop): **publish PASS** `vision-s3-laptop` / `vision-s3-synth`; **pub+sub PASS** `vision-s3-pub` → `vision-s3-sub`, track received, **22 frames**, `connection_quality=2` | Inventory **MID** (i7+RTX3070) — **not** LOW-END i5 pass |
| Harness **`pickRtpReport` fix** | Commit **`e512cb5`** — [`public/harness.js`](s1-lab/livekit-oss/public/harness.js) |
| **DEV CORS** LAN | [`server.mjs`](s1-lab/livekit-oss/server.mjs) — `192.168.x.x` origins + localhost |

### What “PASS” means here

- **PASS** = measured connectivity / publish / subscribe on the **stated host path** (dev box loopback multi-pax **or** laptop LAN **host-local** smoke + Vision synth).
- **Not implied** : WAN France, **second physical device** on LAN (firewall), real webcams, MediaPipe/FPS gates, **20 min** soak, **LOW-END** inventory profile.

---

## Verdict draft (POC-scoped, honest)

| Scope | Result | Notes |
| --- | --- | --- |
| **Connectivity / SFU self-host POC (dev box)** | **PASS** | **5** canvas clients; connectivity-only script — loopback |
| **LAN laptop — host-local smoke + Vision synth pub/sub** | **PASS** | **192.168.1.68**; RTC smoke + Vision on **same** machine; synth video |
| **Production-readiness** | **NOT VALIDATED** | No SLO / prod sign-off |
| **WAN / France participants** | **NOT VALIDATED** | No WAN path measured |
| **LAN multi-device (≥2 machines)** | **INCOMPLETE** | Host-local on laptop OK; **Windows Private firewall** rules still needed for peers (TCP 7880/7881/5190, UDP 50000–50200; Media MinIO TCP 9000/9001 noted) |
| **Real cameras / MediaPipe / FPS gates** | **NOT VALIDATED** | Synth only on laptop; MediaPipe/FPS **deferred until cam** |
| **LOW-END inventory (i5 pass)** | **NOT VALIDATED** | Laptop run = **MID** (i7+RTX3070) |
| **AC-RTC-001 (≥ 20 min stable 5 pax)** | **INCOMPLETE** | Dev smoke hold **50 s** only |
| **AC-RTC-002 on WAN** | **INCOMPLETE** | Do not extrapolate loopback / host-local metrics |
| **Cost gate €/h** | **N/A** | POC self-host lock |

---

## Recommendation

1. **Keep LiveKit OSS** as the **POC SFU stack** (vote B; dev box + **Loïc laptop LAN** both runnable).
2. **Next lab step:** **multi-device LAN** on **192.168.1.68** after **Private profile firewall** rules; then real cams/mic, MediaPipe/FPS, and **LOW-END** inventory when available.
3. **Do not claim** WAN or France-path AC-RTC-002 from dev **loopback** or laptop **host-local** runs.
4. **D-04:** managed **cloud SFU** remains **product hypothesis post-POC** unless Loïc amends — see [`S1-D04-POC-override.md`](S1-D04-POC-override.md).

---

## Sign-off (empty)

| Role | Name | Date | OK / comments |
| --- | --- | --- | --- |
| Loïc | | | |
| Lead | | | |
