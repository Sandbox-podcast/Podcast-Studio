# S1 lab harness — POC free tier only

Spike **S1** browser lab for SFU evaluation ([`S1-sfu.md`](../S1-sfu.md)). **Not** Phase 1 product code.

**POC constraint (Loïc via lead): no paid SFU.** This lab is **strictly free tier** — free plans/projects only (LiveKit Build, Daily free, Agora free quota). No paid upsell, no paid project creation, no Ship/Scale upgrades for S1. If a vendor **free quota is exhausted**, **stop** the lab run and document it — do **not** upgrade to paid without **explicit written OK from Loïc**.

| Provider | Status | Path | Default port |
| --- | --- | --- | --- |
| **LiveKit Cloud** | Runnable (Build free tier) | [`livekit/`](./livekit/) | `5179` |
| **Daily** | Runnable skeleton (free tier) | [`daily/`](./daily/) | `5180` |
| **Agora** | Runnable skeleton (free tier) | [`agora/`](./agora/) | `5181` |

## Constraints

- **POC = free tier only** (see above) — no paid SFU for S1 lab measurements.
- **No secrets in git** — copy each provider’s `.env.example` → `.env` locally (see table above).
- Lab may run on **free tier before** formal go post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)); cost pass/fail still requires a €/h ceiling from Loïc.
- **SFU choice not locked** — these harnesses are for measurements only.
- **EU region for lab** (constraint Loïc via lead): participants are in **France** — prefer **EU SFU endpoints** (e.g. LiveKit **eu** / Frankfurt, Daily `eu-central-1` geo, Agora Europe edge) when creating projects/rooms. **Strict EU residency** remains **TBD** in the QCM; this is a lab latency/geo default, not an invented compliance policy.

## Quick start

### LiveKit

1. [LiveKit Cloud](https://cloud.livekit.io/) project on **Build** (free), **EU region** (e.g. eu-central / Frankfurt).
2. `cd spikes/s1-lab/livekit && cp .env.example .env` — fill EU `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (see [`livekit/README.md`](./livekit/README.md)).
3. `npm install && npm run dev` → `http://127.0.0.1:5179`

### Daily

1. [Daily.co](https://www.daily.co/) free account; create lab rooms with **EU geo** (`eu-central-1` / Frankfurt) when the API/dashboard allows.
2. `cd spikes/s1-lab/daily && cp .env.example .env` — set `DAILY_API_KEY` **or** a fixed `DAILY_ROOM_URL` from the dashboard.
3. `npm install && npm run dev` → `http://127.0.0.1:5180`

### Agora

1. [Agora Console](https://console.agora.io/) free project + App Certificate enabled; prefer **Europe** edge / documented EU endpoints for lab channels.
2. `cd spikes/s1-lab/agora && cp .env.example .env` — `AGORA_APP_ID` + `AGORA_APP_CERTIFICATE` (or short-lived `AGORA_TEMP_TOKEN` from console).
3. `npm install && npm run dev` → `http://127.0.0.1:5181`

Each harness: room/channel name + display name → **Join** → allow camera/microphone.

## Running 5 clients / 2 machines

Goal: exercise **AC-RTC-001** (≥ 5 participants, ≥ 20 min stable A/V).

| Setup | How |
| --- | --- |
| **5 tabs on one machine** | Open the harness URL in 5 Chrome profiles or windows; distinct **display names** (`p1`…`p5`). Prefer **720p** where the harness requests it. |
| **2 physical machines** | Run `npm run dev` on one machine; all clients use the **same** room/channel name and reach the same SFU project. |
| **Mixed** | e.g. 3 clients on laptop A + 2 on laptop B — one room/channel, five identities. |

Tips:

- Mute speakers on secondary tabs to avoid feedback, or use headphones on the operator tab.
- Note SDK version, browser versions, and SFU region in [`S1-sfu.md`](../S1-sfu.md) setup table when you start a run.

## Chrome network throttling (degradation runs)

For degradation experiments (S1 protocol day 3):

1. Open **DevTools** → **Network**.
2. Set throttling to **Slow 3G** or **Custom** (e.g. 1 Mbps down / 500 Kbps up, 50 ms RTT).
3. Apply throttling **per tab** (each participant can use different profiles).
4. Keep the **stats panel** visible — AC-RTC-002: bitrate, packet loss, jitter, RTT, resolution, FPS.

Optional: Linux `tc netem` on one machine for loss/latency at the OS level (document conditions in S1-sfu).

## 20-minute stability checklist

Use this during a 5-participant session; record results in `S1-sfu.md` (measurement tables).

- [ ] All 5 participants joined with **camera + mic** publishing (or documented placeholders if hardware missing).
- [ ] Session duration **≥ 20 minutes** wall clock without manual reconnect.
- [ ] No participant stuck on “connecting” > 30 s after others are live.
- [ ] Remote video/audio remains **usable** on the operator tab (subjective + stats).
- [ ] Stats panel shows for local + each remote: **bitrate**, **packet loss**, **jitter**, **RTT**, **resolution**, **FPS** (AC-RTC-002).
- [ ] Note any disconnects, frozen video, or one-way audio with timestamp.
- [ ] After session: check vendor dashboard **usage** — stay within free caps; **stop** if quota is exhausted (no paid upgrade for POC).

## AC-RTC-002 metrics contract (all candidates)

| Metric | LiveKit | Daily | Agora |
| --- | --- | --- | --- |
| Bitrate | WebRTC `getStats()` deltas | `getNetworkStats()` + fallback | SDK `*Bitrate` |
| Packet loss | `packetsLost` | `*PacketLoss` + fallback | `*PacketsLost` |
| Jitter | WebRTC jitter | WebRTC fallback | WebRTC fallback |
| RTT | candidate-pair / remote-inbound | `networkRoundTripTime` | `getRTCStats().RTT` |
| Resolution | frameWidth × height | WebRTC video stats | `*Resolution*` |
| FPS | `framesPerSecond` | WebRTC video stats | `*FrameRate` |

## Related docs

- Spike protocol & empty measurement grids: [`../S1-sfu.md`](../S1-sfu.md)
- Decision QCM (after lab): [`../S1-QCM.md`](../S1-QCM.md)
