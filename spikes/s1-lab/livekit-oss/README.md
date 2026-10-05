# LiveKit OSS — S1 self-host lab (prep)

**Status:** skeleton / prep — **not** production SFU. **No stack lock** until salon vote ([`S1-QCM.md`](../../S1-QCM.md) option B).

## Goal

Run **`livekit-server`** (OSS) on Sandbox **LAN** or **EU VPS**; clients use `livekit-client` against **our** server (not LiveKit Cloud). Participants in **France**.

## Planned layout (future)

```text
livekit-oss/
  README.md
  config/            ← TBD: livekit.yaml (keys via .env.local, not in git)
  docker-compose.yml ← TBD: livekit-server + optional redis
  scripts/           ← TBD: token mint (API key/secret local)
  client/            ← TBD: reuse stats UI patterns from archived Cloud harness
```

## Deploy notes (to fill with lead/Loïc)

| Item | Value |
| --- | --- |
| VPS EU or LAN host | TBD |
| `livekit-server` version | TBD |
| TURN | Use LiveKit embedded TURN or coturn — document in lab setup |
| TLS / domain | TBD |

## Distinction

| | LiveKit **Cloud** (archived) | LiveKit **OSS** (this target) |
| --- | --- | --- |
| Host | Vendor SaaS | **Our** VPS/LAN |
| POC | **Stopped** | **Prep** after vote |

Archived Cloud harness: [`../livekit/`](../livekit/) + [`../ARCHIVED-SaaS.md`](../ARCHIVED-SaaS.md).

## References

- [LiveKit self-hosting](https://docs.livekit.io/home/self-hosting/)
- Spike grid: [`../../S1-sfu.md`](../../S1-sfu.md)
- D-04 post-POC cloud hypothesis: [`../../S1-D04-POC-override.md`](../../S1-D04-POC-override.md)
