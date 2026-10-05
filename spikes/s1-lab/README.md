# S1 lab harness — free tier only

Spike **S1** browser lab for SFU evaluation ([`S1-sfu.md`](../S1-sfu.md)). **Not** Phase 1 product code.

| Provider | Status | Path |
| --- | --- | --- |
| **LiveKit Cloud** | Implemented (Build free tier) | [`livekit/`](./livekit/) |
| **Daily** | Stub — same AC-RTC-002 metrics contract | [`daily/`](./daily/) |
| **Agora** | Stub — same AC-RTC-002 metrics contract | [`agora/`](./agora/) |

## Constraints

- **Free / trial accounts only** — do not upgrade to paid plans without Loïc + lead approval.
- **No secrets in git** — copy [`livekit/.env.example`](./livekit/.env.example) to `livekit/.env` locally.
- Lab may run on **free tier before** formal go post-S0 ([PR #5](https://github.com/Sandbox-podcast/Podcast-Studio/pull/5)); cost pass/fail still requires a €/h ceiling from Loïc.

## Quick start (LiveKit)

1. Create a [LiveKit Cloud](https://cloud.livekit.io/) project on the **Build** (free) plan.
2. Copy `livekit/.env.example` → `livekit/.env` and fill `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. Install and start the local dev server (static UI + token endpoint bound to localhost):

   ```bash
   cd spikes/s1-lab/livekit
   npm install
   npm run dev
   ```

4. Open the URL printed in the terminal (default `http://127.0.0.1:5179`).
5. Enter a **room name** and **display name**, click **Join**, allow camera/microphone.

### CLI token (optional)

Mint a JWT without the dev server:

```bash
cd spikes/s1-lab/livekit
node scripts/mint-token.mjs --room s1-lab --identity tester-1
```

## Running 5 clients / 2 machines

Goal: exercise **AC-RTC-001** (≥ 5 participants, ≥ 20 min stable A/V).

| Setup | How |
| --- | --- |
| **5 tabs on one machine** | Open the harness URL in 5 Chrome profiles or 5 windows; use distinct **display names** (`p1`…`p5`). Prefer **720p** capture (harness requests 1280×720 when the device allows). |
| **2 physical machines** | Run `npm run dev` on one machine **or** serve `public/` from any static host; all clients must reach the **same** `LIVEKIT_URL` room. Use the same room name on every client. |
| **Mixed** | e.g. 3 clients on laptop A + 2 on laptop B — still one room name, five unique identities. |

Tips:

- Mute speakers on secondary tabs to avoid feedback, or use headphones on the “main” operator tab.
- Note SDK version, browser versions, and SFU region in [`S1-sfu.md`](../S1-sfu.md) setup table when you start a run.

## Chrome network throttling (degradation runs)

For degradation experiments (S1 protocol day 3):

1. Open **DevTools** → **Network**.
2. Set throttling to **Slow 3G** or **Custom** (e.g. 1 Mbps down / 500 Kbps up, 50 ms RTT).
3. Apply throttling **per tab** (each participant can use different profiles).
4. Keep the **stats panel** in the harness visible — AC-RTC-002: bitrate, packet loss, jitter, RTT, resolution, FPS.

Optional: Linux `tc netem` on one machine for loss/latency at the OS level (document conditions in S1-sfu).

## 20-minute stability checklist

Use this during a 5-participant session; record results in `S1-sfu.md` (measurement tables).

- [ ] All 5 participants joined with **camera + mic** publishing (or documented placeholders if hardware missing).
- [ ] Session duration **≥ 20 minutes** wall clock without manual reconnect.
- [ ] No participant stuck on “connecting” > 30 s after others are live.
- [ ] Remote video/audio remains **usable** on the operator tab (subjective + stats).
- [ ] Stats panel shows for local + each remote: **bitrate**, **packet loss**, **jitter**, **RTT**, **resolution**, **FPS** (AC-RTC-002).
- [ ] Note any disconnects, frozen video, or one-way audio with timestamp.
- [ ] After session: check LiveKit Cloud **usage** (WebRTC minutes) — stay within Build free cap.

## AC-RTC-002 metrics contract (all candidates)

The harness and future Daily/Agora stubs must surface the same six fields per participant / track (local + remote):

| Metric | Source (LiveKit harness) |
| --- | --- |
| Bitrate | Derived from `bytesSent` / `bytesReceived` deltas on `outbound-rtp` / `inbound-rtp` |
| Packet loss | `packetsLost` (inbound-rtp) |
| Jitter | `jitter` (seconds → ms in UI) |
| RTT | `roundTripTime` on candidate-pair or remote-inbound-rtp |
| Resolution | `frameWidth` × `frameHeight` |
| FPS | `framesPerSecond` |

## Related docs

- Spike protocol & empty measurement grids: [`../S1-sfu.md`](../S1-sfu.md)
- Decision QCM (after lab): [`../S1-QCM.md`](../S1-QCM.md)
