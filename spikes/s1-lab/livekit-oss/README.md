# LiveKit OSS — S1 POC lab (vote **B** locked)

Self-hosted **`livekit-server`** on Sandbox **LAN** or **EU VPS** (participants **France**). **Not** LiveKit Cloud. **Not** production.

| | |
| --- | --- |
| **Vote** | **B — LiveKit OSS self-host** (2026-10-05, lead / Loïc) |
| **Harness** | This folder |
| **D-04** | POC override only — cloud remains post-POC hypothesis ([`S1-D04-POC-override.md`](../../S1-D04-POC-override.md)) |

## Ports (default)

| Port | Protocol | Role |
| --- | --- | --- |
| **7880** | TCP | HTTP / WebSocket (`LIVEKIT_URL` → `ws://host:7880`) |
| **7881** | TCP | WebRTC over TCP (fallback) |
| **50000–50200** | UDP | WebRTC media (range in `config/livekit.yaml`) |
| **5190** | TCP | Lab browser UI + token API (`npm run dev`) |

Open these on the host firewall when using **LAN** or **VPS EU** (exact host/IP from lead — **not invented here**).

## TURN / NAT

- Same-LAN lab: often works without TURN if clients reach the host UDP range.
- Participants in **France** on home NAT typically need **TURN** (LiveKit embedded TURN with TLS, or **coturn**) — configure after infra Q2 (LAN vs VPS) is answered in [`S1-QCM.md`](../../S1-QCM.md).
- Do not use LiveKit Cloud / Daily / Agora for this POC.

## Quick start (local docker + harness)

1. Copy env (placeholder dev keys — **rotate** before any shared host):

   ```bash
   cd spikes/s1-lab/livekit-oss
   cp .env.example .env
   ```

2. Keys in `.env` must match `config/livekit.yaml` `keys:` block.

3. Start server:

   ```bash
   docker compose up -d
   ```

4. Install and run harness:

   ```bash
   npm install
   npm run dev
   ```

5. Open `http://127.0.0.1:5190` → room `s1-lab` → **Join** (allow camera/mic).

CLI token:

```bash
npm run mint-token -- --room s1-lab --identity tester-1
```

## LAN deploy (outline)

1. Run `docker compose` on a Sandbox LAN machine (lead provides **IP**).
2. Set in `.env` on the harness machine (or same host):
   - `LIVEKIT_URL=ws://<lan-ip>:7880`
   - If clients on other machines need the UI: `LAB_HOST=0.0.0.0` (lab only; not public internet without TLS).
3. Ensure UDP **50000–50200** and TCP **7880/7881** are reachable on the LAN.
4. Five browsers in France, distinct display names — see 5-pax checklist below.

## VPS EU deploy (outline)

1. Lead provides **EU VPS** hostname/IP (not documented in repo).
2. In `config/livekit.yaml`: set `rtc.use_external_ip: true` and `rtc.node_ip` to the VPS public IP (per [LiveKit self-hosting](https://docs.livekit.io/home/self-hosting/)).
3. `LIVEKIT_URL=ws://<vps-ip>:7880` or `wss://…` when TLS terminates in front.
4. Firewall/security group: same ports as above.

## 5-participant checklist (AC-RTC-001 / 002)

- [ ] `livekit-server` healthy (`docker compose ps`)
- [ ] 5 clients (≥2 physical machines), display names `p1`…`p5`, **France**
- [ ] 720p publish when device allows
- [ ] Session **≥ 20 min** stable
- [ ] Stats table: bitrate, loss, jitter, RTT, resolution, FPS
- [ ] Chrome network throttling smoke (optional)
- [ ] Record results in [`S1-sfu.md`](../../S1-sfu.md) — no invented numbers

## What remains for a joinable room (needs host)

| Need | Owner |
| --- | --- |
| **LAN IP or VPS EU FQDN/IP** | Lead / Loïc (QCM Q2 open) |
| **Firewall / UDP range** | Ops on chosen host |
| **TURN** (likely for FR home clients) | After host known |
| **TLS** (`wss://`) if exposed beyond trusted LAN | Lead decision |

This repo provides **server + harness skeleton**; a **publicly or LAN-joinable** room requires the host details above.

## Files

| Path | Purpose |
| --- | --- |
| `docker-compose.yml` | `livekit-server` container |
| `config/livekit.yaml` | Ports, placeholder keys |
| `server.mjs` | Token mint + static UI |
| `public/harness.js` | `livekit-client` + AC-RTC-002 panel |
