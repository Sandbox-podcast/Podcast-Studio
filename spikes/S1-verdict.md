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
| **Edge `vision-s3` subscribe getStats — Take 1** **~23:05 Europe/Paris** | [`S1-sfu.md`](S1-sfu.md) § Edge getStats |
| → Room **`s1-lab`** · publisher **`vision-s3`** (Loïc: LiveKit publish on Edge **:8088** Vision harness) | Same |
| → Join **~2046 ms** · **9** samples **~25 s** · video **0 bps**, fps **—** on LOW **320×180** | **Take 2 root cause:** background tab paused `rAF` / `captureStream` |
| **Take 2 (2026-10-05 23:29–23:36 Paris)** Edge **foreground**, publisher **`vision-s3`**, laptop loopback | [`S1-sfu.md`](S1-sfu.md) § Take 2 |
| → Subscriber: headless Chromium, harness **`mode=none`** · join **1872 ms** · **140** samples (**3 s**), **0** console errors | Tail samples per track only |
| → Inbound: video **121–178 kbps**, **20 fps**, **320×180** LOW, loss **0 %**, RTT **2–3 ms**; audio **~1 kbps** | **CORRECTION:** content was S3 **synthetic smoke** canvas (Media RUN2), **not** MediaPipe matted cam → **transport PASS**, **cam content NOT VALIDATED** |
| **Take 4 (2026-10-06 ~00:47 Paris)** `?v=s4-matfix7` MediaPipe + LiveKit publish · Edge foreground · room **`s1-lab`** | [`S1-sfu.md`](S1-sfu.md) § Take 4 · artifacts `/workspace/s1-soak/` |
| → Subscriber **`rtc-sub-take4`** · join **1589 ms** · **594** samples (**3 s**, run ends **01:13:41**) · screenshots **sub-shot-66..116** (00:47:00–00:49:32) show **matted silhouette** (dark green bg) live | Content through SFU **PASS** (loopback, **LOW** layer only) |
| → Active numeric window **00:46:53–00:48:28**: video **94 / 155 / 196** kbps min/med/max, fps **12 / 14 / 20**, res **320×180**, **0** zero-kbps samples; loss med **0 %**; RTT med **~3 ms** | After **00:48:31** table bitrate often dash — post-window kbps **NOT VALIDATED** from table (screenshots still change until 00:49:32) |
| → Audio inbound (last_rows): track present **~2 kbps**, loss **0 %** | Series is video-only; dedicated WAV speech soak **in progress** |
| **Overnight soak 5-pax** room **`s1-soak`** **01:14:11–01:44:34** Paris | connectivity **6/6** held 30 min; **HD = NOT VALIDATED** (env limit, not product FAIL) — see QLR |
| Harness **`pickRtpReport` fix** | Commit **`e512cb5`** — [`public/harness.js`](s1-lab/livekit-oss/public/harness.js) |
| **DEV CORS** LAN | [`server.mjs`](s1-lab/livekit-oss/server.mjs) — `192.168.x.x` origins + localhost |

### What “PASS” means here

- **PASS** = measured connectivity / publish / subscribe on the **stated host path** (dev box loopback multi-pax **or** laptop LAN smoke / Vision synth **or** subscribe-only join to Edge publisher **`vision-s3`** with remote seen).
- **Not implied** : WAN France, **second physical device** on LAN (firewall), **HD simulcast layer** on take 4 sub, MediaPipe edge quality, **LOW-END** inventory, WAN AC-RTC-002.
- **Take 2 lesson:** non-zero bitrate ≠ matted cam — always cross-check content (Media contact sheet / subscriber screenshot).

---

## Verdict draft (POC-scoped, honest)

