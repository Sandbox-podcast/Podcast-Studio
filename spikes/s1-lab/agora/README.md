# Agora — S1 lab stub

**Status:** not implemented in this PR. Use LiveKit harness first ([`../livekit/`](../livekit/)).

## Planned scope (same metrics contract)

- Browser harness on Agora Web SDK 4.x: join channel, publish A/V, subscribe remotes.
- Surface **AC-RTC-002** in the same table shape as the LiveKit UI:
  - Bitrate, packet loss, jitter, RTT, resolution, FPS

## Expected SDK hooks (desk research)

| Metric | Agora API (target) |
| --- | --- |
| Bitrate | `getLocalVideoStats` / `getRemoteVideoStats` |
| Packet loss | audio/video stats + `network-quality` |
| Jitter | video/audio stats |
| RTT | `getRTCStats` / delay fields |
| Resolution | `sendResolutionWidth/Height` stats |
| FPS | `sendFrameRate` / `receiveFrameRate` |

## Env (when implemented)

```bash
# .env.example (future) — do not commit secrets
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=   # token mint server-side only
```

Free tier: 10 000 standard minutes/month (HD consumes faster) — see [`S1-sfu.md`](../../S1-sfu.md).

## Run parity

Mirror [`../README.md`](../README.md) protocol when implemented.
