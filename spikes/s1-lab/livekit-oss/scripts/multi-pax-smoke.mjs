#!/usr/bin/env node
// S1 multi-participant smoke — LiveKit OSS self-host (localhost, canvas synthetic publish).
// Opens N isolated browser contexts on the harness, joins room in canvas mode,
// holds, samples #status + #stats-table every SAMPLE_MS, leaves cleanly, writes JSON + MD.
//
// Env: HARNESS_URL (http://127.0.0.1:5190) ROOM (s1-lab) N (5) HOLD_S (50) SAMPLE_MS (5000)
//      HEADLESS (1) CHROME (/usr/bin/google-chrome) PW_CORE (path to playwright-core index.mjs)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const PW_CORE = process.env.PW_CORE ?? "/workspace/tools/pw/node_modules/playwright-core/index.mjs";
let chromium;
try { ({ chromium } = await import(PW_CORE)); } catch { ({ chromium } = await import("playwright-core")); }

const HARNESS_URL = process.env.HARNESS_URL ?? "http://127.0.0.1:5190";
const ROOM = process.env.ROOM ?? "s1-lab";
const N = Number(process.env.N ?? 5);
const HOLD_S = Number(process.env.HOLD_S ?? 50);
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 5000);
const HEADLESS = process.env.HEADLESS !== "0";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";
const OUT_JSON = join(__dir, "multi-pax-results.json");
const OUT_MD = join(__dir, "multi-pax-results.md");

const parisNow = () =>
  new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).replace(" ", "T") + " Europe/Paris";

const COLS = ["participant", "track", "dir", "bitrate", "loss", "jitter", "rtt", "resolution", "fps"];

async function scrape(page) {
  return page.evaluate((cols) => {
    const status = document.querySelector("#status")?.textContent?.trim() ?? null;
    const rows = [...document.querySelectorAll("#stats-table tbody tr")].map((tr) => {
      const tds = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
      return Object.fromEntries(cols.map((c, i) => [c, tds[i] ?? null]));
    });
    const remoteTiles = [...document.querySelectorAll("#remote-tiles .tile .label")].map((l) => l.textContent);
    return { status, rows, remoteTiles };
  }, COLS);
}

// Raw getStats across all PCs: every outbound-rtp video layer (simulcast rid) + selected candidate-pair RTT.
async function rawStats(page) {
  return page.evaluate(async () => {
    const out = [], pairs = []; let inVideo = 0;
    for (const pc of window.__pcs ?? []) {
      if (pc.connectionState === "closed") continue;
      const rep = await pc.getStats();
      for (const s of rep.values()) {
        if (s.type === "outbound-rtp" && s.kind === "video")
          out.push({ rid: s.rid ?? null, bytesSent: s.bytesSent, framesSent: s.framesSent, w: s.frameWidth ?? null, h: s.frameHeight ?? null,
                     fps: s.framesPerSecond ?? null, active: s.active ?? null, qlr: s.qualityLimitationReason ?? null, ts: s.timestamp });
        if (s.type === "inbound-rtp" && s.kind === "video") inVideo++;
        if (s.type === "candidate-pair" && s.nominated && s.currentRoundTripTime != null)
          pairs.push({ rtt_ms: s.currentRoundTripTime * 1000, state: s.state });
      }
    }
    return { pcs: (window.__pcs ?? []).length, out, inVideo, pairs };
  });
}

const startedAt = parisNow();
const t0 = Date.now();
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: HEADLESS,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--use-fake-ui-for-media-stream",
  ],
});

const pax = [];
for (let i = 1; i <= N; i++) {
  const identity = `mp-${i}`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    const Orig = window.RTCPeerConnection; window.__pcs = [];
    window.RTCPeerConnection = function (...a) { const pc = new Orig(...a); window.__pcs.push(pc); return pc; };
    window.RTCPeerConnection.prototype = Orig.prototype;
    Object.setPrototypeOf(window.RTCPeerConnection, Orig);
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  pax.push({ identity, context, page, consoleErrors, joinMs: null, joinError: null, samples: [] });
}

