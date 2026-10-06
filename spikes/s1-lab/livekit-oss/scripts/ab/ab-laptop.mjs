#!/usr/bin/env node
// S1 laptop-only A/B: 1 publisher (real cam | take4 file loop) + 2 subscribers (pinned HIGH / LOW),
// simulcast 3 vs 2 layers, HQ rec ON (Media S4Recorder, same tab, same published stream) vs OFF.
// Runs on the Windows HOST (node + playwright-core + system Edge) so the publisher page is
// http://localhost:5190 = secure context = real getUserMedia.
//
// SAFETY LATCH: refuses to run unless AB_GO=1 (set only after lead confirms Vision freed the 3070).
//
// Env: HARNESS (http://localhost:5190) AB_PATH (/ab/index.html) CONDS (all | comma list of names)
//      CONDS default = ab-file-3L-off,ab-file-3L-on,ab-file-2L-off,ab-file-2L-on,ab-cam-3L-on (or "full8")
//      SUB_REC (1) SUB_REC_BITRATE (2500000)
//      WARMUP_S (20) REC_S (120) COOLDOWN_S (10) SAMPLE_MS (2000) S4_BASE (http://127.0.0.1:3320)
//      CHANNEL (msedge) OUT_DIR  ON_S4_FAIL (skip|abort, default skip)
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dir = dirname(fileURLToPath(import.meta.url));
// playwright-core 1.48 + Edge 154: closing a persistent context can reject an internal navigation promise
// (TargetClosedError) as an UNHANDLED rejection, which killed node after condition 1 (laptop, 02:25:53).
const benign = (e) => /Target page, context or browser has been closed|TargetClosedError/.test(String(e?.stack ?? e));
process.on("unhandledRejection", (e) => { if (benign(e)) { console.log("[ab] ignored", String(e).split("\n")[0]); return; } console.error("[ab] unhandledRejection", e); process.exit(1); });
process.on("uncaughtException", (e) => { if (benign(e)) { console.log("[ab] ignored", String(e).split("\n")[0]); return; } console.error("[ab] uncaughtException", e); process.exit(1); });
if (process.env.AB_GO !== "1") {
  console.error("[ab] refusing to run: set AB_GO=1 only after the lead confirms Vision freed the 3070.");
  process.exit(2);
}

const HARNESS = process.env.HARNESS ?? "http://localhost:5190";
const AB_PATH = process.env.AB_PATH ?? "/ab/index.html";
const WARMUP_S = Number(process.env.WARMUP_S ?? 20);
const REC_S = Number(process.env.REC_S ?? 120);
const COOLDOWN_S = Number(process.env.COOLDOWN_S ?? 10);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 2000);
const S4_BASE = process.env.S4_BASE ?? "http://127.0.0.1:3320";
const CHANNEL = process.env.CHANNEL ?? "msedge";
const ON_S4_FAIL = process.env.ON_S4_FAIL ?? "skip";
const CHROME_PATH = process.env.CHROME_PATH ?? ""; // box dry-run only (else system Edge via CHANNEL)
const FAKE_MEDIA = process.env.FAKE_MEDIA === "1";
// Chromium only exposes encoderImplementation while the page captures; file pass holds a disabled mic track.
const UNLOCK_FILE = process.env.UNLOCK_FILE !== "0";
const UNLOCK_SUBS = process.env.UNLOCK_SUBS === "1"; // decoderImplementation on subs (opens mic x2) // box dry-run only — laptop A/B uses the REAL camera
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const OUT_DIR = process.env.OUT_DIR ?? join(__dir, `ab-${stamp}`);
mkdirSync(OUT_DIR, { recursive: true });

// Lead's reduced default order (5). Any ab-{cam,file}-{2,3}L-{on,off} name is accepted via CONDS.
// CODEC=vp8 (default, livekit-client default) | h264 — non-default codec suffixes cond names (S4 keys stay distinct).
const CODEC = (process.env.CODEC ?? "vp8").toLowerCase();
const SFX = CODEC === "vp8" ? "" : `-${CODEC}`;
const parseCond = (name) => { const m = /^ab-(cam|file)-([23])L-(on|off)(?:-(h264|vp8|vp9|av1))?$/.exec(name); return m ? { name: m[4] ? name : name + SFX, src: m[1], L: Number(m[2]), rec: m[3] === "on" } : null; };
const DEFAULT = CODEC === "vp8"
  ? ["ab-file-3L-off", "ab-file-3L-on", "ab-file-2L-off", "ab-file-2L-on", "ab-cam-3L-on"]
  : ["ab-file-3L-off", "ab-file-3L-on", "ab-file-2L-off", "ab-file-2L-on"];
