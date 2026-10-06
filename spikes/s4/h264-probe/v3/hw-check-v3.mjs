#!/usr/bin/env node
// H.264 HW-encode check v3 (S4). Synthetic canvas 1280x720@30 + oscillator only — never the camera.
// Launches its OWN browser (Playwright temp profile, own process tree); never attaches to / kills an existing Edge.
//
// Usage:  node hw-check-v3.mjs --pw <playwright-core dir | dir containing node_modules/playwright-core>
//                              [--out <dir>] [--channel msedge] [--secs 20] [--idle-secs 8] [--settle 1.5]
//                              [--vbps 2500000] [--headed] [--label <name>]
// Phases (in order): idle-browser (idle-secs), mr-h264, mr-vp8, ve-avc1-hw, ve-avc1-sw (secs each), 'settle' s before each.
//   mr-*  : MediaRecorder on canvas.captureStream(30) + oscillator, vbps, timeslice 1000, chunks counted then discarded in page
//   ve-*  : continuous real-time VideoEncoder avc1.42E01F 720p30 (prefer-hardware / prefer-software)
// Sampling: ONE sampler for the whole run (Windows: sample-gpu-v3.ps1 = tree CPU + all Video* and 3D GPU engines per
// LUID/engtype, formatted + raw delta; Linux/mac dry-run: /proc tree CPU only) + one nvidia-smi -l 1. A sample (covering
// the ~1 s before its arrival) is attributed to a phase if it arrives in [start+0.9 s, end+0.3 s].
// Output: <out>/hwv3-<ts>-<label>/results.json ; one compact line per phase on stdout.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const CHANNEL = opt('channel', 'msedge');
const SECS = Number(opt('secs', '20'));
const IDLE_SECS = Number(opt('idle-secs', '8'));
const SETTLE_MS = Math.round(Number(opt('settle', '1.5')) * 1000);
const VBPS = Number(opt('vbps', '2500000'));
const OUT_ROOT = opt('out', path.join(os.homedir(), 'podcast-studio', 's4-h264-probe'));
const PW = opt('pw', process.env.PW_CORE || '');
const IS_WIN = process.platform === 'win32';
const HEADED = flag('headed');
const LABEL = opt('label', HEADED ? 'headed' : 'headless');

function loadPlaywright() {
  const cands = [];
  if (PW) cands.push(PW, path.join(PW, 'node_modules', 'playwright-core'));
  cands.push('playwright-core');
  for (const c of cands) { try { return createRequire(path.join(HERE, 'x.js'))(c); } catch {} }
  throw new Error(`playwright-core not found (tried ${cands.join(' | ')}); pass --pw`);
}

const PAGE = `<!doctype html><meta charset=utf-8><title>s4-hw-check-v3</title>
<canvas id=c width=1280 height=720></canvas><script>
const c = document.getElementById('c'), g = c.getContext('2d');
window.drawn = 0;
function draw(){ const n = ++window.drawn;
  g.fillStyle = 'hsl(' + (n*3)%360 + ',60%,35%)'; g.fillRect(0,0,1280,720);
  for (let i=0;i<24;i++){ g.fillStyle = i%2?'#fff':'#000'; g.fillRect((n*8+i*60)%1280, 100+i*24, 50, 20); }
  g.fillStyle='#ff0'; g.beginPath(); g.arc(640+400*Math.sin(n/20), 360+200*Math.cos(n/27), 60, 0, 7); g.fill();
  g.fillStyle='#fff'; g.font='bold 96px monospace'; g.fillText('F ' + n, 40, 680);
  g.font='32px monospace'; g.fillText(new Date().toISOString(), 40, 60); }
setInterval(draw, 1000/30); draw();
window.mkStream = () => {
  if (window._stream) return window._stream;
  const ac = new AudioContext(); const o = ac.createOscillator(); o.frequency.value = 440;
  const gain = ac.createGain(); gain.gain.value = 0.2; const dst = ac.createMediaStreamDestination();
  o.connect(gain).connect(dst); o.start(); window._ac = ac;
  const s = c.captureStream(30); dst.stream.getAudioTracks().forEach(t => s.addTrack(t));
  return (window._stream = s);
};
</script>`;