// Join all (staggered slightly so the SFU sees sequential arrivals).
await Promise.all(
  pax.map(async (p, idx) => {
    await new Promise((r) => setTimeout(r, idx * 500));
    const tJ = Date.now();
    try {
      await p.page.goto(HARNESS_URL, { waitUntil: "load", timeout: 30000 });
      await p.page.fill("#room", ROOM);
      await p.page.fill("#identity", p.identity);
      await p.page.selectOption("#media-mode", "canvas");
      await p.page.click("#join");
      await p.page.waitForFunction(
        () => /connected/.test(document.querySelector("#status")?.textContent ?? "") &&
              !/disconnected/.test(document.querySelector("#status")?.textContent ?? ""),
        null,
        { timeout: 30000 },
      );
      p.joinMs = Date.now() - tJ;
    } catch (e) {
      p.joinError = String(e?.message ?? e).split("\n")[0];
      try { p.statusAtFail = await p.page.textContent("#status"); } catch {}
    }
    console.log(`[${p.identity}] join ${p.joinError ? "FAIL " + p.joinError : "ok in " + p.joinMs + "ms"}`);
  }),
);

// Hold and sample.
const holdEnd = Date.now() + HOLD_S * 1000;
while (Date.now() < holdEnd) {
  await new Promise((r) => setTimeout(r, SAMPLE_MS));
  const tRel = Math.round((Date.now() - t0) / 1000);
  await Promise.all(pax.map(async (p) => {
    try { p.samples.push({ t_s: tRel, ...(await scrape(p.page)), raw: await rawStats(p.page) }); }
    catch (e) { p.samples.push({ t_s: tRel, error: String(e.message ?? e) }); }
  }));
  const summary = pax.map((p) => `${p.identity}:${p.samples.at(-1)?.rows?.length ?? "?"}r`).join(" ");
  console.log(`t=${tRel}s rows ${summary}`);
}

// Leave cleanly.
for (const p of pax) {
  try {
    if (await p.page.isEnabled("#leave")) {
      await p.page.click("#leave");
      await p.page.waitForFunction(() => document.querySelector("#status")?.textContent?.trim() === "disconnected", null, { timeout: 10000 });
      p.leftCleanly = true;
    } else p.leftCleanly = false;
  } catch (e) { p.leftCleanly = false; p.leaveError = String(e.message ?? e).split("\n")[0]; }
  await p.context.close();
}
await browser.close();
const endedAt = parisNow();

// ---------- analysis ----------
const num = (s) => { if (s == null) return null; const m = String(s).match(/-?[\d.]+/); return m ? Number(m[0]) : null; };
const kbps = (s) => { if (!s || s === "—") return null; const v = num(s); if (v == null) return null;
  return /Mbps/.test(s) ? v * 1000 : /Kbps/.test(s) ? v : v / 1000; };
const stat = (arr) => { const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null; const mid = Math.floor(a.length / 2);
  return { n: a.length, min: a[0], median: a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2, max: a.at(-1) }; };