const FULL8 = []; for (const src of ["cam", "file"]) for (const L of [3, 2]) for (const rec of ["off", "on"]) FULL8.push(`ab-${src}-${L}L-${rec}`);
const want = (process.env.CONDS ?? "default").split(",").map((s) => s.trim()).filter(Boolean);
const names = want.includes("default") || want.includes("all") ? DEFAULT : want.includes("full8") ? FULL8 : want;
const CONDS = names.map(parseCond).filter(Boolean);
// HD-pinned subscriber records the RECEIVED track per condition -> <cond>-sub-hi-rx.webm (distinct_fps.py)
const SUB_REC = process.env.SUB_REC !== "0";
const SUB_REC_BITRATE = Number(process.env.SUB_REC_BITRATE ?? 2_500_000);
if (!CONDS.length) { console.error("[ab] no matching CONDS", want); process.exit(2); }

const paris = (ms = Date.now()) => {
  const d = new Date(ms);
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false }).format(d);
  return f.replace(" ", "T").replace(",", ".");
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const max = (a) => { const s = a.filter(Number.isFinite); return s.length ? Math.max(...s) : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const csvq = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? JSON.stringify(String(v)) : String(v));
const row = (arr) => arr.map(csvq).join(",") + "\n";

const log = (...a) => { const l = `[${paris()}] ${a.join(" ")}`; console.log(l); appendFileSync(join(OUT_DIR, "ab.log"), l + "\n"); };

// ---------- preflight ----------
async function get(url) {
  try { const r = await fetch(url, { cache: "no-store" }); const b = await r.text(); return { ok: r.ok, status: r.status, body: b.slice(0, 300) }; }
  catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
}
const pre = { at: paris(), harness: await get(HARNESS + AB_PATH), media: await get(HARNESS + "/media/take4-raw.webm") };
if (CONDS.some((c) => c.rec)) pre.s4Health = await get(`${S4_BASE}/api/health`);
writeFileSync(join(OUT_DIR, "preflight.json"), JSON.stringify(pre, null, 2));
log("preflight", JSON.stringify({ harness: pre.harness.status ?? pre.harness.error, media: pre.media.status ?? pre.media.error, s4: pre.s4Health ? (pre.s4Health.status ?? pre.s4Health.error) : "n/a" }));
if (!pre.harness.ok) { log("ABORT harness A/B page not reachable — deploy public/ab first"); process.exit(3); }
const s4Ok = !pre.s4Health || pre.s4Health.ok;
if (!s4Ok) {
  log(`S4 health FAILED at ${S4_BASE}/api/health — NOT restarting Media's process. policy=${ON_S4_FAIL}`);
  if (ON_S4_FAIL === "abort") process.exit(4);
}

// ---------- CSV headers ----------
const OUT_CSV = join(OUT_DIR, "outbound-rid-series.csv");
const IN_CSV = join(OUT_DIR, "inbound-series.csv");
const TIMES_CSV = join(OUT_DIR, "conditions-timestamps.csv");
appendFileSync(OUT_CSV, row(["cond", "t_rel_s", "at_paris", "rid", "ssrc", "w", "h", "fps", "bytesSent", "framesSent", "active", "qlr", "qlrDur_none", "qlrDur_cpu", "qlrDur_bandwidth", "qlrDur_other", "qlrResChanges", "encoderImplementation", "powerEfficientEncoder", "scalabilityMode", "targetBitrate", "codec"]));
appendFileSync(IN_CSV, row(["cond", "t_rel_s", "at_paris", "sub", "pin", "kind", "ssrc", "w", "h", "fps", "bytesReceived", "packetsLost", "jitter", "freezeCount", "totalFreezesDuration", "decoderImplementation"]));
appendFileSync(TIMES_CSV, row(["cond", "status", "join_at", "window_start_paris", "window_end_paris", "rec_start_paris", "rec_stop_paris", "rec_result", "note", "subrec_start_paris", "subrec_stop_paris", "subrec_file", "subrec_bytes"]));

