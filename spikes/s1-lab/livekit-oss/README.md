# LiveKit OSS — S1 POC lab (vote **B** locked)

Self-hosted **`livekit-server`** on Sandbox **LAN** (default path per Q2 Loïc). **EU VPS** only later if needed. Participants **France**. **Not** LiveKit Cloud. **Not** production.

**Sandbox LAN host IP** still **TBD** from Loïc for multi-client lab on Sandbox network — **do not invent**.

## Dev instance running (2026-10-05)

Loïc unblocked **local/dev Docker Compose** — no wait on Sandbox IP for smoke on the shared dev box.

| Item | Value |
| --- | --- |
| Host | Grok Bot computer (shared dev box) |
| Working dir on box | `/workspace/s1-livekit-oss` (mirrors this repo path `spikes/s1-lab/livekit-oss/`) |
| Server image | `livekit/livekit-server:v1.8.4` |
| LiveKit WebSocket | `ws://127.0.0.1:7880` |
| Harness UI (token + getStats) | http://127.0.0.1:5190 |
| Default room | `s1-lab` |
| Ports | TCP **7880**, **7881**; UDP **50000–50200** (no conflict with MinIO **9000/9001** on same host) |
| Keys | Placeholders from [`.env.example`](./.env.example) — **not production** |
| Verified 2026-10-05 | Token mint + HTTP **200** against LiveKit |

### Headless / no cam-mic (shared dev box)

The Grok Bot host has **no camera/microphone** — default `getUserMedia` fails with `NotFoundError` before reaching the SFU. Harness **Publish mode** (hard-refresh http://127.0.0.1:5190 after pull):

| Mode | Behavior |
| --- | --- |
| **canvas** (default) | Animated canvas → `captureStream` → `LocalVideoTrack` (no `getUserMedia`) |
| **none** | Join + subscribe only; no local publish |
| **camera** | `createLocalTracks` via **dynamic import** only when joining in camera mode (no `getUserMedia` on page load) |

Static assets: `styles.css`, `favicon.png` / `favicon.ico` (fixes harness tab 404 noise).

**DEV CORS** (`server.mjs`, Vision patch — keep on PR #3): if `Origin` matches `http(s)://127.0.0.1|localhost(:port)`, respond with `Access-Control-Allow-Origin` (that origin), `Allow-Methods: GET, OPTIONS`, `Allow-Headers: Content-Type`, `Vary: Origin`. `OPTIONS` → **204**. Lets S3 harness on `:8080` mint tokens from `:5190` without pasted JWT. **DEV localhost only** — not production.

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

5. Open `http://127.0.0.1:5190` → room `s1-lab` → **Join** (default **canvas** if no cam).

### Multi-pax smoke (automated)

With `docker compose` + `npm run dev` running:

```bash
node scripts/multi-pax-smoke.mjs
```

Requires **playwright-core** + Chrome (dev box used `PW_CORE=/workspace/tools/pw/node_modules/playwright-core/index.mjs`). Writes `scripts/multi-pax-results.md` and `.json`. Latest run **PASS** 2026-10-05 — see [`S1-sfu.md`](../../S1-sfu.md) mesures. Harness `pickRtpReport` fix (active simulcast layer) landed after that run; re-run to refresh outbound stats in results.

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
