#!/usr/bin/env node
// 5-min audio+video soak: file pubs (take4 webm video + take4 WAV audio) + sub with detailed audio inbound.
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dir = dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = process.env.HARNESS_URL ?? "http://host.docker.internal:5190";
const ROOM = process.env.ROOM ?? "s1-soak-audio";
const N_PUB = Number(process.env.N_PUB ?? 3);
const HOLD_S = Number(process.env.HOLD_S ?? 300);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 5000);
const CHROME = process.env.CHROME ?? "/ms-playwright/chromium-1140/chrome-linux/chrome";
const OUT_DIR = process.env.OUT_DIR ?? join(__dir, "soak-audio-" + Date.now());
mkdirSync(OUT_DIR, { recursive: true });
const parisNow = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).replace(" ", "T") + " Europe/Paris";

function median(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function stat(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  return { n: a.length, min: a[0], med: median(a), max: a.at(-1) };
}

async function rawPcStats(page) {
  return page.evaluate(async () => {
    const outV = [], outA = [], inV = [], inA = [], pairs = [];
    for (const pc of window.__pcs ?? []) {
      if (pc.connectionState === "closed") continue;
      const rep = await pc.getStats();
      for (const s of rep.values()) {
        if (s.type === "outbound-rtp" && s.kind === "video")
          outV.push({ rid: s.rid ?? null, bytesSent: s.bytesSent, w: s.frameWidth, h: s.frameHeight, fps: s.framesPerSecond, qlr: s.qualityLimitationReason, ts: s.timestamp });
        if (s.type === "outbound-rtp" && s.kind === "audio")
          outA.push({ bytesSent: s.bytesSent, ts: s.timestamp });
        if (s.type === "inbound-rtp" && s.kind === "video")
          inV.push({ bytesReceived: s.bytesReceived, w: s.frameWidth, h: s.frameHeight, fps: s.framesPerSecond, packetsLost: s.packetsLost, jitter: s.jitter, freezeCount: s.freezeCount, ts: s.timestamp, ssrc: s.ssrc });
        if (s.type === "inbound-rtp" && s.kind === "audio")
          inA.push({
            bytesReceived: s.bytesReceived, packetsLost: s.packetsLost, packetsReceived: s.packetsReceived,
            jitter: s.jitter, concealedSamples: s.concealedSamples, concealmentEvents: s.concealmentEvents,
            audioLevel: s.audioLevel, totalAudioEnergy: s.totalAudioEnergy, totalSamplesDuration: s.totalSamplesDuration,
            ts: s.timestamp, ssrc: s.ssrc,
          });
        if (s.type === "candidate-pair" && s.nominated && s.currentRoundTripTime != null)
          pairs.push({ rtt_ms: s.currentRoundTripTime * 1000 });
        if (s.type === "track" && s.kind === "audio" && s.remoteSource) {
          // older chrome track stats
        }
      }
    }
    // Also media-source / track audioLevel from receivers if present
    return { outV, outA, inV, inA, pairs };
  });
}

async function scrape(page) {
  return page.evaluate(() => ({
    status: document.querySelector("#status")?.textContent?.trim() ?? null,
    remotes: [...document.querySelectorAll("#remote-tiles .tile .label")].map((l) => l.textContent.trim()),
    rows: [...document.querySelectorAll("#stats-table tbody tr")].map((tr) => {
      const tds = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
      return { participant: tds[0], track: tds[1], dir: tds[2], bitrate: tds[3], loss: tds[4], jitter: tds[5], rtt: tds[6], resolution: tds[7], fps: tds[8] };
    }),
  }));
}

async function forceHigh(page) {
  await page.evaluate(() => {
    document.querySelectorAll("#remote-tiles video").forEach((v) => { v.style.width = "1280px"; v.style.height = "720px"; v.width = 1280; v.height = 720; });
    if (window.__lkRoom) {
      for (const p of window.__lkRoom.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (String(pub.kind) === "video" && typeof pub.setVideoQuality === "function") {
            try { pub.setVideoQuality(2); } catch {}
          }
        }
      }
    }
  });
}

