# Daily — S1 lab stub

**Status:** not implemented in this PR. Use LiveKit harness first ([`../livekit/`](../livekit/)).

## Planned scope (same as LiveKit lab)

- Browser harness: join room, publish cam/mic, subscribe peers.
- Poll diagnostics aligned with **AC-RTC-002**:
  - Bitrate (up/down)
  - Packet loss %
  - Jitter (ms)
  - RTT (ms)
  - Resolution (width × height)
  - FPS

## Expected SDK hooks (desk research)

| Metric | Daily API (target) |
| --- | --- |
| Bitrate | `getNetworkStats()` / `useNetwork` `*BitsPerSecond` |
| Packet loss | `*PacketLoss` |
| Jitter | `*Jitter` |
| RTT | `networkRoundTripTime` |
| Resolution | track `getSettings()` + `getStats` |
| FPS | `getStats` inbound/outbound video |

## Env (when implemented)

```bash
# .env.example (future) — do not commit secrets
DAILY_API_KEY=
DAILY_DOMAIN=your-subdomain.daily.co
```

Free tier: 10 000 participant-minutes/month per [`S1-sfu.md`](../../S1-sfu.md).

## Run parity

When this stub is replaced by a harness, follow the parent [`../README.md`](../README.md):

- 5 clients / 2 machines
- Chrome throttling notes
- 20-minute stability checklist
