# ARCHIVED — LiveKit **Cloud** harness (superseded)

> **Do not run.** SaaS SFU stopped per Loïc pivot. Use [`../mediasoup/`](../mediasoup/) or [`../livekit-oss/`](../livekit-oss/). See [`../ARCHIVED-SaaS.md`](../ARCHIVED-SaaS.md).

# LiveKit — S1 lab harness (POC free tier) — ARCHIVED

Minimal browser lab for spike S1. **Not** Phase 1 product code. See also [`../README.md`](../README.md).

## POC — free tier only (no paid SFU)

Use LiveKit Cloud **Build ($0)** only. Do **not** create Ship/Scale projects, enable paid add-ons, or accept upsell for S1. If the **5 000 WebRTC min/month** cap is hit, **stop** and record in `S1-sfu.md` — no upgrade without **explicit Loïc OK**.

## Region (France participants)

Configure the LiveKit Cloud project in an **EU region** (e.g. **eu-central / Frankfurt**) and set `LIVEKIT_URL` to the **wss URL** from that project. Lab runs should not use US-only endpoints when avoidable.

**Strict EU data residency** for Sandbox is **not decided here** — see QCM Loïc (B4 in `S1-sfu.md`); geo EU for latency is the lab default, not an invented policy.

## Run

```bash
cd spikes/s1-lab/livekit
cp .env.example .env   # EU LIVEKIT_URL + API key/secret
npm install
npm run dev
```

Open `http://127.0.0.1:5179` (default). Optional CLI: `npm run mint-token`.