// ---------------- samplers (whole run) ----------------
function startSampler(rootPid) {
  const samples = [];
  if (IS_WIN) {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(HERE, 'sample-gpu-v3.ps1'), '-RootPid', String(rootPid || 0)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (l.startsWith('{')) { try { samples.push({ t: Date.now(), ...JSON.parse(l) }); } catch {} } } });
    p.stderr.on('data', (d) => samples.push({ t: Date.now(), stderr: String(d).slice(0, 300) }));
    p.on('error', (e) => samples.push({ t: Date.now(), stderr: `spawn: ${e.code || e}` }));
    return { samples, stop: () => { try { p.kill(); } catch {} } };
  }
  // Linux/mac dry-run fallback: /proc tree utime+stime delta (no GPU engine data)
  const ticks = 100; let prev = null;
  const tree = () => { const kids = {}; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue;
      try { const s = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const r = s.slice(s.lastIndexOf(')') + 2).split(' ');
        kids[d] = { ppid: r[1], cpu: Number(r[11]) + Number(r[12]) }; } catch {} }
    const set = new Set([String(rootPid)]); let ch = true;
    while (ch) { ch = false; for (const [pid, v] of Object.entries(kids)) if (!set.has(pid) && set.has(v.ppid)) { set.add(pid); ch = true; } }
    let sum = 0; for (const pid of set) sum += kids[pid]?.cpu || 0; return { sum, n: set.size }; };
  const iv = setInterval(() => { const now = { t: Date.now(), ...tree() };
    if (prev) { const pct = ((now.sum - prev.sum) / ticks) / ((now.t - prev.t) / 1000) * 100;
      samples.push({ t: now.t, procs: now.n, treeCpuPctOneCore: +pct.toFixed(1), treeCpuPctMachine: +(pct / os.cpus().length).toFixed(1),
                     note: 'linux-fallback: no GPU engine data' }); }
    prev = now; }, 1000);
  return { samples, stop: () => clearInterval(iv) };
}

function startNvsmi() {
  const samples = []; let p;
  try {
    p = spawn('nvidia-smi', ['--query-gpu=name,utilization.encoder,utilization.gpu', '--format=csv,noheader,nounits', '-l', '1'],
              { stdio: ['ignore', 'pipe', 'ignore'] });
    p.on('error', (e) => samples.push({ t: Date.now(), error: String(e.code || e) }));
    p.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => {
      const [name, enc, gpu] = l.split(',').map((s) => s.trim()); samples.push({ t: Date.now(), name, enc: +enc, gpu: +gpu }); }));
  } catch (e) { samples.push({ t: Date.now(), error: String(e) }); }
  return { samples, stop: () => { try { p?.kill(); } catch {} } };
}

const stats = (arr) => { const a = arr.filter((x) => Number.isFinite(x)); if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return { n: a.length, mean: +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(1), max: s[s.length - 1], p50: s[Math.floor(s.length / 2)] }; };
const mapStats = (rows, get) => { const acc = {};
  for (const x of rows) for (const [k, v] of Object.entries(get(x) || {})) (acc[k] ||= []).push(v);
  // keys missing in some samples = 0 in that sample
  return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, stats([...a, ...Array(Math.max(0, rows.length - a.length)).fill(0)])])); };

function summarize(rows, nv) {
  const s = rows.filter((x) => !x.stderr);
  const names = {}; const treePidMax = {};
  for (const x of s) {
    for (const [k, n] of Object.entries(x.pidNames || {})) names[k] = n;
    for (const [pid, m] of Object.entries(x.tree?.perPid || {})) for (const [k, u] of Object.entries(m)) {
      treePidMax[pid] ||= {}; treePidMax[pid][k] = Math.max(treePidMax[pid][k] ?? 0, u); }
  }
  return {
    samples: s.length, stderr: rows.filter((x) => x.stderr).map((x) => x.stderr).slice(0, 3),
    treeOneCore: stats(s.map((x) => x.treeCpuPctOneCore)), treeMachine: stats(s.map((x) => x.treeCpuPctMachine)),
    systemTotal: stats(s.map((x) => x.systemCpuPct)),
    fmtPerLuidType: mapStats(s, (x) => x.fmt?.perLuidType), rawPerLuidType: mapStats(s, (x) => x.raw?.perLuidType),
    fmtPerLuidEng: mapStats(s, (x) => x.fmt?.perLuidEng), rawPerLuidEng: mapStats(s, (x) => x.raw?.perLuidEng),
    treePerLuidType: mapStats(s, (x) => x.tree?.perLuidType),
    treePerPidMax: Object.fromEntries(Object.entries(treePidMax).map(([pid, m]) => [pid, { name: names[pid]?.name ?? null, ...m }])),
    activeVideoPids: names,
    nvidia: { enc: stats(nv.map((x) => x.enc)), gpu: stats(nv.map((x) => x.gpu)),
              name: nv.find((x) => x.name)?.name ?? null, error: nv.find((x) => x.error)?.error ?? null },
  };
}

