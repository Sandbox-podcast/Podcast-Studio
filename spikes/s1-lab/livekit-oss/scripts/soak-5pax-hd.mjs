#!/usr/bin/env node
// S1 overnight soak: 5 camera pubs (fake take4 raw Y4M/WAV) + 1 HIGH-layer subscriber.
// Room default: s1-soak (avoids colliding with vision-s3 on s1-lab).
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dir = dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = process.env.HARNESS_URL ?? "http://host.docker.internal:5190";
const ROOM = process.env.ROOM ?? "s1-soak";
const N_PUB = Number(process.env.N_PUB ?? 5);
const HOLD_S = Number(process.env.HOLD_S ?? 1800);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 10000);
const HEADLESS = process.env.HEADLESS !== "0";
const CHROME = process.env.CHROME ?? "/ms-playwright/chromium-1140/chrome-linux/chrome";
const Y4M = process.env.Y4M ?? "/work/media/take4-20s.y4m";
const WAV = process.env.WAV ?? "/work/media/take4-20s.wav";
const OUT_DIR = process.env.OUT_DIR ?? join(__dir, "soak-" + Date.now());
mkdirSync(OUT_DIR, { recursive: true });

const parisNow = () =>
  new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).replace(" ", "T") + " Europe/Paris";

const COLS = ["participant", "track", "dir", "bitrate", "loss", "jitter", "rtt", "resolution", "fps"];