const startedAt = parisNow();
const t0 = Date.now();
console.log(`[audio-soak] ${startedAt} room=${ROOM} pubs=${N_PUB} hold=${HOLD_S}s`);
const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--use-fake-ui-for-media-stream",
    // Keep WAV path for any gum path; file-mode uses harness WAV explicitly.
    "--use-fake-device-for-media-stream",
    "--use-file-for-fake-audio-capture=/work/media/take4-20s.wav",
    "--use-file-for-fake-video-capture=/work/media/take4-20s.y4m",
    `--unsafely-treat-insecure-origin-as-secure=${HARNESS_URL}`,
  ],
});

const actors = [];
async function make(identity, mode) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(["camera", "microphone"], { origin: HARNESS_URL }).catch(() => {});
  await context.addInitScript(() => {
    const Orig = window.RTCPeerConnection; window.__pcs = [];
    window.RTCPeerConnection = function (...a) { const pc = new Orig(...a); window.__pcs.push(pc); return pc; };
    window.RTCPeerConnection.prototype = Orig.prototype; Object.setPrototypeOf(window.RTCPeerConnection, Orig);
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error" || /file-publish/.test(m.text())) consoleErrors.push(m.text()); });
  actors.push({ identity, mode, context, page, consoleErrors, joinMs: null, joinError: null, samples: [] });
  return actors.at(-1);
}
for (let i = 1; i <= N_PUB; i++) await make(`aud-pub-${i}`, "file");
const sub = await make("aud-sub", "none");

await Promise.all(actors.map(async (a, idx) => {
  await new Promise((r) => setTimeout(r, idx * 600));
  const tJ = Date.now();
  try {
    await a.page.goto(HARNESS_URL, { waitUntil: "load", timeout: 45000 });
    await a.page.fill("#room", ROOM); await a.page.fill("#identity", a.identity);
    await a.page.selectOption("#media-mode", a.mode); await a.page.click("#join");
    await a.page.waitForFunction(() => /connected/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 45000 });
    a.joinMs = Date.now() - tJ;
    if (a.mode === "none") { await a.page.waitForTimeout(1500); await forceHigh(a.page); }
  } catch (e) { a.joinError = String(e.message ?? e).split("\n")[0]; }
  console.log(`[${a.identity}] ${a.joinError ? "FAIL " + a.joinError : "ok " + a.joinMs + "ms"}`);
}));

const csv = join(OUT_DIR, "audio-samples.csv");
appendFileSync(csv, "t_s,identity,audio_tracks,audio_kbps,audio_loss_pct,audio_jitter,concealedSamples,concealmentEvents,audioLevel,totalAudioEnergy,video_max_wh,video_fps\n");

