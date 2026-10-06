#!/usr/bin/env node
// S1 soak: N pubs + 1 HIGH sub. Incremental per-rid CSV/JSONL with QLR durations.
// Env: HARNESS_URL ROOM N_PUB HOLD_S SAMPLE_MS MODE(file|camera|canvas) SIMULCAST_LAYERS(2|3) HQ_REC(0|1)
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dir = dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = process.env.HARNESS_URL ?? "http://127.0.0.1:5190";
const ROOM = process.env.ROOM ?? "s1-soak";
const N_PUB = Number(process.env.N_PUB ?? 5);
const N_SUB = Number(process.env.N_SUB ?? 1);
const HOLD_S = Number(process.env.HOLD_S ?? 1800);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 10000);
const HEADLESS = process.env.HEADLESS !== "0";
const CHROME = process.env.CHROME ?? "/ms-playwright/chromium-1140/chrome-linux/chrome";
const Y4M = process.env.Y4M ?? "/work/media/take4-20s.y4m";
const WAV = process.env.WAV ?? "/work/media/take4-20s.wav";
const PUB_MODE = process.env.MODE ?? "canvas"; // canvas|camera|file — camera needs secure context (localhost)
const SIMULCAST_LAYERS = Number(process.env.SIMULCAST_LAYERS ?? 3) === 2 ? 2 : 3;
const HQ_REC = process.env.HQ_REC === "1";
const OUT_DIR = process.env.OUT_DIR ?? join(__dir, "soak-" + Date.now());
mkdirSync(OUT_DIR, { recursive: true });

const parisNow = () =>
  new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).replace(" ", "T") + " Europe/Paris";

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
  return page.evaluate(() => ({
    status: document.querySelector("#status")?.textContent?.trim() ?? null,
    remotes: [...document.querySelectorAll("#remote-tiles .tile .label")].map((l) => l.textContent.trim()),
  }));
}

/** Full outbound/inbound getStats including QLR durations + encoder. */
async function rawPcStats(page) {
  return page.evaluate(async () => {
    const out = [];
    const inn = [];
    const pairs = [];
    const codecs = [];
    for (const pc of window.__pcs ?? []) {
      if (pc.connectionState === "closed") continue;
      const rep = await pc.getStats();
      for (const s of rep.values()) {
        if (s.type === "codec") {
          codecs.push({ id: s.id, mimeType: s.mimeType, clockRate: s.clockRate, payloadType: s.payloadType });
        }
        if (s.type === "outbound-rtp" && s.kind === "video") {
          out.push({
            rid: s.rid ?? null,
            ssrc: s.ssrc ?? null,
            bytesSent: s.bytesSent,
            framesSent: s.framesSent,
            w: s.frameWidth ?? null,
            h: s.frameHeight ?? null,
            fps: s.framesPerSecond ?? null,
            active: s.active ?? null,
            qlr: s.qualityLimitationReason ?? null,
            qlrDurations: s.qualityLimitationDurations ?? null,
            qlrResChanges: s.qualityLimitationResolutionChanges ?? null,
            encoderImplementation: s.encoderImplementation ?? null,
            powerEfficientEncoder: s.powerEfficientEncoder ?? null,
            scalabilityMode: s.scalabilityMode ?? null,
            ts: s.timestamp,
          });
        }
        if (s.type === "inbound-rtp" && s.kind === "video") {
          inn.push({
            kind: "video",
            ssrc: s.ssrc ?? null,
            bytesReceived: s.bytesReceived,
            framesReceived: s.framesReceived,
            w: s.frameWidth ?? null,
            h: s.frameHeight ?? null,
            fps: s.framesPerSecond ?? null,
            packetsLost: s.packetsLost ?? null,
            jitter: s.jitter ?? null,
            freezeCount: s.freezeCount ?? null,
            decoderImplementation: s.decoderImplementation ?? null,
            ts: s.timestamp,
          });
        }
        if (s.type === "inbound-rtp" && s.kind === "audio") {
          inn.push({
            kind: "audio",
            ssrc: s.ssrc ?? null,
            bytesReceived: s.bytesReceived,
            packetsLost: s.packetsLost ?? null,
            packetsReceived: s.packetsReceived ?? null,
            jitter: s.jitter ?? null,
            concealedSamples: s.concealedSamples ?? null,
            concealmentEvents: s.concealmentEvents ?? null,
            audioLevel: s.audioLevel ?? null,
            totalAudioEnergy: s.totalAudioEnergy ?? null,
            ts: s.timestamp,
          });
        }
        if (s.type === "candidate-pair" && s.nominated && s.currentRoundTripTime != null) {
          pairs.push({ rtt_ms: s.currentRoundTripTime * 1000 });
        }
      }
    }
    return { pcs: (window.__pcs ?? []).length, out, inn, pairs, codecs };
  });
}