function rawOut(p) {
  const layers = {}; // rid -> [{t,bytes,w,h,fps,qlr,active}]
  for (const s of p.samples) for (const o of s.raw?.out ?? []) (layers[o.rid ?? "single"] ??= []).push(o);
  const res = {};
  for (const [rid, arr] of Object.entries(layers)) {
    const kb = [];
    for (let i = 1; i < arr.length; i++) { const dt = (arr[i].ts - arr[i - 1].ts) / 1000; if (dt > 0) kb.push((8 * (arr[i].bytesSent - arr[i - 1].bytesSent)) / dt / 1000); }
    const last = arr.at(-1);
    res[rid] = { bitrate_kbps: stat(kb.map((x) => +x.toFixed(1))), fps: stat(arr.map((o) => o.fps)), lastRes: last.w ? `${last.w}x${last.h}` : null,
                 lastActive: last.active, qualityLimitation: [...new Set(arr.map((o) => o.qlr))] };
  }
  return res;
}
const perPax = pax.map((p) => {
  const valid = p.samples.filter((s) => s.rows);
  const last = valid.at(-1) ?? null;
  const allRows = valid.flatMap((s) => s.rows);
  const outVid = allRows.filter((r) => r.dir === "out" && r.track === "video");
  const inVid = allRows.filter((r) => r.dir === "in" && r.track === "video");
  const remoteIds = [...new Set(inVid.map((r) => r.participant))].sort();
  const connected = !p.joinError;
  const sawOut = outVid.length > 0;
  const sawIn = inVid.length > 0;
  return {
    identity: p.identity, connected, joinMs: p.joinMs, joinError: p.joinError, statusAtFail: p.statusAtFail ?? null,
    finalStatus: last?.status ?? null, leftCleanly: !!p.leftCleanly, leaveError: p.leaveError ?? null,
    sawOutboundVideo: sawOut, sawInboundVideo: sawIn, remotesSeen: remoteIds,
    lastRemoteTiles: last?.remoteTiles ?? [], lastRows: last?.rows ?? [],
    out: { rtt_ms: stat(outVid.map((r) => num(r.rtt))), bitrate_kbps: stat(outVid.map((r) => kbps(r.bitrate))), fps: stat(outVid.map((r) => num(r.fps))) },
    in: { rtt_ms: stat(inVid.map((r) => num(r.rtt))), bitrate_kbps: stat(inVid.map((r) => kbps(r.bitrate))), loss_pct: stat(inVid.map((r) => num(r.loss))),
          jitter_ms: stat(inVid.map((r) => num(r.jitter))), fps: stat(inVid.map((r) => num(r.fps))),
          resolutions: [...new Set(inVid.map((r) => r.resolution))] },
    rawOutboundLayers: rawOut(p),
    rawPairRtt_ms: stat(p.samples.flatMap((s) => (s.raw?.pairs ?? []).map((x) => x.rtt_ms))),
    consoleErrors: [...new Set(p.consoleErrors)].slice(0, 20),
    samples: p.samples,
  };
});

const allOut = perPax.flatMap((p) => p.samples.flatMap((s) => (s.rows ?? []).filter((r) => r.dir === "out" && r.track === "video")));
const allIn = perPax.flatMap((p) => p.samples.flatMap((s) => (s.rows ?? []).filter((r) => r.dir === "in" && r.track === "video")));
const nConnected = perPax.filter((p) => p.connected).length;
const nMedia = perPax.filter((p) => p.sawOutboundVideo || p.sawInboundVideo).length;
const pass = nConnected === N && nMedia === N;

const aggregate = {
  out_video: { rows: allOut.length, rtt_ms: stat(allOut.map((r) => num(r.rtt))), bitrate_kbps: stat(allOut.map((r) => kbps(r.bitrate))),
               fps: stat(allOut.map((r) => num(r.fps))), resolutions: [...new Set(allOut.map((r) => r.resolution))] },
  in_video: { rows: allIn.length, rtt_ms: stat(allIn.map((r) => num(r.rtt))), bitrate_kbps: stat(allIn.map((r) => kbps(r.bitrate))),
              loss_pct: stat(allIn.map((r) => num(r.loss))), jitter_ms: stat(allIn.map((r) => num(r.jitter))),
              fps: stat(allIn.map((r) => num(r.fps))), resolutions: [...new Set(allIn.map((r) => r.resolution))] },
};

const extraRemotes = [...new Set(perPax.flatMap((p) => p.remotesSeen).filter((id) => !/^mp-\d+$/.test(id)))];
const result = {
  test: "S1 multi-pax smoke — LiveKit OSS self-host", startedAt, endedAt,
  config: { HARNESS_URL, ROOM, N, HOLD_S, SAMPLE_MS, HEADLESS, CHROME, publishMode: "canvas" },
  verdict: pass ? "PASS" : "FAIL",
  criteria: { allConnected: `${nConnected}/${N}`, eachSawVideoOutOrIn: `${nMedia}/${N}` },
  aggregate,
  caveats: ["localhost only (browser + SFU on same box)", "canvas CaptureStream synthetic video @15fps, no audio", "not 5 real cams", "not LAN / multi-machine", "headless Chrome in one process; stats scraped from harness table (polled 2s)",
    ...(extraRemotes.length ? [`room was shared: non-script participant(s) also present: ${extraRemotes.join(", ")}`] : [])],
  participants: perPax,
};
writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));