const prevA = new Map(); // ssrc -> {bytes, ts}
const holdEnd = Date.now() + HOLD_S * 1000;
let n = 0;
while (Date.now() < holdEnd) {
  await new Promise((r) => setTimeout(r, SAMPLE_MS));
  n++;
  const tRel = Math.round((Date.now() - t0) / 1000);
  if (n % 2 === 1) await forceHigh(sub.page).catch(() => {});
  for (const a of actors) {
    try {
      const snap = await scrape(a.page);
      const raw = await rawPcStats(a.page);
      a.samples.push({ t_s: tRel, at: parisNow(), ...snap, raw });
      if (a === sub) {
        const audioBits = [];
        for (const inn of raw.inA || []) {
          const prev = prevA.get(inn.ssrc);
          let kbps = null;
          if (prev && inn.ts > prev.ts) kbps = (8 * (inn.bytesReceived - prev.bytesReceived)) / ((inn.ts - prev.ts) / 1000) / 1000;
          prevA.set(inn.ssrc, { bytes: inn.bytesReceived, ts: inn.ts });
          const recv = inn.packetsReceived ?? 0;
          const lost = inn.packetsLost ?? 0;
          const lossPct = (recv + lost) > 0 ? (100 * lost) / (recv + lost) : null;
          audioBits.push({ kbps, lossPct, jitter: inn.jitter, concealedSamples: inn.concealedSamples, concealmentEvents: inn.concealmentEvents, audioLevel: inn.audioLevel, totalAudioEnergy: inn.totalAudioEnergy });
        }
        const vBest = [...(raw.inV || [])].sort((x, y) => ((y.w || 0) * (y.h || 0)) - ((x.w || 0) * (x.h || 0)))[0];
        const aggKbps = audioBits.map((x) => x.kbps).filter((x) => x != null);
        appendFileSync(csv, [
          tRel, a.identity, audioBits.length,
          aggKbps.length ? (aggKbps.reduce((s, x) => s + x, 0) / aggKbps.length).toFixed(2) : "",
          audioBits.map((x) => x.lossPct).filter((x) => x != null).map((x) => x.toFixed(3)).join("|"),
          audioBits.map((x) => x.jitter).filter((x) => x != null).join("|"),
          audioBits.map((x) => x.concealedSamples).join("|"),
          audioBits.map((x) => x.concealmentEvents).join("|"),
          audioBits.map((x) => x.audioLevel).join("|"),
          audioBits.map((x) => x.totalAudioEnergy).join("|"),
          vBest ? `${vBest.w}x${vBest.h}` : "",
          vBest?.fps ?? "",
        ].join(",") + "\n");
        console.log(`[t=${tRel}s] audioTracks=${audioBits.length} kbps=${aggKbps.map((x) => x.toFixed(1)).join(",")} energy=${audioBits.map((x) => x.totalAudioEnergy).join(",")} level=${audioBits.map((x) => x.audioLevel).join(",")} video=${vBest ? vBest.w + "x" + vBest.h + "@" + vBest.fps : "none"}`);
      }
    } catch (e) { a.samples.push({ t_s: tRel, error: String(e.message ?? e) }); }
  }
  if (n === 2 || n % 20 === 0) await sub.page.screenshot({ path: join(OUT_DIR, `sub-t${tRel}.png`) }).catch(() => {});
}

for (const a of actors) { try { if (await a.page.isEnabled("#leave")) await a.page.click("#leave"); } catch {} await a.context.close().catch(() => {}); }
await browser.close();
const endedAt = parisNow();

// Analyze AUDIO separately
const subSamples = sub.samples.filter((s) => s.raw);
const audioSeries = [];
const prev2 = new Map();
for (const s of subSamples) {
  for (const inn of s.raw.inA || []) {
    const prev = prev2.get(inn.ssrc);
    let kbps = null;
    if (prev && inn.ts > prev.ts) kbps = (8 * (inn.bytesReceived - prev.bytesReceived)) / ((inn.ts - prev.ts) / 1000) / 1000;
    prev2.set(inn.ssrc, { bytes: inn.bytesReceived, ts: inn.ts });
    const recv = inn.packetsReceived ?? 0, lost = inn.packetsLost ?? 0;
    audioSeries.push({
      t_s: s.t_s, ssrc: inn.ssrc, kbps, packetsLost: lost, lossPct: (recv + lost) > 0 ? (100 * lost) / (recv + lost) : null,
      jitter: inn.jitter, concealedSamples: inn.concealedSamples, concealmentEvents: inn.concealmentEvents,
      audioLevel: inn.audioLevel, totalAudioEnergy: inn.totalAudioEnergy, totalSamplesDuration: inn.totalSamplesDuration,
    });
  }
}
const energyVals = audioSeries.map((x) => x.totalAudioEnergy).filter((x) => x != null);
const levelVals = audioSeries.map((x) => x.audioLevel).filter((x) => x != null && x > 0);
const energyGrew = energyVals.length >= 2 && energyVals.at(-1) > energyVals[0];
const speechProof = energyGrew || levelVals.length > 0;