// compact line: CPU, then per LUID (last 5 hex) per engtype mean/max (raw delta; fmt in brackets), our-tree share, nvidia-smi
const short = (k) => { const [luid, typ] = k.split('|'); return `${luid.slice(-5)}:${typ.replace('Video', 'V')}`; };
const f1 = (st) => (st ? `${st.mean}/${st.max}` : '-');
function line(name, run, sum) {
  const keys = [...new Set([...Object.keys(sum.rawPerLuidType), ...Object.keys(sum.fmtPerLuidType)])].sort();
  const eng = keys.map((k) => `${short(k)} ${f1(sum.rawPerLuidType[k])}[${f1(sum.fmtPerLuidType[k])}]` +
    (sum.treePerLuidType[k]?.max > 0 ? `{tree ${f1(sum.treePerLuidType[k])}}` : '')).join(' ');
  let what = '';
  if (run.skipped) what = `SKIP(${run.skipped})`;
  else if (run.kind === 'mr') what = `mime=${run.mimeType} ${run.mbps}Mbps ch=${run.chunks} err=${run.errors.length}`;
  else if (run.kind === 've') what = `cfg=${run.supported} fr=${run.frames} ${run.mbps}Mbps q=${run.encodeQueueEnd} err=${run.errors.length}`;
  return `${name.padEnd(12)} ${what} | cpu1core ${f1(sum.treeOneCore)} sys ${f1(sum.systemTotal)} | ${eng || 'gpu:n/a'} | nvsmi enc ${f1(sum.nvidia.enc)} gpu ${f1(sum.nvidia.gpu)} | n=${sum.samples}`;
}

// ---------------- page workloads ----------------
async function mrRun(page, mime, secs, vbps) {
  return page.evaluate(async ({ mime, secs, vbps }) => {
    const out = { kind: 'mr', requested: mime, supported: MediaRecorder.isTypeSupported(mime), chunks: 0, bytes: 0, errors: [] };
    if (!out.supported) { out.skipped = 'isTypeSupported=false'; return out; }
    const s = window.mkStream(); const d0 = window.drawn;
    try {
      const rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: vbps, audioBitsPerSecond: 128000 });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) { out.chunks++; out.bytes += e.data.size; } }; // discarded
      rec.onerror = (e) => out.errors.push(String(e.error || e));
      const stopped = new Promise((r) => { rec.onstop = r; });
      const t0 = performance.now(); rec.start(1000); out.mimeType = rec.mimeType;
      await new Promise((r) => setTimeout(r, secs * 1000)); rec.stop(); await stopped;
      out.ms = Math.round(performance.now() - t0); out.mimeTypeFinal = rec.mimeType; out.mimeType = out.mimeType || rec.mimeType;
      out.mbps = +(out.bytes * 8 / (out.ms / 1000) / 1e6).toFixed(3); out.canvasFrames = window.drawn - d0;
    } catch (e) { out.errors.push(String(e)); }
    return out;
  }, { mime, secs, vbps });
}