const INIT_PC = () => {
  const Orig = window.RTCPeerConnection;
  window.__pcs = [];
  window.RTCPeerConnection = function (...a) { const pc = new Orig(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = Orig.prototype;
  Object.setPrototypeOf(window.RTCPeerConnection, Orig);
};

async function stats(page) {
  return page.evaluate(async () => {
    const out = [], inn = [];
    for (const pc of window.__pcs ?? []) {
      if (pc.connectionState === "closed") continue;
      const rep = await pc.getStats();
      for (const s of rep.values()) {
        if (s.type === "outbound-rtp" && s.kind === "video") out.push({
          rid: s.rid ?? null, ssrc: s.ssrc, w: s.frameWidth ?? null, h: s.frameHeight ?? null, fps: s.framesPerSecond ?? null,
          bytesSent: s.bytesSent, framesSent: s.framesSent, active: s.active ?? null, qlr: s.qualityLimitationReason ?? null,
          qlrDurations: s.qualityLimitationDurations ?? null, qlrResChanges: s.qualityLimitationResolutionChanges ?? null,
          encoderImplementation: s.encoderImplementation ?? null, powerEfficientEncoder: s.powerEfficientEncoder ?? null,
          scalabilityMode: s.scalabilityMode ?? null, targetBitrate: s.targetBitrate ?? null, codec: rep.get(s.codecId)?.mimeType ?? null, ts: s.timestamp });
        if (s.type === "inbound-rtp" && (s.kind === "video" || s.kind === "audio")) inn.push({
          kind: s.kind, ssrc: s.ssrc, w: s.frameWidth ?? null, h: s.frameHeight ?? null, fps: s.framesPerSecond ?? null,
          bytesReceived: s.bytesReceived, packetsLost: s.packetsLost ?? null, jitter: s.jitter ?? null,
          freezeCount: s.freezeCount ?? null, totalFreezesDuration: s.totalFreezesDuration ?? null,
          decoderImplementation: s.decoderImplementation ?? null, ts: s.timestamp });
      }
    }
    return { out, inn };
  });
}

function startCpuSampler(cond, markers, durationSec) {
  const ps1 = join(__dir, "ab-cpu-sampler.ps1");
  if (process.platform !== "win32" || !existsSync(ps1)) { log("cpu sampler skipped (not win32 or ps1 missing)"); return null; }
  const csv = join(OUT_DIR, `${cond}-cpu.csv`);
  const p = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Markers", markers.join(","), "-OutCsv", csv, "-IntervalMs", String(SAMPLE_MS), "-DurationSec", String(durationSec)], { stdio: "ignore" });
  return { p, csv };
}

async function waitConnected(page, ms = 45000) {
  await page.waitForFunction(() => { const s = document.querySelector("#status")?.textContent ?? ""; return /connected/.test(s) && !/disconnected|error/.test(s); }, null, { timeout: ms });
}

async function launch(marker) {
  const args = ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--use-fake-ui-for-media-stream", "--no-first-run"];
  if (FAKE_MEDIA) args.push("--use-fake-device-for-media-stream");
  const ctx = await chromium.launchPersistentContext(join(tmpdir(), marker), {
    ...(CHROME_PATH ? { executablePath: CHROME_PATH } : { channel: CHANNEL }),
    headless: process.env.HEADLESS === "1", acceptDownloads: true, viewport: { width: 1400, height: 900 }, args,
  });
  await ctx.grantPermissions(["camera", "microphone"], { origin: new URL(HARNESS).origin }).catch(() => {});
  await ctx.addInitScript(INIT_PC);
  return ctx;
}

const summaries = [];

for (const c of CONDS) {
  const room = `s1-${c.name}-${stamp.slice(-6)}`;
  const t = { cond: c.name, status: "pending", join_at: null, ws: null, we: null, rs: null, re: null, rec_result: "", note: "", srs: null, sre: null, sfile: "", sbytes: "" };
  if (c.rec && !s4Ok) {
    t.status = "SKIPPED"; t.note = "S4 health failed";
    appendFileSync(TIMES_CSV, row([c.name, t.status, "", "", "", "", "", "", t.note, "", "", "", ""]));
    log(`${c.name} SKIPPED (S4 health failed)`); continue;
  }
  log(`=== ${c.name} room=${room} src=${c.src} layers=${c.L} codec=${CODEC} rec=${c.rec ? "ON" : "OFF"}`);
  const pubMarker = `s1ab-pub-${c.name}-${stamp}`, subMarker = `s1ab-sub-${c.name}-${stamp}`;
  const cpu = startCpuSampler(c.name, [pubMarker, subMarker], WARMUP_S + REC_S + 60);
  let pubCtx, subCtx;
  const series = { out: [], inn: [] };
  const t0 = Date.now();
  try {
    pubCtx = await launch(pubMarker);
    const pub = pubCtx.pages()[0] ?? await pubCtx.newPage();
    const errs = [];
    pub.on("console", (m) => { if (m.type() === "error" || /hq-rec|file-publish/.test(m.text())) errs.push(`${paris()} ${m.text()}`); });
    const q = new URLSearchParams({ layers: String(c.L), mode: c.src === "cam" ? "camera" : "file", cond: c.name, s4: S4_BASE });
    if (CODEC !== "vp8") q.set("codec", CODEC);
    if (c.src === "file" && UNLOCK_FILE) q.set("unlockStats", "1");
    await pub.goto(`${HARNESS}${AB_PATH}?${q}`, { waitUntil: "load", timeout: 45000 });
    await pub.fill("#room", room); await pub.fill("#identity", "ab-pub");
    await pub.click("#join"); await waitConnected(pub);
    t.join_at = paris();
    // "connected" is set before publish; a failed getUserMedia (e.g. NotReadableError, camera held by another
    // app) must FAIL the condition instead of measuring an empty room (laptop 02:50 cam run).
    await pub.waitForFunction(() => window.__publishedStream?.getVideoTracks().length > 0 || /error|disconnected/.test(document.querySelector("#status")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
    const pubOk = await pub.evaluate(() => !!window.__publishedStream?.getVideoTracks().length);
    if (!pubOk) throw new Error(`publisher has no published video (${(errs.at(-1) ?? "no console error").slice(0, 160)})`);

    subCtx = await launch(subMarker);
    const subs = [];
    for (const [id, pin] of [["ab-sub-hi", "HIGH"], ["ab-sub-lo", "LOW"]]) {
      const pg = subs.length ? await subCtx.newPage() : (subCtx.pages()[0] ?? await subCtx.newPage());
      await pg.goto(`${HARNESS}${AB_PATH}?adaptive=0&mode=none${UNLOCK_SUBS ? "&unlockStats=1" : ""}`, { waitUntil: "load", timeout: 45000 });
      await pg.fill("#room", room); await pg.fill("#identity", id);
      await pg.selectOption("#media-mode", "none");
      await pg.click("#join"); await waitConnected(pg);
      subs.push({ id, pin, pg });
    }
    const pinAll = () => Promise.all(subs.map((s) => s.pg.evaluate((q) => window.__pinLayer?.(q) ?? -1, s.pin).catch(() => -1)));
    await sleep(3000); await pinAll();
    log(`${c.name} joined; warmup ${WARMUP_S}s`);
    await sleep(WARMUP_S * 1000);

    // ---- measurement window (= rec window) ----
    const wsMs = Date.now(); t.ws = paris(wsMs);
    const hi = subs.find((s) => s.pin === "HIGH");
    if (SUB_REC && hi) {
      const r = await hi.pg.evaluate((b) => window.__startSubRec({ vBitrate: b }), SUB_REC_BITRATE).catch((e) => ({ ok: false, error: String(e) }));
      t.srs = paris();
      writeFileSync(join(OUT_DIR, `${c.name}-sub-hi-rec-start.json`), JSON.stringify(r, null, 2));
      if (!r.ok) t.note = `subrec start: ${r.error}`;
      log(`${c.name} sub-hi rec start ${JSON.stringify(r).slice(0, 160)}`);
    }
    if (c.rec) {
      const r = await pub.evaluate((o) => window.__startHqRec(o), { cond: c.name, durationSec: REC_S });
      t.rs = paris(); t.rec_result = r.ok ? "started" : `START FAIL ${r.error}`;
      writeFileSync(join(OUT_DIR, `${c.name}-s4-start.json`), JSON.stringify(r, null, 2));
      log(`${c.name} rec start ${JSON.stringify(r).slice(0, 200)}`);
    }
    while (Date.now() - wsMs < REC_S * 1000) {
      await sleep(SAMPLE_MS);
      const tr = Math.round((Date.now() - wsMs) / 100) / 10, at = paris();
      await pinAll();
      const ps = await stats(pub).catch(() => ({ out: [] }));
      for (const o of ps.out) {
        series.out.push({ tr, ...o });
        const d = o.qlrDurations ?? {};
        appendFileSync(OUT_CSV, row([c.name, tr, at, o.rid, o.ssrc, o.w, o.h, o.fps, o.bytesSent, o.framesSent, o.active, o.qlr, d.none, d.cpu, d.bandwidth, d.other, o.qlrResChanges, o.encoderImplementation, o.powerEfficientEncoder, o.scalabilityMode, o.targetBitrate, o.codec]));
      }
      for (const s of subs) {
        const ss = await stats(s.pg).catch(() => ({ inn: [] }));
        for (const i of ss.inn) {
          series.inn.push({ tr, sub: s.id, ...i });
          appendFileSync(IN_CSV, row([c.name, tr, at, s.id, s.pin, i.kind, i.ssrc, i.w, i.h, i.fps, i.bytesReceived, i.packetsLost, i.jitter, i.freezeCount, i.totalFreezesDuration, i.decoderImplementation]));
        }
      }
    }
    if (SUB_REC && hi) {
      const fname = `${c.name}-sub-hi-rx.webm`;
      try {
        const dlP = hi.pg.waitForEvent("download", { timeout: 60000 });
        const r = await hi.pg.evaluate((f) => window.__stopSubRec(f), fname);
        t.sre = paris();
        if (r.ok) {
          const dl = await dlP;
          await dl.saveAs(join(OUT_DIR, fname));
          t.sfile = fname; t.sbytes = r.bytes;
        } else { dlP.catch(() => {}); t.note = `subrec stop: ${r.error}`; }
        log(`${c.name} sub-hi rec stop ${JSON.stringify(r)}`);
      } catch (e) { t.note = `subrec save: ${String(e?.message ?? e).split("\n")[0]}`; log(`${c.name} ${t.note}`); }
    }
    if (c.rec) {
      const r = await pub.evaluate(() => window.__stopHqRec());
      t.re = paris(); t.rec_result = r.ok ? "stopped+exported" : `STOP FAIL ${r.error}`;
      writeFileSync(join(OUT_DIR, `${c.name}-s4-results.json`), JSON.stringify(r, null, 2));
      log(`${c.name} rec stop ${r.ok ? "ok" : r.error}`);
    }
    t.we = paris();
    t.status = "DONE";
    writeFileSync(join(OUT_DIR, `${c.name}-console.json`), JSON.stringify(errs.slice(-50), null, 2));
    for (const pg of [...subs.map((s) => s.pg), pub]) await pg.click("#leave").catch(() => {});
  } catch (e) {
    t.status = "FAIL"; t.note = String(e?.message ?? e).split("\n")[0];
    log(`${c.name} FAIL ${t.note}`);
  } finally {
    const closeT = (ctx) => Promise.race([ctx?.close().catch(() => {}), sleep(15000)]);
    await closeT(subCtx);
    await closeT(pubCtx);
    try { cpu?.p.kill(); } catch {}
  }
  appendFileSync(TIMES_CSV, row([c.name, t.status, t.join_at, t.ws, t.we, t.rs, t.re, t.rec_result, t.note, t.srs, t.sre, t.sfile, t.sbytes]));

  // ---- per-condition summary (raw series stays authoritative) ----
  const rids = [...new Set(series.out.map((o) => o.rid ?? "single"))];
  const perRid = {};
  for (const rid of rids) {
    const rs = series.out.filter((o) => (o.rid ?? "single") === rid);
    const kbps = [];
    for (let i = 1; i < rs.length; i++) { const dt = (rs[i].ts - rs[i - 1].ts) / 1000; if (dt > 0) kbps.push(((rs[i].bytesSent - rs[i - 1].bytesSent) * 8) / dt / 1000); }
    const first = rs[0]?.qlrDurations, last = rs.at(-1)?.qlrDurations;
    const dDur = {};
    if (first && last) for (const k of Object.keys(last)) dDur[k] = r1(last[k] - (first[k] ?? 0));
    const qc = {}; for (const o of rs) qc[o.qlr ?? "null"] = (qc[o.qlr ?? "null"] ?? 0) + 1;
    perRid[rid] = { n: rs.length, w_med: med(rs.map((o) => o.w)), h_med: med(rs.map((o) => o.h)), fps_med: r1(med(rs.map((o) => o.fps))), kbps_med: r1(med(kbps)), qlr_counts: qc, qlrDurations_delta_s: dDur, qlrResChanges_delta: (rs.at(-1)?.qlrResChanges ?? 0) - (rs[0]?.qlrResChanges ?? 0), encoderImplementation: [...new Set(rs.map((o) => o.encoderImplementation).filter(Boolean))] };
  }
  const subSum = {};
  for (const sid of ["ab-sub-hi", "ab-sub-lo"]) {
    const v = series.inn.filter((i) => i.sub === sid && i.kind === "video");
    subSum[sid] = { n: v.length, w_med: med(v.map((i) => i.w)), h_med: med(v.map((i) => i.h)), fps_med: r1(med(v.map((i) => i.fps))), freeze_delta: v.length ? (v.at(-1).freezeCount ?? 0) - (v[0].freezeCount ?? 0) : null, decoder: [...new Set(v.map((i) => i.decoderImplementation).filter(Boolean))] };
  }
  summaries.push({ cond: c.name, status: t.status, window: [t.ws, t.we], rec: c.rec ? [t.rs, t.re, t.rec_result] : "OFF", perRid, subs: subSum, cpu_csv: cpu ? `${c.name}-cpu.csv` : "NOT CAPTURED", elapsed_s: Math.round((Date.now() - t0) / 1000) });
  writeFileSync(join(OUT_DIR, "ab-summary.json"), JSON.stringify({ preflight: pre, summaries }, null, 2));
  log(`${c.name} ${t.status} window ${t.ws} → ${t.we}`);
  await sleep(COOLDOWN_S * 1000);
}

// Markdown timestamp table for Media alignment
let md = `# S1 laptop A/B — ${paris()}\n\nHarness ${HARNESS}${AB_PATH} · codec ${CODEC} · S4 ${S4_BASE} · warmup ${WARMUP_S}s · window ${REC_S}s · sample ${SAMPLE_MS}ms\n\n| cond | status | window start (Paris) | window end (Paris) | rec start | rec stop | rec | sub-hi rx webm |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
const { readFileSync } = await import("node:fs");
for (const line of readFileSync(TIMES_CSV, "utf8").trim().split("\n").slice(1)) {
  const f = line.split(",");
  md += `| ${f[0]} | ${f[1]} | ${f[3] || "—"} | ${f[4] || "—"} | ${f[5] || "—"} | ${f[6] || "—"} | ${f[7] || (f[8] ? f[8] : "OFF")} | ${f[11] ? `${f[11]} (${f[12]} B)` : "—"} |\n`;
}
md += `\nDistinct fps (box): \`python3 /workspace/podcast-studio/tools/distinct_fps.py --threshold 0.5 --json-out r.json <cond>-sub-hi-rx.webm\`\n`;
md += `\nRaw: outbound-rid-series.csv · inbound-series.csv · <cond>-cpu.csv · <cond>-s4-results.json · ab-summary.json\n`;
writeFileSync(join(OUT_DIR, "AB-TIMESTAMPS.md"), md);
log("done", OUT_DIR);