const videoSeries = [];
const prevV = new Map();
for (const s of subSamples) {
  for (const inn of s.raw.inV || []) {
    const key = inn.ssrc ?? 0;
    const prev = prevV.get(key);
    let kbps = null;
    if (prev && inn.ts > prev.ts) kbps = (8 * (inn.bytesReceived - prev.bytesReceived)) / ((inn.ts - prev.ts) / 1000) / 1000;
    prevV.set(key, { bytes: inn.bytesReceived, ts: inn.ts });
    videoSeries.push({ t_s: s.t_s, w: inn.w, h: inn.h, fps: inn.fps, kbps, packetsLost: inn.packetsLost });
  }
}
const hd = videoSeries.filter((x) => x.w >= 1280 && x.h >= 720);

const result = {
  test: "S1 5-min audio speech soak (take4 WAV)",
  startedAt, endedAt,
  config: { HARNESS_URL, ROOM, N_PUB, HOLD_S, audioSource: "/media/take4-20s.wav (from take4 raw Opus)", videoSource: "/media/take4-raw.webm", note: "Publishers use harness file mode: webm video + explicit WAV audio CaptureStream. Chrome --use-file-for-fake-audio-capture also set for any gum path." },
  join: actors.map((a) => ({ identity: a.identity, mode: a.mode, joinMs: a.joinMs, joinError: a.joinError, consoleErrors: [...new Set(a.consoleErrors)].slice(0, 15) })),
  AUDIO: {
    inbound_samples: audioSeries.length,
    unique_ssrcs: [...new Set(audioSeries.map((x) => x.ssrc))],
    bitrate_kbps: stat(audioSeries.map((x) => x.kbps)),
    loss_pct: stat(audioSeries.map((x) => x.lossPct)),
    jitter_s: stat(audioSeries.map((x) => x.jitter)),
    concealedSamples_last: audioSeries.at(-1)?.concealedSamples ?? null,
    concealmentEvents_last: audioSeries.at(-1)?.concealmentEvents ?? null,
    audioLevel: stat(levelVals),
    totalAudioEnergy: { first: energyVals[0] ?? null, last: energyVals.at(-1) ?? null, grew: energyGrew },
    speech_energy_proof: speechProof,
    verdict: !actors.some((a) => a.joinError) && audioSeries.length > 0 && speechProof && (stat(audioSeries.map((x) => x.kbps))?.med ?? 0) > 0
      ? "PASS — inbound audio with non-zero bitrate and speech energy from take4 WAV"
      : "FAIL — missing audio bitrate and/or speech energy proof",
  },
  VIDEO: {
    resolutions_seen: [...new Set(videoSeries.map((x) => `${x.w}x${x.h}`))],
    hd_1280x720_samples: hd.length,
    hd_fps: stat(hd.map((x) => x.fps)),
    hd_kbps: stat(hd.map((x) => x.kbps)),
    all_fps: stat(videoSeries.map((x) => x.fps)),
  },
  caveats: ["loopback single machine", "file CaptureStream not gum fake-device (gum blocked on host.docker.internal non-secure origin)", "WAV = first 20s of take4 raw Opus speech"],
};
writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2));
writeFileSync(join(OUT_DIR, "result.md"), `# Audio soak\n\n- **AUDIO verdict: ${result.AUDIO.verdict}**\n- ${startedAt} → ${endedAt}\n- Audio kbps: ${JSON.stringify(result.AUDIO.bitrate_kbps)}\n- Energy grew: ${energyGrew} (first=${energyVals[0]}, last=${energyVals.at(-1)})\n- Loss%: ${JSON.stringify(result.AUDIO.loss_pct)}\n- Video resolutions: ${result.VIDEO.resolutions_seen.join(", ")}\n- HD samples: ${hd.length}\n`);
console.log(JSON.stringify({ audio: result.AUDIO.verdict, videoHD: hd.length, out: OUT_DIR }, null, 2));
process.exit(result.AUDIO.verdict.startsWith("PASS") ? 0 : 1);