async function veRun(page, codec, hw, secs, vbps) {
  return page.evaluate(async ({ codec, hw, secs, vbps }) => {
    const c = document.getElementById('c');
    const out = { kind: 've', codec, hw, secs, chunks: 0, key: 0, bytes: 0, frames: 0, errors: [] };
    const cfg = { codec, width: 1280, height: 720, bitrate: vbps, framerate: 30, hardwareAcceleration: hw, latencyMode: 'realtime', avc: { format: 'annexb' } };
    try { out.supported = (await VideoEncoder.isConfigSupported(cfg)).supported; } catch (e) { out.supported = `err: ${e}`; }
    if (out.supported !== true) { out.skipped = `isConfigSupported=${out.supported}`; return out; }
    const enc = new VideoEncoder({ output: (ch) => { out.chunks++; out.bytes += ch.byteLength; if (ch.type === 'key') out.key++; },
                                   error: (e) => out.errors.push(String(e)) });
    try {
      enc.configure(cfg);
      const t0 = performance.now(); let i = 0;
      while (performance.now() - t0 < secs * 1000) {
        const f = new VideoFrame(c, { timestamp: i * 33333 }); enc.encode(f, { keyFrame: i % 60 === 0 }); f.close(); i++;
        const next = t0 + i * 1000 / 30; await new Promise((r) => setTimeout(r, Math.max(0, next - performance.now())));
      }
      await enc.flush(); out.frames = i; out.ms = Math.round(performance.now() - t0); out.encodeQueueEnd = enc.encodeQueueSize; enc.close();
      out.mbps = +(out.bytes * 8 / (out.ms / 1000) / 1e6).toFixed(3);
    } catch (e) { out.errors.push(String(e)); }
    return out;
  }, { codec, hw, secs, vbps });
}

// ---------------- main ----------------
(async () => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(OUT_ROOT, `hwv3-${ts}-${LABEL}`); fs.mkdirSync(outDir, { recursive: true });
  const results = { tool: 'hw-check-v3', ts, label: LABEL, headed: HEADED, channel: CHANNEL, secs: SECS, idleSecs: IDLE_SECS,
                    settleMs: SETTLE_MS, vbps: VBPS, host: os.hostname(), platform: process.platform, outDir, phases: [] };
  const save = () => fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(PAGE); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { chromium } = loadPlaywright();
  const server = await chromium.launchServer({ channel: CHANNEL, headless: !HEADED,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
           ...(HEADED ? ['--window-position=-2400,-2400', '--window-size=400,300'] : [])] });
  const rootPid = server.process()?.pid; results.browserPid = rootPid;
  const browser = await chromium.connect(server.wsEndpoint()); results.browserVersion = browser.version();
  const sampler = startSampler(rootPid); const nv = startNvsmi();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${srv.address().port}/`);
    results.userAgent = await page.evaluate(() => navigator.userAgent);
    // wait for the sampler to produce (PowerShell start + first CIM pass), max 20 s; first sample has no deltas
    const tw = Date.now(); while (sampler.samples.filter((x) => !x.stderr).length < 2 && Date.now() - tw < 20000) await page.waitForTimeout(250);
    results.samplerReadyMs = Date.now() - tw;
    const phases = [
      ['idle-browser', async () => { await page.waitForTimeout(IDLE_SECS * 1000); return { kind: 'idle', secs: IDLE_SECS }; }],
      ['mr-h264', () => mrRun(page, 'video/webm;codecs=h264', SECS, VBPS)],
      ['mr-vp8', () => mrRun(page, 'video/webm;codecs=vp8,opus', SECS, VBPS)],
      ['ve-avc1-hw', () => veRun(page, 'avc1.42E01F', 'prefer-hardware', SECS, VBPS)],
      ['ve-avc1-sw', () => veRun(page, 'avc1.42E01F', 'prefer-software', SECS, VBPS)],
    ];
    for (const [name, fn] of phases) {
      await page.waitForTimeout(SETTLE_MS);
      const start = Date.now(); const run = await fn(); const end = Date.now();
      await page.waitForTimeout(400); // let the sample covering the phase tail arrive
      const rows = sampler.samples.filter((x) => x.t >= start + 900 && x.t <= end + 300);
      const nvRows = nv.samples.filter((x) => x.t >= start + 900 && x.t <= end + 300);
      const summary = summarize(rows, nvRows);
      results.phases.push({ name, start, end, run, summary });
      console.log(line(name, run, summary));
      save();
    }
  } finally {
    sampler.stop(); nv.stop();
    results.rawSamples = sampler.samples; results.nvSamples = nv.samples; save();
    await browser.close().catch(() => {}); await server.close().catch(() => {}); srv.close();
  }
  console.log('RESULTS', path.join(outDir, 'results.json'));
})().catch((e) => { console.error(e); process.exit(1); });
