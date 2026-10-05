# LiveKit OSS — S1 POC lab (vote **B** locked)

Self-hosted **`livekit-server`** on Sandbox **LAN** (default path per Q2 Loïc). **EU VPS** only later if needed. Participants **France**. **Not** LiveKit Cloud. **Not** production.

**Awaiting Sandbox LAN host IP** (and SSH/access details) from Loïc — **do not invent**; set `LIVEKIT_URL` once provided.

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
- Participants in **France** on home NAT may need **TURN** (LiveKit embedded TURN with TLS, or **coturn**) — plan after **LAN host IP** is known.
- Do not use LiveKit Cloud / Daily / Agora for this POC.

## Default path — LAN Sandbox deploy

1. Loïc provides **LAN host IP** (and SSH if remote ops) — **TBD in repo**.
2. On that host: clone repo path, `docker compose up -d` in this directory.
3. Set client `.env`: `LIVEKIT_URL=ws://<lan-ip-from-loic>:7880` (replace when known).
4. Run harness (`npm run dev`) on same host or operator machine that can reach the LAN IP.
5. Open firewall: TCP 7880/7881, UDP 50000–50200 on the LAN host.

**VPS EU** : fallback only if LAN cannot meet 5-pax lab — not the default.

## Quick start (local docker + harness — dev on one machine)

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

## VPS EU (later, if needed)

Only if LAN Sandbox is insufficient. Hostname/IP from lead when applicable — not documented in this repo. See [LiveKit self-hosting](https://docs.livekit.io/home/self-hosting/) for `use_external_ip` / `node_ip`.

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
| **LAN Sandbox host IP** (+ SSH) | **TBD** — Loïc (Q2 = LAN first) |
| **VPS EU** | Later if needed |
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
