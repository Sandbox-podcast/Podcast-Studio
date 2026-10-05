# mediasoup — S1 self-host lab (prep)

**Status:** skeleton / prep — **not** production SFU. **No stack lock** until salon vote ([`S1-QCM.md`](../../S1-QCM.md) option A).

## Goal

Run **mediasoup** SFU on Sandbox **LAN** or **EU VPS**; browser clients in **France**; AC-RTC-002 via `getStats()`.

## Planned layout (future)

```text
mediasoup/
  README.md          ← this file
  docker-compose.yml ← TBD: mediasoup + coturn (not committed until vote + infra)
  server/            ← TBD: signaling (protoo / custom) Node/TS
  client/            ← TBD: minimal join/publish/subscribe + stats table
```

## Deploy notes (to fill with lead/Loïc)

| Item | Value |
| --- | --- |
| VPS EU or LAN host | TBD |
| UDP/TCP ports | TBD |
| TURN (coturn) | Required for many FR home networks |
| TLS | TBD |

## Out of scope now

- Full production mediasoup cluster
- Cloud SFU (see [`ARCHIVED-SaaS.md`](../ARCHIVED-SaaS.md))

## References

- [mediasoup.org](https://mediasoup.org/)
- Spike grid: [`../../S1-sfu.md`](../../S1-sfu.md)
