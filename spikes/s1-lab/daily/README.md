# Daily — S1 lab harness (POC free tier)

Minimal browser lab mirroring [`../livekit/`](../livekit/). **Not** Phase 1 product code.

## POC — free tier only (no paid SFU)

Stay on Daily’s **free** plan (10 000 participant-minutes/month). No paid plan upgrade, no paid recording add-ons for S1. If free quota is **exhausted**, **stop** the lab — do **not** upgrade without **explicit Loïc OK**.

## Region (France participants)

Prefer **EU call servers** for S1 lab (e.g. Daily **`eu-central-1` (Frankfurt)** via room `geo` or dashboard region). Participants are in France; strict EU **residency** is still **TBD** (QCM Loïc) — do not invent Sandbox policy.

## Prerequisites

- [Daily.co](https://www.daily.co/) account on the **free** plan (10 000 participant-minutes/month).
- Either:
  - **`DAILY_API_KEY`** — REST API key from the [Daily dashboard](https://dashboard.daily.co/developers) (creates/fetches rooms by name), or
  - **`DAILY_ROOM_URL`** — a fixed room URL from the dashboard (skip API create; good for quick smoke tests).

No meeting token is required for **open** rooms created via API with default properties. For **private** rooms, generate a meeting token in the Daily dashboard and extend this harness (out of scope for the minimal skeleton).

## Run

```bash
cd spikes/s1-lab/daily
cp .env.example .env   # fill DAILY_API_KEY or DAILY_ROOM_URL
npm install
npm run dev
```

Open `http://127.0.0.1:5180` (default), enter room name + display name, **Join**.

## AC-RTC-002

Stats panel (2s poll):

| Metric | Source |
| --- | --- |
| Bitrate | `getNetworkStats()` `*BitsPerSecond` + WebRTC fallback |
| Packet loss | `video/audio *PacketLoss` + `getStats()` |
| Jitter | WebRTC `inbound-rtp` / `outbound-rtp` |
| RTT | `networkRoundTripTime` |
| Resolution / FPS | WebRTC video `getStats()` |

## Multi-client protocol

Same as parent [`../README.md`](../README.md): 5 tabs or 2 machines, same room name, distinct display names, 20 min checklist.

