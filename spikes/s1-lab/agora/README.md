# Agora — S1 lab harness (free tier)

Minimal browser lab mirroring [`../livekit/`](../livekit/). **Not** Phase 1 product code.

## Prerequisites

- [Agora](https://console.agora.io/) project on the **free** tier (10 000 standard minutes/month).
- Enable **App Certificate** in the project (required for secure tokens in lab).

## Credentials (pick one)

| Method | `.env` keys | Notes |
| --- | --- | --- |
| **Local mint (recommended)** | `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` | Server + CLI mint RTC tokens (never commit certificate). |
| **Console temp token** | `AGORA_APP_ID`, `AGORA_TEMP_TOKEN` | Agora Console → Project → **Generate temp token** (short-lived smoke test only). |

## Run

```bash
cd spikes/s1-lab/agora
cp .env.example .env
npm install
npm run dev
```

Open `http://127.0.0.1:5181`, enter channel + display name, **Join**.

### CLI token (optional)

```bash
npm run mint-token -- --channel s1-lab --identity tester-1
```

## AC-RTC-002

Stats panel (2s poll):

| Metric | Source |
| --- | --- |
| Bitrate | `sendBitrate` / `receiveBitrate` |
| Packet loss | `sendPacketsLost` / `receivePacketsLost` |
| Jitter | WebRTC `getStats()` fallback on local video |
| RTT | `client.getRTCStats().RTT` |
| Resolution | `sendResolution*` / `receiveResolution*` |
| FPS | `sendFrameRate` / `receiveFrameRate` |

## Multi-client protocol

Same as parent [`../README.md`](../README.md): 5 tabs or 2 machines, **same channel name**, distinct display names (each maps to a stable numeric `uid` for token mint).

## Paid infra

Do **not** enable paid packages or exceed free quota without Loïc + lead approval.
