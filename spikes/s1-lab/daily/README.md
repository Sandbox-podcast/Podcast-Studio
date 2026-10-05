# Daily — S1 lab harness (free tier)

Minimal browser lab mirroring [`../livekit/`](../livekit/). **Not** Phase 1 product code.

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

## Paid infra

Do **not** upgrade Daily plan or enable paid add-ons without Loïc + lead approval.
