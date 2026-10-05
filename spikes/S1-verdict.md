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
| **LAB DEV local UP** | Harness **:5190**, SFU **:7880**, room **`s1-lab`** — [`S1-sfu.md`](S1-sfu.md) setup, [`s1-lab/livekit-oss/README.md`](s1-lab/livekit-oss/README.md) |
| Smoke **canvas join PASS** (no camera) | Headless / dev box fixes — [`s1-lab/livekit-oss/`](s1-lab/livekit-oss/) |
| **Multi-pax local smoke (re-run post-fix)** **2026-10-05 18:40:56–18:41:51 Europe/Paris** | [`s1-lab/livekit-oss/scripts/multi-pax-results.md`](s1-lab/livekit-oss/scripts/multi-pax-results.md) · raw [`multi-pax-results.json`](s1-lab/livekit-oss/scripts/multi-pax-results.json) |
| → **5/5 connected**; **4 remotes each** (clean room) | Same |
| → **Outbound** harness bitrate **73 / 115 / 2410** kbps min/med/max (n=48) — **`pickRtpReport` fix validated** (`e512cb5`) | Same |
| → **Inbound** video: **73 / 112 / 164** kbps; loss **0 %**; FPS med **15**; res **320×180** | Same |
| → RTT **0–3 ms** | **Loopback only** (localhost) — not WAN France |
| Harness **`pickRtpReport` fix** | Commit **`e512cb5`** — [`public/harness.js`](s1-lab/livekit-oss/public/harness.js) |

---

## Verdict draft (POC-scoped, honest)

| Scope | Result | Notes |
| --- | --- | --- |
| **Connectivity / SFU self-host POC** | **PASS** | Local **5** canvas clients; criteria connectivity-only in multi-pax script |
| **Production-readiness** | **NOT VALIDATED** | No SLO sign-off; no long soak signed off for prod |
| **WAN / France participants** | **INCOMPLETE** | Loopback RTT only; **LAN Sandbox IP TBD** (Loïc) |
| **Real cameras / audio** | **INCOMPLETE** | Canvas synthetic ~15 fps, **no audio** in multi-pax run |
| **LAN multi-machine** | **NOT ATTEMPTED** | Single host headless Chrome |
| **AC-RTC-001 (≥ 20 min stable 5 pax)** | **INCOMPLETE** | Hold **50 s** in smoke only |
| **AC-RTC-002 on WAN** | **INCOMPLETE** | Metrics from harness `getStats` on **localhost** — do not extrapolate |
| **Cost gate €/h** | **N/A** | POC self-host lock |

---

## Recommendation

1. **Keep LiveKit OSS** as the **POC SFU stack** (vote B executed; lab runnable).
2. **Next lab step:** deploy on **LAN Sandbox** when Loïc provides **IP / SSH**; re-run multi-pax with **real cams/mic** and multi-machine where possible.
3. **Do not claim** AC-RTC-002 WAN or France-path metrics from the **2026-10-05 loopback** run.
4. **D-04:** managed **cloud SFU** remains **product hypothesis post-POC** unless Loïc amends — see [`S1-D04-POC-override.md`](S1-D04-POC-override.md).

---

## Sign-off (empty)

| Role | Name | Date | OK / comments |
| --- | --- | --- | --- |
| Loïc | | | |
| Lead | | | |
