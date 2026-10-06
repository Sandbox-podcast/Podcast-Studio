#!/usr/bin/env node
// S1 "régie decode floor": N file publishers (2 layers, VP8, no rec) + 1 régie subscriber pinned HIGH on all tracks.
// Publishers and régie run in SEPARATE Edge instances so the régie process-tree CPU is isolated (marker = user-data-dir).
// SAFETY: refuses unless AB_GO=1. Env: HARNESS AB_PATH N_PUB(5) LAYERS(2) SRC(take4-pingpong.webm) WARMUP_S(20) WIN_S(120) SAMPLE_MS(2000) CHANNEL(msedge) OUT_DIR
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dir = dirname(fileURLToPath(import.meta.url));
const benign = (e) => /Target page, context or browser has been closed|TargetClosedError/.test(String(e?.stack ?? e));
process.on("unhandledRejection", (e) => { if (benign(e)) return console.log("[rg] ignored", String(e).split("\n")[0]); console.log("[rg] unhandledRejection", e); process.exit(1); });
process.on("uncaughtException", (e) => { if (benign(e)) return console.log("[rg] ignored", String(e).split("\n")[0]); console.log("[rg] uncaughtException", e); process.exit(1); });
if (process.env.AB_GO !== "1") { console.log("[rg] refusing: AB_GO=1 required"); process.exit(2); }

const HARNESS = process.env.HARNESS ?? "http://localhost:5190";
const AB_PATH = process.env.AB_PATH ?? "/ab/index.html";
const N_PUB = Number(process.env.N_PUB ?? 5);
const LAYERS = Number(process.env.LAYERS ?? 2);
const SRC = process.env.SRC ?? "take4-pingpong.webm";
const WARMUP_S = Number(process.env.WARMUP_S ?? 20);
const WIN_S = Number(process.env.WIN_S ?? 120);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 2000);
const CHANNEL = process.env.CHANNEL ?? "msedge";
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const OUT_DIR = process.env.OUT_DIR ?? join(__dir, `regie-${stamp}`);
mkdirSync(OUT_DIR, { recursive: true });
const COND = `regie-${N_PUB}pub-${LAYERS}L-vp8`;
const paris = (ms = Date.now()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false }).format(new Date(ms)).replace(" ", "T").replace(",", ".");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { const l = `[${paris()}] ${a.join(" ")}`; console.log(l); appendFileSync(join(OUT_DIR, "regie.log"), l + "\n"); };
const csvq = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? JSON.stringify(String(v)) : String(v));
const row = (a) => a.map(csvq).join(",") + "\n";

const INIT_PC = () => { const O = window.RTCPeerConnection; window.__pcs = []; window.RTCPeerConnection = function (...a) { const pc = new O(...a); window.__pcs.push(pc); return pc; }; window.RTCPeerConnection.prototype = O.prototype; Object.setPrototypeOf(window.RTCPeerConnection, O); };
async function launch(marker) {
  const ctx = await chromium.launchPersistentContext(join(tmpdir(), marker), { ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: CHANNEL }), headless: process.env.HEADLESS === "1", viewport: { width: 1600, height: 1000 },
    args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--use-fake-ui-for-media-stream", "--no-first-run"] });
  await ctx.grantPermissions(["microphone"], { origin: new URL(HARNESS).origin }).catch(() => {});
  await ctx.addInitScript(INIT_PC);
  return ctx;
}
async function join_(page, url, room, id) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.fill("#room", room); await page.fill("#identity", id);
  await page.click("#join");
  await page.waitForFunction(() => { const s = document.querySelector("#status")?.textContent ?? ""; return /connected/.test(s) && !/disconnected|error/.test(s); }, null, { timeout: 45000 });
}
const outStats = (page) => page.evaluate(async () => { const o = []; for (const pc of window.__pcs ?? []) { if (pc.connectionState === "closed") continue; const r = await pc.getStats(); for (const s of r.values()) if (s.type === "outbound-rtp" && s.kind === "video") o.push({ rid: s.rid, w: s.frameWidth ?? null, h: s.frameHeight ?? null, fps: s.framesPerSecond ?? null, active: s.active, qlr: s.qualityLimitationReason, d: s.qualityLimitationDurations ?? {}, enc: s.encoderImplementation ?? null, bytes: s.bytesSent, ts: s.timestamp }); } return o; });
const inStats = (page) => page.evaluate(async () => {
  const idOf = {};
  for (const p of window.__lkRoom?.remoteParticipants.values() ?? []) for (const pub of p.trackPublications.values()) if (pub.track?.mediaStreamTrack) idOf[pub.track.mediaStreamTrack.id] = p.identity;
  const o = [];
  for (const pc of window.__pcs ?? []) { if (pc.connectionState === "closed") continue; const r = await pc.getStats(); for (const s of r.values()) if (s.type === "inbound-rtp" && s.kind === "video") o.push({ who: idOf[s.trackIdentifier] ?? s.trackIdentifier, w: s.frameWidth ?? null, h: s.frameHeight ?? null, fps: s.framesPerSecond ?? null, framesDecoded: s.framesDecoded, framesDropped: s.framesDropped ?? null, totalDecodeTime: s.totalDecodeTime ?? null, keyFramesDecoded: s.keyFramesDecoded ?? null, freezeCount: s.freezeCount ?? null, totalFreezesDuration: s.totalFreezesDuration ?? null, dec: s.decoderImplementation ?? null, powerEff: s.powerEfficientDecoder ?? null, bytes: s.bytesReceived, lost: s.packetsLost, ts: s.timestamp }); }
  return o;
});