function parseKbps(s) {
  if (!s || s === "—" || s === "-") return null;
  const m = String(s).match(/([\d.]+)\s*(Mbps|Kbps|kbps|bps)/i);
  if (!m) return null;
  const v = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === "mbps") return v * 1000;
  if (u === "bps") return v / 1000;
  return v;
}
function parseNum(s) {
  if (s == null || s === "—" || s === "-") return null;
  const n = Number(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function median(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function stat(arr) {
  const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  return { n: a.length, min: a[0], med: median(a), max: a.at(-1) };
}

async function scrape(page) {
  return page.evaluate((cols) => {
    const status = document.querySelector("#status")?.textContent?.trim() ?? null;
    const rows = [...document.querySelectorAll("#stats-table tbody tr")].map((tr) => {
      const tds = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
      return Object.fromEntries(cols.map((c, i) => [c, tds[i] ?? null]));
    });
    const remotes = [...document.querySelectorAll("#remote-tiles .tile .label")].map((l) => l.textContent.trim());
    return { status, rows, remotes };
  }, COLS);
}

async function rawPcStats(page) {
  return page.evaluate(async () => {
    const out = [];
    const inn = [];
    const pairs = [];
    for (const pc of window.__pcs ?? []) {
      if (pc.connectionState === "closed") continue;
      const rep = await pc.getStats();
      for (const s of rep.values()) {
        if (s.type === "outbound-rtp" && s.kind === "video") {
          out.push({
            rid: s.rid ?? null, bytesSent: s.bytesSent, framesSent: s.framesSent,
            w: s.frameWidth ?? null, h: s.frameHeight ?? null, fps: s.framesPerSecond ?? null,
            active: s.active ?? null, qlr: s.qualityLimitationReason ?? null, ts: s.timestamp,
          });
        }
        if (s.type === "inbound-rtp" && s.kind === "video") {
          inn.push({
            bytesReceived: s.bytesReceived, framesReceived: s.framesReceived,
            w: s.frameWidth ?? null, h: s.frameHeight ?? null, fps: s.framesPerSecond ?? null,
            packetsLost: s.packetsLost ?? null, jitter: s.jitter ?? null,
            freezeCount: s.freezeCount ?? null, ts: s.timestamp,
          });
        }
        if (s.type === "inbound-rtp" && s.kind === "audio") {
          inn.push({
            kind: "audio", bytesReceived: s.bytesReceived, packetsLost: s.packetsLost ?? null, ts: s.timestamp,
          });
        }
        if (s.type === "candidate-pair" && s.nominated && s.currentRoundTripTime != null) {
          pairs.push({ rtt_ms: s.currentRoundTripTime * 1000 });
        }
      }
    }
    return { pcs: (window.__pcs ?? []).length, out, inn, pairs };
  });
}

async function forceHighLayer(page) {
  // Enlarge remote tiles so adaptiveStream requests HIGH; also try LiveKit API if exposed.
  await page.evaluate(() => {
    document.querySelectorAll("#remote-tiles video").forEach((v) => {
      v.style.width = "1280px";
      v.style.height = "720px";
      v.width = 1280;
      v.height = 720;
    });
    // Best-effort: if harness later exposes room, prefer explicit HIGH.
    if (window.__lkRoom) {
      for (const p of window.__lkRoom.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.kind === "video" && typeof pub.setVideoQuality === "function") {
            try { pub.setVideoQuality(2); } catch {} // VideoQuality.HIGH = 2
          }
        }
      }
    }
  });
}

const chromeArgs = [
  "--autoplay-policy=no-user-gesture-required",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-video-capture=${Y4M}`,
  `--use-file-for-fake-audio-capture=${WAV}`,
  `--unsafely-treat-insecure-origin-as-secure=${HARNESS_URL}`,
  "--allow-running-insecure-content",
];

const startedAt = parisNow();
const t0 = Date.now();
console.log(`[soak] start ${startedAt} room=${ROOM} pubs=${N_PUB} hold=${HOLD_S}s out=${OUT_DIR}`);
console.log(`[soak] y4m=${Y4M} wav=${WAV}`);

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  args: chromeArgs,
});

const actors = [];

async function makeActor(identity, mode) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(["camera", "microphone"], { origin: HARNESS_URL });
  await context.addInitScript(() => {
    const Orig = window.RTCPeerConnection;
    window.__pcs = [];
    window.RTCPeerConnection = function (...a) {
      const pc = new Orig(...a);
      window.__pcs.push(pc);
      return pc;
    };
    window.RTCPeerConnection.prototype = Orig.prototype;
    Object.setPrototypeOf(window.RTCPeerConnection, Orig);
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const a = { identity, mode, context, page, consoleErrors, joinMs: null, joinError: null, samples: [], leftCleanly: false };
  actors.push(a);
  return a;
}

for (let i = 1; i <= N_PUB; i++) await makeActor(`soak-pub-${i}`, "file");
const sub = await makeActor("soak-sub-hd", "none");

await Promise.all(actors.map(async (a, idx) => {
  await new Promise((r) => setTimeout(r, idx * 700));
  const tJ = Date.now();
  try {
    await a.page.goto(HARNESS_URL, { waitUntil: "load", timeout: 45000 });
    await a.page.fill("#room", ROOM);
    await a.page.fill("#identity", a.identity);
    await a.page.selectOption("#media-mode", a.mode);
    await a.page.click("#join");
    await a.page.waitForFunction(
      () => /connected/.test(document.querySelector("#status")?.textContent ?? "") &&
            !/disconnected/.test(document.querySelector("#status")?.textContent ?? ""),
      null,
      { timeout: 45000 },
    );
    a.joinMs = Date.now() - tJ;
    if (a.mode === "none") {
      await a.page.waitForTimeout(2000);
      await forceHighLayer(a.page);
    }
  } catch (e) {
    a.joinError = String(e?.message ?? e).split("\n")[0];
  }
  console.log(`[${a.identity}] join ${a.joinError ? "FAIL " + a.joinError : "ok " + a.joinMs + "ms"}`);
}));

const csvPath = join(OUT_DIR, "samples.csv");
appendFileSync(csvPath, "t_s,identity,role,status,out_kbps,out_fps,out_res,out_qlr,in_kbps,in_fps,in_w,in_h,in_loss,in_jitter,rtt_ms,freeze\n");

const holdEnd = Date.now() + HOLD_S * 1000;
let sampleIdx = 0;
while (Date.now() < holdEnd) {
  await new Promise((r) => setTimeout(r, SAMPLE_MS));
  sampleIdx++;
  const tRel = Math.round((Date.now() - t0) / 1000);
  if (sampleIdx % 3 === 1) await forceHighLayer(sub.page).catch(() => {});
  await Promise.all(actors.map(async (a) => {
    try {
      const snap = await scrape(a.page);
      const raw = await rawPcStats(a.page);
      a.samples.push({ t_s: tRel, at: parisNow(), ...snap, raw });
      const outVid = (raw.out || []).filter((o) => o.w || o.h || o.fps != null);
      const bestOut = outVid.sort((x, y) => ((y.w || 0) * (y.h || 0)) - ((x.w || 0) * (x.h || 0)))[0];
      const inVid = (raw.inn || []).filter((o) => !o.kind);
      const bestIn = inVid.sort((x, y) => ((y.w || 0) * (y.h || 0)) - ((x.w || 0) * (x.h || 0)))[0];
      const outRow = (snap.rows || []).find((r) => r.dir === "out" && r.track === "video");
      const rtt = raw.pairs?.[0]?.rtt_ms ?? parseNum(outRow?.rtt);
      appendFileSync(csvPath, [
        tRel, a.identity, a.mode, JSON.stringify(snap.status || ""),
        bestOut ? "" : parseKbps(outRow?.bitrate),
        bestOut?.fps ?? parseNum(outRow?.fps),
        bestOut ? `${bestOut.w}x${bestOut.h}` : (outRow?.resolution || ""),
        bestOut?.qlr ?? "",
        bestIn ? "" : "",
        bestIn?.fps ?? "",
        bestIn?.w ?? "",
        bestIn?.h ?? "",
        bestIn?.packetsLost ?? "",
        bestIn?.jitter ?? "",
        rtt ?? "",
        bestIn?.freezeCount ?? "",
      ].join(",") + "\n");
      // Fix: compute out kbps from raw deltas later; also log table kbps now
      if (outRow) {
        // rewrite last fields more carefully in summary; csv is best-effort
      }
    } catch (e) {
      a.samples.push({ t_s: tRel, at: parisNow(), error: String(e.message ?? e) });
    }
  }));
  const subLast = sub.samples.at(-1);
  const inMax = (subLast?.raw?.inn || []).filter((x) => !x.kind).reduce((m, x) => Math.max(m, (x.w || 0) * (x.h || 0)), 0);
  const inDims = (subLast?.raw?.inn || []).filter((x) => !x.kind).map((x) => `${x.w}x${x.h}@${x.fps}`).join("|");
  console.log(`[t=${tRel}s] connected=${actors.filter((a) => !a.joinError).length}/${actors.length} subIn=${inDims || "none"} maxPx=${inMax}`);
  if (sampleIdx === 2 || sampleIdx % 30 === 0) {
    await sub.page.screenshot({ path: join(OUT_DIR, `sub-t${tRel}.png`), timeout: 10000 }).catch((e) => console.log("shot " + e.message));
  }
}

for (const a of actors) {
  try {
    if (await a.page.isEnabled("#leave")) {
      await a.page.click("#leave");
      a.leftCleanly = true;
    }
  } catch { a.leftCleanly = false; }
  await a.context.close().catch(() => {});
}
await browser.close();
const endedAt = parisNow();

// Analyze
const pubs = actors.filter((a) => a.mode === "file");
const subSamples = sub.samples.filter((s) => s.raw);
const inSeries = [];
const prevBytes = new Map();
for (const s of subSamples) {
  for (const inn of (s.raw.inn || []).filter((x) => !x.kind)) {
    const key = `${inn.w}x${inn.h}`;
    const prev = prevBytes.get(0);
    let kbps = null;
    if (prev && inn.ts > prev.ts) {
      kbps = (8 * (inn.bytesReceived - prev.bytesReceived)) / ((inn.ts - prev.ts) / 1000) / 1000;
    }
    prevBytes.set(0, inn);
    inSeries.push({ t_s: s.t_s, w: inn.w, h: inn.h, fps: inn.fps, kbps, packetsLost: inn.packetsLost, freezeCount: inn.freezeCount, jitter: inn.jitter });
  }
}
const hdSamples = inSeries.filter((x) => x.w >= 1280 && x.h >= 720);
const midSamples = inSeries.filter((x) => x.w >= 640 && x.w < 1280);
const lowSamples = inSeries.filter((x) => x.w && x.w < 640);
const anyDisconnect = actors.some((a) => a.samples.some((s) => /disconnect/i.test(s.status || "")));
const allJoined = actors.every((a) => !a.joinError);

const hdVerdict = (() => {
  if (!allJoined) return "FAIL — not all participants joined";
  if (!hdSamples.length) return "FAIL — subscriber never received 1280x720 (or top) layer";
  const fpsOk = hdSamples.filter((x) => x.fps != null && x.fps >= 15).length;
  const kbpsVals = hdSamples.map((x) => x.kbps).filter((x) => x != null && x > 0);
  if (fpsOk < hdSamples.length * 0.5) return "FAIL — HD layer fps not sustained (>=15 on half of HD samples)";
  if (anyDisconnect) return "FAIL — disconnect observed during soak";
  return "PASS — subscriber received 1280x720 with sustained samples (loopback caveat)";
})();

const result = {
  test: "S1 overnight 5-pax soak + HD layer",
  startedAt, endedAt,
  config: { HARNESS_URL, ROOM, N_PUB, HOLD_S, SAMPLE_MS, Y4M, WAV, HEADLESS, source: "take4-raw vision-host-raw-1791240416301.webm (20s loop Y4M)" },
  join: actors.map((a) => ({ identity: a.identity, mode: a.mode, joinMs: a.joinMs, joinError: a.joinError, leftCleanly: a.leftCleanly, consoleErrors: [...new Set(a.consoleErrors)].slice(0, 10) })),
  subscriber_inbound: {
    total_video_samples: inSeries.length,
    hd_1280x720_samples: hdSamples.length,
    mid_samples: midSamples.length,
    low_samples: lowSamples.length,
    resolutions_seen: [...new Set(inSeries.map((x) => `${x.w}x${x.h}`))],
    hd_fps: stat(hdSamples.map((x) => x.fps)),
    hd_kbps: stat(hdSamples.map((x) => x.kbps)),
    all_fps: stat(inSeries.map((x) => x.fps)),
    all_kbps: stat(inSeries.map((x) => x.kbps)),
    packetsLost_last: inSeries.at(-1)?.packetsLost ?? null,
    freezeCount_last: inSeries.at(-1)?.freezeCount ?? null,
  },
  publishers_outbound_last: pubs.map((p) => {
    const last = p.samples.filter((s) => s.raw).at(-1);
    return { identity: p.identity, layers: last?.raw?.out ?? [], status: last?.status };
  }),
  verdict: hdVerdict,
  caveats: [
    "Single-machine loopback (browser + SFU on laptop) — not LAN/WAN",
    "Fake camera from take4 raw Y4M/WAV via Chrome --use-file-for-fake-*-capture (loops)",
    "Harness Room uses adaptiveStream+dynacast; sub forces large 1280x720 tiles for HIGH",
    "Hariness stats table shows one video row per track; raw PC getStats used for layer dims",
  ],
  sampleCount_sub: sub.samples.length,
  outDir: OUT_DIR,
};
writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2));
writeFileSync(join(OUT_DIR, "result.md"), `# S1 soak 5-pax HD\n\n- **Verdict: ${result.verdict}**\n- ${startedAt} → ${endedAt}\n- Room \`${ROOM}\`, ${N_PUB} pubs + 1 sub, hold ${HOLD_S}s\n- HD samples: ${hdSamples.length} / inbound video ${inSeries.length}\n- Resolutions seen: ${result.subscriber_inbound.resolutions_seen.join(", ") || "none"}\n- HD fps min/med/max: ${JSON.stringify(result.subscriber_inbound.hd_fps)}\n- HD kbps min/med/max: ${JSON.stringify(result.subscriber_inbound.hd_kbps)}\n- Caveats: loopback only; fake take4 raw file capture\n`);
// Keep a slim samples dump (last 5 per actor) to avoid huge files; full CSV has timeline
writeFileSync(join(OUT_DIR, "samples-tail.json"), JSON.stringify(actors.map((a) => ({ identity: a.identity, tail: a.samples.slice(-5) })), null, 2));
console.log(JSON.stringify({ verdict: result.verdict, resolutions: result.subscriber_inbound.resolutions_seen, hd: hdSamples.length, out: OUT_DIR }, null, 2));
process.exit(hdVerdict.startsWith("PASS") ? 0 : 1);