const f = (s, u = "") => (s ? `${s.min} / ${+s.median.toFixed(2)} / ${s.max}${u} (n=${s.n})` : "—");
const md = `# S1 multi-pax smoke — LiveKit OSS (localhost)

- **Verdict: ${result.verdict}** — connected ${nConnected}/${N} · saw ≥1 out or in video ${nMedia}/${N}
- Run: ${startedAt} → ${endedAt}
- Config: room \`${ROOM}\` · ${N} isolated contexts · publish mode \`canvas\` · hold ${HOLD_S}s · sample every ${SAMPLE_MS / 1000}s · headless=${HEADLESS} · Chrome \`${CHROME}\`
- Script: \`scripts/multi-pax-smoke.mjs\` · raw: \`scripts/multi-pax-results.json\`

## Criteria (connectivity only — no perf thresholds invented)
1. All ${N} participants reach status \`connected\` within 30s → **${nConnected}/${N}**
2. Each participant shows ≥1 outbound video row OR ≥1 remote inbound video row → **${nMedia}/${N}**

## Per participant
| id | join (ms) | final status | out video | remotes seen (in video) | out RTT ms min/med/max | in bitrate kbps min/med/max | left cleanly |
|---|---|---|---|---|---|---|---|
${perPax.map((p) => `| ${p.identity} | ${p.joinMs ?? "FAIL: " + p.joinError} | ${p.finalStatus ?? "—"} | ${p.sawOutboundVideo ? "yes" : "no"} | ${p.remotesSeen.length} (${p.remotesSeen.join(", ") || "—"}) | ${f(p.out.rtt_ms)} | ${f(p.in.bitrate_kbps)} | ${p.leftCleanly ? "yes" : "no"} |`).join("\n")}

## Aggregate getStats samples (min / median / max, all sampled rows)
| metric | outbound video | inbound video |
|---|---|---|
| rows sampled | ${aggregate.out_video.rows} | ${aggregate.in_video.rows} |
| RTT (ms) | ${f(aggregate.out_video.rtt_ms)} | ${f(aggregate.in_video.rtt_ms)} |
| bitrate (kbps) | ${f(aggregate.out_video.bitrate_kbps)} | ${f(aggregate.in_video.bitrate_kbps)} |
| loss (%) | n/a | ${f(aggregate.in_video.loss_pct)} |
| jitter (ms) | n/a | ${f(aggregate.in_video.jitter_ms)} |
| fps | ${f(aggregate.out_video.fps)} | ${f(aggregate.in_video.fps)} |
| resolutions | ${aggregate.out_video.resolutions.join(", ") || "—"} | ${aggregate.in_video.resolutions.join(", ") || "—"} |

## Raw outbound simulcast layers (script-side RTCPeerConnection getStats, harness untouched)
The harness table shows only the *first* outbound-rtp layer; with dynacast, unsubscribed layers pause → "0 bps" there is not a publish failure.
| id | layer | bitrate kbps min/med/max | fps min/med/max | last res | active | qualityLimitation |
|---|---|---|---|---|---|---|
${perPax.flatMap((p) => Object.entries(p.rawOutboundLayers).map(([rid, l]) => `| ${p.identity} | ${rid} | ${f(l.bitrate_kbps)} | ${f(l.fps)} | ${l.lastRes ?? "—"} | ${l.lastActive} | ${l.qualityLimitation.join(",")} |`)).join("\n")}

Raw ICE RTT (nominated pairs, all PCs) per pax: ${perPax.map((p) => `${p.identity} ${f(p.rawPairRtt_ms)}`).join(" · ")}

## Caveats
${result.caveats.map((c) => `- ${c}`).join("\n")}
- Harness RTT = ICE candidate-pair currentRoundTripTime (browser↔SFU), ~loopback here; says nothing about WAN.
- Bitrate column is the harness's 2s delta; first poll per track is "—" and excluded.
`;
writeFileSync(OUT_MD, md);
console.log(`\nVERDICT ${result.verdict} connected ${nConnected}/${N} media ${nMedia}/${N}`);
console.log(JSON.stringify(aggregate, null, 2));
console.log(`wrote ${OUT_JSON}\nwrote ${OUT_MD}`);
process.exit(pass ? 0 : 1);