const room = `s1-${COND}-${stamp.slice(-6)}`;
const pubM = `s1rg-pub-${stamp}`, subM = `s1rg-sub-${stamp}`;
const T = { cond: COND, room, src: SRC };
log(`=== ${COND} room=${room} src=${SRC}`);
let cpuP = null; const ps1 = join(__dir, "ab-cpu-sampler.ps1");
if (process.platform === "win32" && existsSync(ps1)) cpuP = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Markers", `${pubM},${subM}`, "-OutCsv", join(OUT_DIR, `${COND}-cpu.csv`), "-IntervalMs", String(SAMPLE_MS), "-DurationSec", String(WARMUP_S + WIN_S + 120)], { stdio: "ignore" });
const OUT = join(OUT_DIR, "pub-outbound-series.csv"), IN = join(OUT_DIR, "regie-inbound-series.csv");
appendFileSync(OUT, row(["t_rel_s", "at_paris", "pub", "rid", "w", "h", "fps", "active", "qlr", "qlrDur_none", "qlrDur_cpu", "qlrDur_bandwidth", "qlrDur_other", "encoderImplementation", "bytesSent"]));
appendFileSync(IN, row(["t_rel_s", "at_paris", "track_from", "w", "h", "fps", "framesDecoded", "framesDropped", "totalDecodeTime", "keyFramesDecoded", "freezeCount", "totalFreezesDuration", "decoderImplementation", "powerEfficientDecoder", "bytesReceived", "packetsLost"]));
let pubCtx, subCtx; const pubs = []; const series = { out: [], inn: [] };
try {
  pubCtx = await launch(pubM);
  for (let i = 1; i <= N_PUB; i++) {
    const pg = i === 1 ? (pubCtx.pages()[0] ?? await pubCtx.newPage()) : await pubCtx.newPage();
    await join_(pg, `${HARNESS}${AB_PATH}?layers=${LAYERS}&mode=file&src=${SRC}`, room, `rg-pub-${i}`);
    pubs.push({ id: `rg-pub-${i}`, pg });
    log(`pub ${i} joined`);
  }
  await sleep(2000);
  for (const p of pubs) { const ok = await p.pg.evaluate(() => !!window.__publishedStream?.getVideoTracks().length); if (!ok) throw new Error(`${p.id} has no published video`); }
  subCtx = await launch(subM);
  const sub = subCtx.pages()[0] ?? await subCtx.newPage();
  await join_(sub, `${HARNESS}${AB_PATH}?adaptive=0&mode=none&unlockStats=1`, room, "rg-regie");
  T.join_at = paris();
  await sub.waitForFunction((n) => document.querySelectorAll("#remote-tiles video").length >= n, N_PUB, { timeout: 30000 }).catch(() => {});
  const pin = () => sub.evaluate(() => window.__pinLayer?.("HIGH") ?? -1).catch(() => -1);
  log(`regie joined, pinned=${await pin()} tiles; warmup ${WARMUP_S}s`);
  await sleep(WARMUP_S * 1000);
  const ws = Date.now(); T.window_start = paris(ws);
  while (Date.now() - ws < WIN_S * 1000) {
    await sleep(SAMPLE_MS);
    const tr = Math.round((Date.now() - ws) / 100) / 10, at = paris();
    await pin();
    for (const p of pubs) for (const o of await outStats(p.pg).catch(() => [])) { series.out.push({ tr, pub: p.id, ...o }); appendFileSync(OUT, row([tr, at, p.id, o.rid, o.w, o.h, o.fps, o.active, o.qlr, o.d.none, o.d.cpu, o.d.bandwidth, o.d.other, o.enc, o.bytes])); }
    for (const i of await inStats(sub).catch(() => [])) { series.inn.push({ tr, ...i }); appendFileSync(IN, row([tr, at, i.who, i.w, i.h, i.fps, i.framesDecoded, i.framesDropped, i.totalDecodeTime, i.keyFramesDecoded, i.freezeCount, i.totalFreezesDuration, i.dec, i.powerEff, i.bytes, i.lost])); }
  }
  T.window_end = paris(); T.status = "DONE";
  await sub.screenshot({ path: join(OUT_DIR, "regie-end.png") }).catch(() => {});
} catch (e) { T.status = "FAIL"; T.note = String(e?.message ?? e).split("\n")[0]; log("FAIL", T.note); }
finally {
  const closeT = (c) => Promise.race([c?.close().catch(() => {}), sleep(15000)]);
  await closeT(subCtx); await closeT(pubCtx);
  try { cpuP?.kill(); } catch {}
}
// summary
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const tracks = {};
for (const who of [...new Set(series.inn.map((i) => i.who))]) {
  const r = series.inn.filter((i) => i.who === who); const a = r[0], b = r.at(-1);
  const dF = (b?.framesDecoded ?? 0) - (a?.framesDecoded ?? 0), dT = (b?.totalDecodeTime ?? 0) - (a?.totalDecodeTime ?? 0);
  tracks[who] = { n: r.length, w_med: med(r.map((x) => x.w)), h_med: med(r.map((x) => x.h)), fps_med: med(r.map((x) => x.fps)), framesDecoded_delta: dF, decode_ms_per_frame: dF > 0 ? Math.round((dT / dF) * 1000 * 100) / 100 : null, framesDropped_delta: (b?.framesDropped ?? 0) - (a?.framesDropped ?? 0), freeze_delta: (b?.freezeCount ?? 0) - (a?.freezeCount ?? 0), freezeDur_delta_s: Math.round(((b?.totalFreezesDuration ?? 0) - (a?.totalFreezesDuration ?? 0)) * 100) / 100, decoderImplementation: [...new Set(r.map((x) => x.dec).filter(Boolean))], share_720p: r.length ? Math.round((r.filter((x) => x.h === 720).length / r.length) * 100) / 100 : null };
}
const pubSum = {};
for (const p of [...new Set(series.out.map((o) => o.pub))]) {
  const top = series.out.filter((o) => o.pub === p && o.rid === (LAYERS === 2 ? "h" : "f"));
  const qc = {}; for (const o of top) qc[o.qlr] = (qc[o.qlr] ?? 0) + 1;
  const a = top[0]?.d ?? {}, b = top.at(-1)?.d ?? {}; const dd = {}; for (const k of Object.keys(b)) dd[k] = Math.round((b[k] - (a[k] ?? 0)) * 10) / 10;
  pubSum[p] = { hd_rid: LAYERS === 2 ? "h" : "f", w_med: med(top.map((o) => o.w)), h_med: med(top.map((o) => o.h)), fps_med: med(top.map((o) => o.fps)), share_720p: top.length ? Math.round((top.filter((o) => o.h === 720).length / top.length) * 100) / 100 : null, qlr_counts: qc, qlrDurations_delta_s: dd };
}
writeFileSync(join(OUT_DIR, "regie-summary.json"), JSON.stringify({ T, config: { N_PUB, LAYERS, SRC, WARMUP_S, WIN_S, SAMPLE_MS }, regie_tracks: tracks, publishers: pubSum, cpu_csv: `${COND}-cpu.csv` }, null, 2));
log(`${COND} ${T.status} window ${T.window_start} → ${T.window_end}`);
