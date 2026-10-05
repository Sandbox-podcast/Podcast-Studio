# S1 lab — self-host POC (SFU interne)

Spike **S1** after **Loïc pivot** ([`S1-sfu.md`](../S1-sfu.md), [`S1-D04-POC-override.md`](../S1-D04-POC-override.md)). **Not** Phase 1 product code.

## Stop SaaS (mandatory)

**Do not** create or use LiveKit Cloud, Daily, or Agora keys, accounts, or lab runs. Folders [`livekit/`](./livekit/) (Cloud client), [`daily/`](./daily/), [`agora/`](./agora/) are **ARCHIVED / superseded** — reference only, **frozen**.

## Active lab targets (prep)

| Target | Status | Path |
| --- | --- | --- |
| **mediasoup** (self-host) | Prep README + skeleton | [`mediasoup/`](./mediasoup/) |
| **LiveKit OSS** (self-host) | Prep README + skeleton | [`livekit-oss/`](./livekit-oss/) |

Deploy on Sandbox **LAN** and/or **EU VPS**. Lab participants in **France**.

## Constraints

- **POC only** : self-host on Sandbox infra — **no managed cloud SFU** until Loïc reopens (option D in [`S1-QCM.md`](../S1-QCM.md)).
- **D-04** : managed cloud SFU remains the **product hypothesis post-POC** unless Loïc issues a new OK — see override doc (POC exception, not deletion of D-04).
- **No stack lock** before **salon QCM** vote (mediasoup / LiveKit OSS / DIY / cloud deferred).
- **No secrets in git** — env files local only when lab starts.
- **No invented lab numbers** — fill [`S1-sfu.md`](../S1-sfu.md) tables after real runs.

## Protocol (summary)

Same acceptance goals as before: **5 clients**, **≥ 20 min**, Chrome throttling, AC-RTC-002 stats panel (browser `getStats()` + server metrics as needed). Details in `S1-sfu.md`.

## Archived SaaS harnesses

See [`ARCHIVED-SaaS.md`](./ARCHIVED-SaaS.md).

## Related

- [`../S1-QCM.md`](../S1-QCM.md) — salon vote  
- [`../S1-D04-POC-override.md`](../S1-D04-POC-override.md)