| Scope | Result | Notes |
| --- | --- | --- |
| **Connectivity / SFU self-host POC (dev box)** | **PASS** | **5** canvas clients; connectivity-only script — loopback |
| **LAN laptop — host-local smoke + Vision synth pub/sub** | **PASS** | **192.168.1.68**; RTC smoke + Vision on **same** machine; synth video |
| **LAN laptop — subscribe Edge publisher `vision-s3` (getStats window)** | **connectivity PASS** | Join **~2046 ms**, remote seen; Playwright harness subscribe-only |
| **SFU transport (canvas/smoke or matted, loopback)** | **PASS** | Take 1 idle **0 bps**; Take 2 smoke canvas through SFU; Take 4 matted silhouette through SFU |
| **Cam / matted **content** through SFU (Take 2)** | **NOT VALIDATED** | Take 2 was smoke, not MediaPipe |
| **Cam / matted **content** through SFU (Take 4)** | **PASS** (loopback, LOW **320×180**) | Screenshots + getStats; **HD** layer **NOT VALIDATED** on take 4 sub |
| **5-pax overnight soak (30 min)** | **connectivity PASS** · **HD NOT VALIDATED** (env) | **01:14–01:44** Paris · `s1-soak` · 5 pubs+1 sub on **one machine** · sub HD samples **3** @ fps **8** · LiveKit CPU med **~25%** · pub `qualityLimitationReason` CSV: **cpu 487 / none 362 / bandwidth 31** (n=880) — [#7](https://github.com/Sandbox-podcast/Podcast-Studio/issues/7) audio kbps NaN |
| **Audio speech (take4 WAV) 5 min** room **`s1-soak-audio`** | **PASS speech energy** · bitrate kbps **NOT VALIDATED** | **01:45:08–01:50:19** · 3 pubs · energy **0.13→7.35** · audioLevel med **0.066** (n=177) · loss **0%** · jitter med **6 ms** · 3 SSRCs |
| **Production-readiness** | **NOT VALIDATED** | No SLO / prod sign-off |
| **WAN / France participants** | **NOT VALIDATED** | No WAN path measured |
| **LAN multi-device (≥2 machines)** | **INCOMPLETE** | Host-local on laptop OK; **Windows Private firewall** rules still needed for peers (TCP 7880/7881/5190, UDP 50000–50200; Media MinIO TCP 9000/9001 noted) |
| **Real cameras / MediaPipe / FPS gates** | **NOT VALIDATED** | Edge publish confirmed by Loïc; inbound getStats window **not** proof of active video; MediaPipe/FPS **not** gated here |
| **LOW-END inventory (i5 pass)** | **NOT VALIDATED** | Laptop run = **MID** (i7+RTX3070) |
| **AC-RTC-001 (≥ 20 min stable 5 pax)** | **PASS connectivity (loopback)** · **HD NOT VALIDATED** | 30 min · 6/6 · QLR dominated by **`cpu`** on single-host 5-pub+sub → real HD check = **multi-machine LAN** after Loïc firewall OK |
| **AC-RTC-002 on WAN** | **INCOMPLETE** | Do not extrapolate loopback / host-local metrics |
| **Cost gate €/h** | **N/A** | POC self-host lock |

---

## Recommendation

1. **Keep LiveKit OSS** as the **POC SFU stack** (vote B; dev box + **Loïc laptop LAN** both runnable).
2. **Next lab step:** **multi-device LAN** on **192.168.1.68** after **Private profile firewall** rules; then real cams/mic, MediaPipe/FPS, and **LOW-END** inventory when available.
3. **Do not claim** WAN or France-path AC-RTC-002 from dev **loopback** or laptop **host-local** runs.
4. **D-04:** managed **cloud SFU** remains **product hypothesis post-POC** unless Loïc amends — see [`S1-D04-POC-override.md`](S1-D04-POC-override.md).

---

## Décision lead 2026-10-06 17:40 — simulcast 3 couches (3L) pour le POC live

**Indicatif, N=2 par condition** (séquence 17:07), plus 1 run solo à 11:50. Décision lead, voir **D-12** (PR #13, brouillon, **en attente de l'OK de Loïc**).

- **Décision :** garder le **simulcast 3L** (3 couches) pour le POC live.
- **Preuves : verdicts régie du Designer** (aucun autre PASS/FAIL n'est posé ici) :
  - **3L PASS 3/3 :** 3L-a et 3L-b (séquence 17:07), 3L solo 11:50.
  - **2L FAIL 2/3 :** 2L-a (démarrage en 320×180 pendant ~38 s, puis 3 gels) ; 2L solo 11:50 (coupure bandwidth en milieu de run, passage en 180p). 2L-b : PASS.
- **Données :** [`results-20261006-1707-seq/README.md`](s1-lab/livekit-oss/scripts/ab/results-20261006-1707-seq/README.md) (commit `b8c06c9`) · [`results-20261006-1150-solo-pair/SUMMARY.md`](s1-lab/livekit-oss/scripts/ab/results-20261006-1150-solo-pair/SUMMARY.md) (commit `65dba99`).
- **Crops du Designer :** box `/workspace/uploads/designer/seq170746/` (2L-a t15/t29/t60, 2L-b t20/t90, 3L-a t20/t90, 3L-b t20/t90, face-zoom ; hors repo).
- **Cause de la rampe bandwidth lente en 2L :** **NON VALIDÉE**. BWE de départ basse (808 et 1 384 kbps), qui monte d'environ 4 kbps/s, avec 0 creux caméra mesuré. Par décision du lead, elle **n'est pas investiguée plus avant**.

---

## Sign-off (empty)

| Role | Name | Date | OK / comments |
| --- | --- | --- | --- |
| Loïc | | | |
| Lead | | | |