async function forceHighLayer(page) {
  await page.evaluate(() => {
    document.querySelectorAll("#remote-tiles video").forEach((v) => {
      v.style.width = "1280px";
      v.style.height = "720px";
      v.width = 1280;
      v.height = 720;
    });
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

// HQ rec = Media's S4Recorder in the publisher tab on the published stream (harness __startHqRec).
async function setHqRec(page, on, cond = `soak-${ROOM}`) {
  return page.evaluate(async ({ want, cond, dur }) => {
    if (want) {
      if (typeof window.__startHqRec === "function") return window.__startHqRec({ cond, durationSec: dur });
      return { ok: false, error: "__startHqRec missing" };
    }
    if (typeof window.__stopHqRec === "function") return window.__stopHqRec();
    return { ok: false, error: "__stopHqRec missing" };
  }, { want: on, cond, dur: HOLD_S });
}

function harnessUrlWithFlags() {
  const u = new URL(HARNESS_URL.includes("://") ? HARNESS_URL : `http://${HARNESS_URL}`);
  u.searchParams.set("layers", String(SIMULCAST_LAYERS));
  if (HQ_REC) u.searchParams.set("hqRec", "1");
  return u.toString();
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
const baseUrl = harnessUrlWithFlags();
console.log(`[soak] start ${startedAt} room=${ROOM} pubs=${N_PUB} subs=${N_SUB} hold=${HOLD_S}s mode=${PUB_MODE} layers=${SIMULCAST_LAYERS} hqRec=${HQ_REC}`);
console.log(`[soak] url=${baseUrl} out=${OUT_DIR}`);

const browser = await chromium.launch({ executablePath: CHROME, headless: HEADLESS, args: chromeArgs });
const actors = [];

async function makeActor(identity, mode) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.grantPermissions(["camera", "microphone"], { origin: new URL(baseUrl).origin }).catch(() => {});
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
  page.on("console", (m) => {
    if (m.type() === "error" || /hq-rec|file-publish|layers/.test(m.text())) consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const a = { identity, mode, context, page, consoleErrors, joinMs: null, joinError: null, samples: [], leftCleanly: false, hqRec: null };
  actors.push(a);
  return a;
}

for (let i = 1; i <= N_PUB; i++) await makeActor(`soak-pub-${i}`, PUB_MODE);
for (let i = 1; i <= N_SUB; i++) await makeActor(N_SUB === 1 ? "soak-sub-hd" : `soak-sub-${i}`, "none");

await Promise.all(actors.map(async (a, idx) => {
  await new Promise((r) => setTimeout(r, idx * 500));
  const tJ = Date.now();
  try {
    await a.page.goto(baseUrl, { waitUntil: "load", timeout: 45000 });
    await a.page.fill("#room", ROOM);
    await a.page.fill("#identity", a.identity);
    await a.page.selectOption("#media-mode", a.mode);
    // Prefer select for layers if present
    if (await a.page.locator("#simulcast-layers").count()) {
      await a.page.selectOption("#simulcast-layers", String(SIMULCAST_LAYERS));
    }
    await a.page.click("#join");
    await a.page.waitForFunction(
      () => /connected/.test(document.querySelector("#status")?.textContent ?? "") &&
            !/disconnected/.test(document.querySelector("#status")?.textContent ?? ""),
      null,
      { timeout: 45000 },
    );
    a.joinMs = Date.now() - tJ;
    if (a.mode === "none") {
      await a.page.waitForTimeout(1500);
      await forceHighLayer(a.page);
    } else if (HQ_REC) {
      a.hqRec = await setHqRec(a.page, true);
      console.log(`[${a.identity}] hqRec start`, JSON.stringify(a.hqRec));
    }
  } catch (e) {
    a.joinError = String(e?.message ?? e).split("\n")[0];
  }
  console.log(`[${a.identity}] join ${a.joinError ? "FAIL " + a.joinError : "ok " + a.joinMs + "ms"}`);
}));

const ridCsv = join(OUT_DIR, "outbound-rid-series.csv");
const ridJsonl = join(OUT_DIR, "outbound-rid-series.jsonl");
const inCsv = join(OUT_DIR, "inbound-series.csv");
const inJsonl = join(OUT_DIR, "inbound-series.jsonl");
appendFileSync(ridCsv, "t_s,at,identity,rid,ssrc,w,h,fps,bytesSent,framesSent,active,qlr,qlrDur_none,qlrDur_cpu,qlrDur_bandwidth,qlrDur_other,qlrResChanges,encoderImplementation,powerEfficientEncoder\n");
appendFileSync(inCsv, "t_s,at,identity,kind,ssrc,w,h,fps,bytesReceived,packetsLost,jitter,freezeCount,decoderImplementation,audioLevel,totalAudioEnergy\n");

function qlrDur(d, key) {
  if (!d || typeof d !== "object") return "";
  const v = d[key];
  return v == null ? "" : v;
}

const holdEnd = Date.now() + HOLD_S * 1000;
let sampleIdx = 0;
const subs = actors.filter((a) => a.mode === "none");

while (Date.now() < holdEnd) {
  await new Promise((r) => setTimeout(r, SAMPLE_MS));
  sampleIdx++;
  const tRel = Math.round((Date.now() - t0) / 1000);
  const at = parisNow();
  for (const s of subs) await forceHighLayer(s.page).catch(() => {});

  await Promise.all(actors.map(async (a) => {
    try {
      const snap = await scrape(a.page);
      const raw = await rawPcStats(a.page);
      // Keep only light sample in memory; full series goes to disk
      a.samples.push({ t_s: tRel, at, status: snap.status, remotes: snap.remotes, rawSummary: { outN: raw.out?.length, innN: raw.inn?.length } });
      for (const o of raw.out || []) {
        const line = {
          t_s: tRel, at, identity: a.identity, rid: o.rid, ssrc: o.ssrc,
          w: o.w, h: o.h, fps: o.fps, bytesSent: o.bytesSent, framesSent: o.framesSent,
          active: o.active, qlr: o.qlr,
          qlrDurations: o.qlrDurations, qlrResChanges: o.qlrResChanges,
          encoderImplementation: o.encoderImplementation, powerEfficientEncoder: o.powerEfficientEncoder,
        };
        appendFileSync(ridJsonl, JSON.stringify(line) + "\n");
        appendFileSync(ridCsv, [
          tRel, JSON.stringify(at), a.identity, o.rid ?? "", o.ssrc ?? "",
          o.w ?? "", o.h ?? "", o.fps ?? "", o.bytesSent ?? "", o.framesSent ?? "",
          o.active ?? "", o.qlr ?? "",
          qlrDur(o.qlrDurations, "none"), qlrDur(o.qlrDurations, "cpu"),
          qlrDur(o.qlrDurations, "bandwidth"), qlrDur(o.qlrDurations, "other"),
          o.qlrResChanges ?? "", JSON.stringify(o.encoderImplementation ?? ""), o.powerEfficientEncoder ?? "",
        ].join(",") + "\n");
      }
      for (const inn of raw.inn || []) {
        const line = { t_s: tRel, at, identity: a.identity, ...inn };
        appendFileSync(inJsonl, JSON.stringify(line) + "\n");
        appendFileSync(inCsv, [
          tRel, JSON.stringify(at), a.identity, inn.kind ?? "video", inn.ssrc ?? "",
          inn.w ?? "", inn.h ?? "", inn.fps ?? "", inn.bytesReceived ?? "", inn.packetsLost ?? "",
          inn.jitter ?? "", inn.freezeCount ?? "", JSON.stringify(inn.decoderImplementation ?? ""),
          inn.audioLevel ?? "", inn.totalAudioEnergy ?? "",
        ].join(",") + "\n");
      }
      a._lastRaw = raw;
    } catch (e) {
      a.samples.push({ t_s: tRel, at, error: String(e.message ?? e) });
    }
  }));

  const sub0 = subs[0];
  const last = sub0?._lastRaw;
  const dims = (last?.inn || []).filter((x) => x.kind !== "audio").map((x) => `${x.w}x${x.h}@${x.fps}`).join("|") || "none";
  const enc = actors.filter((a) => a.mode !== "none").map((a) => {
    const o = (a._lastRaw?.out || []).find((x) => x.encoderImplementation);
    return o ? `${a.identity}:${o.encoderImplementation}` : null;
  }).filter(Boolean).join(" ");
  console.log(`[t=${tRel}s] connected=${actors.filter((a) => !a.joinError).length}/${actors.length} subIn=${dims} enc=${enc || "—"}`);
  if (sampleIdx === 2 || sampleIdx % 30 === 0) {
    for (const s of subs) {
      await s.page.screenshot({ path: join(OUT_DIR, `${s.identity}-t${tRel}.png`), timeout: 10000 }).catch(() => {});
    }
  }
}

for (const a of actors) {
  if (HQ_REC && a.mode !== "none") {
    try {
      const stop = await setHqRec(a.page, false);
      writeFileSync(join(OUT_DIR, `${a.identity}-s4-results.json`), JSON.stringify(stop, null, 2));
    } catch (e) {
      console.log(`[${a.identity}] hqRec stop err`, e.message);
    }
  }
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

const pubs = actors.filter((a) => a.mode !== "none");
const allJoined = actors.every((a) => !a.joinError);
const encoders = {};
for (const p of pubs) {
  const layers = p._lastRaw?.out || [];
  encoders[p.identity] = [...new Set(layers.map((o) => o.encoderImplementation).filter(Boolean))];
}

const result = {
  test: "S1 soak (instrumented per-rid series)",
  startedAt, endedAt,
  config: { HARNESS_URL: baseUrl, ROOM, N_PUB, N_SUB, HOLD_S, SAMPLE_MS, PUB_MODE, SIMULCAST_LAYERS, HQ_REC, HEADLESS },
  join: actors.map((a) => ({
    identity: a.identity, mode: a.mode, joinMs: a.joinMs, joinError: a.joinError,
    leftCleanly: a.leftCleanly, hqRec: a.hqRec, consoleErrors: [...new Set(a.consoleErrors)].slice(0, 15),
  })),
  encoders_last: encoders,
  publishers_outbound_last: pubs.map((p) => ({ identity: p.identity, layers: p._lastRaw?.out ?? [], status: p.samples.at(-1)?.status })),
  artifacts: {
    outbound_rid_csv: "outbound-rid-series.csv",
    outbound_rid_jsonl: "outbound-rid-series.jsonl",
    inbound_csv: "inbound-series.csv",
    inbound_jsonl: "inbound-series.jsonl",
  },
  allJoined,
  caveats: [
    "Incremental CSV/JSONL is authoritative; in-memory samples are light summaries only",
    "qualityLimitationDurations/ResChanges captured when Chromium exposes them on outbound-rtp",
    "camera mode requires secure context (use http://127.0.0.1:5190 on the same machine)",
    "Single-process soak is loopback unless spread across machines",
  ],
  outDir: OUT_DIR,
};
writeFileSync(join(OUT_DIR, "result.json"), JSON.stringify(result, null, 2));
writeFileSync(join(OUT_DIR, "result.md"), `# S1 soak\n\n- ${startedAt} → ${endedAt}\n- mode=${PUB_MODE} layers=${SIMULCAST_LAYERS} hqRec=${HQ_REC} pubs=${N_PUB} subs=${N_SUB}\n- joined ${actors.filter((a) => !a.joinError).length}/${actors.length}\n- encoders: ${JSON.stringify(encoders)}\n- series: outbound-rid-series.csv / .jsonl\n`);
writeFileSync(join(OUT_DIR, "samples-tail.json"), JSON.stringify(actors.map((a) => ({ identity: a.identity, tail: a.samples.slice(-5) })), null, 2));
console.log(JSON.stringify({ allJoined, encoders, out: OUT_DIR }, null, 2));
process.exit(allJoined ? 0 : 1);
