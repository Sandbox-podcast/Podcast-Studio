#!/usr/bin/env node
// MediaRecorder H.264 probe for Edge (S4). Synthetic canvas + oscillator only — never the camera.
// Launches its OWN browser (Playwright temp profile); never attaches to / kills an existing Edge.
//
// Usage (laptop via run-probe.ps1; box dry-run with --channel chrome):
//   node probe.mjs --pw <dir containing node_modules/playwright-core | path to playwright-core>
//                  --out <dir> [--channel msedge] [--secs 15] [--vbps 2500000] [--all-h264] [--headed]
//                  [--only h264|vp8|<full mime>] [--idle-secs 10] [--label headless|headed]
// v2: 10 s idle baseline (before the browser starts) + UNFILTERED VideoEncode (all PIDs/adapters) + PID names.
// Output: <out>/run-<ts>/{results.json, rec-*.webm|mkv|mp4, gpu-page.txt}
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
const SECS = Number(opt('secs', '15'));
const VBPS = Number(opt('vbps', '2500000'));
const OUT_ROOT = opt('out', path.join(os.homedir(), 'podcast-studio', 's4-h264-probe'));
const PW = opt('pw', process.env.PW_CORE || '');
const IS_WIN = process.platform === 'win32';
const ONLY = opt('only', '');
const IDLE_SECS = Number(opt('idle-secs', '10'));
const LABEL = opt('label', flag('headed') ? 'headed' : 'headless');
const ONLY_MAP = { h264: 'video/webm;codecs=h264', vp8: 'video/webm;codecs=vp8,opus' };

function loadPlaywright() {
  const cands = [];
  if (PW) cands.push(PW, path.join(PW, 'node_modules', 'playwright-core'));
  cands.push('playwright-core');
  for (const c of cands) {
    try { return createRequire(path.join(HERE, 'x.js'))(c); } catch {}
  }
  throw new Error(`playwright-core not found (tried ${cands.join(' | ')}); pass --pw`);
}

const MIMES = [
  'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=av1',
  'video/webm;codecs=h264', 'video/webm;codecs=avc1', 'video/webm;codecs=avc1.42E01F',
  'video/webm;codecs=avc1.640028', 'video/x-matroska;codecs=avc1', 'video/mp4;codecs=avc1', 'video/mp4',
];
const isH264 = (m) => /h264|avc1/i.test(m) || m === 'video/mp4';
const ext = (m) => (m.startsWith('video/mp4') ? 'mp4' : m.startsWith('video/x-matroska') ? 'mkv' : 'webm');
const safe = (m) => m.replace(/[^a-z0-9.]+/gi, '_');

const PAGE = `<!doctype html><meta charset=utf-8><title>s4-h264-probe</title>
<canvas id=c width=1280 height=720></canvas><script>
const c = document.getElementById('c'), g = c.getContext('2d');
window.drawn = 0;
function draw(t){ const n = ++window.drawn;
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

async function inPageSupport(page) {
  return page.evaluate(async (MIMES) => {
    const mr = {}; for (const m of MIMES) mr[m] = MediaRecorder.isTypeSupported(m);
    const ve = {};
    const hasVE = typeof VideoEncoder !== 'undefined';
    for (const codec of ['avc1.42E01F', 'avc1.640028', 'vp8']) {
      for (const hw of ['prefer-hardware', 'prefer-software']) {
        const cfg = { codec, width: 1280, height: 720, bitrate: 2500000, framerate: 30, hardwareAcceleration: hw };
        try { const r = hasVE ? await VideoEncoder.isConfigSupported(cfg) : null;
          ve[codec + '|' + hw] = r ? { supported: r.supported, returned: r.config?.hardwareAcceleration } : 'no VideoEncoder';
        } catch (e) { ve[codec + '|' + hw] = { error: String(e) }; }
      }
    }
    return { ua: navigator.userAgent, secure: isSecureContext, mediaRecorder: mr, videoEncoderConfig: ve,
             cores: navigator.hardwareConcurrency };
  }, MIMES);
}

async function veRun(page, codec, hw, frames = 60) {
  return page.evaluate(async ({ codec, hw, frames }) => {
    if (typeof VideoEncoder === 'undefined') return { error: 'no VideoEncoder' };
    const c = document.getElementById('c'); const out = { codec, hw, frames, chunks: 0, key: 0, bytes: 0, errors: [] };
    const enc = new VideoEncoder({ output: (ch) => { out.chunks++; out.bytes += ch.byteLength; if (ch.type === 'key') out.key++; },
                                   error: (e) => out.errors.push(String(e)) });
    try {
      enc.configure({ codec, width: 1280, height: 720, bitrate: 2500000, framerate: 30, hardwareAcceleration: hw,
                      ...(codec.startsWith('avc1') ? { avc: { format: 'annexb' } } : {}) });
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        const f = new VideoFrame(c, { timestamp: i * 33333 }); enc.encode(f, { keyFrame: i === 0 }); f.close();
        await new Promise(r => setTimeout(r, 5));
      }
      await enc.flush(); out.ms = Math.round(performance.now() - t0); enc.close();
    } catch (e) { out.errors.push(String(e)); }
    return out;
  }, { codec, hw, frames });
}

// ---- samplers (publisher-side CPU of OUR browser tree; nvidia-smi; Windows GPU VideoEncode engine) ----
function startCpuSampler(rootPid) {
  const samples = [];
  if (IS_WIN) {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(HERE, 'sample-cpu.ps1'), '-RootPid', String(rootPid || 0)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (l.startsWith('{')) { try { samples.push({ t: Date.now(), ...JSON.parse(l) }); } catch {} } } });
    p.stderr.on('data', (d) => samples.push({ t: Date.now(), stderr: String(d).slice(0, 300) }));
    return { samples, stop: () => { try { p.kill(); } catch {} } };
  }
  // Linux/mac dry-run: /proc tree utime+stime delta
  const ticks = 100; let prev = null;
  if (!rootPid) { const iv0 = setInterval(() => samples.push({ t: Date.now(), note: 'no tree (idle baseline, non-Windows)' }), 1000);
    return { samples, stop: () => clearInterval(iv0) }; }
  const tree = () => { const kids = {}; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue;
      try { const s = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const r = s.slice(s.lastIndexOf(')') + 2).split(' ');
        kids[d] = { ppid: r[1], cpu: Number(r[11]) + Number(r[12]) }; } catch {} }
    const set = new Set([String(rootPid)]); let ch = true;
    while (ch) { ch = false; for (const [pid, v] of Object.entries(kids)) if (!set.has(pid) && set.has(v.ppid)) { set.add(pid); ch = true; } }
    let sum = 0; for (const pid of set) sum += kids[pid]?.cpu || 0; return { sum, n: set.size }; };
  const iv = setInterval(() => { const now = { t: Date.now(), ...tree() };
    if (prev) { const pct = ((now.sum - prev.sum) / ticks) / ((now.t - prev.t) / 1000) * 100;
      samples.push({ t: now.t, procs: now.n, treeCpuPctOneCore: +pct.toFixed(1), treeCpuPctMachine: +(pct / os.cpus().length).toFixed(1) }); }
    prev = now; }, 1000);
  return { samples, stop: () => clearInterval(iv) };
}

function startNvsmi() {
  const samples = []; let p;
  try {
    p = spawn('nvidia-smi', ['--query-gpu=name,utilization.encoder,utilization.gpu', '--format=csv,noheader,nounits', '-l', '1'],
              { stdio: ['ignore', 'pipe', 'ignore'] });
    p.on('error', (e) => samples.push({ error: String(e.code || e) }));
    p.stdout.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => {
      const [name, enc, gpu] = l.split(',').map((s) => s.trim()); samples.push({ t: Date.now(), name, enc: +enc, gpu: +gpu }); }));
  } catch (e) { samples.push({ error: String(e) }); }
  return { samples, stop: () => { try { p?.kill(); } catch {} } };
}

const stats = (arr) => { const a = arr.filter((x) => Number.isFinite(x)); if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y); return { n: a.length, mean: +(a.reduce((p, c) => p + c, 0) / a.length).toFixed(1),
  max: s[s.length - 1], p50: s[Math.floor(s.length / 2)] }; };

// Summarize one phase: CPU, our-tree VideoEncode, UNFILTERED VideoEncode (all PIDs / adapters), nvidia-smi.
function summarize(cpuSamples, nvSamples) {
  const s = cpuSamples.filter((x) => !x.stderr && !x.note);
  const perLuid = {}, perPidFmt = {}, perPidRaw = {}, names = {};
  for (const x of s) {
    const v = x.vencAll || {};
    for (const [k, u] of Object.entries(v.fmtPerLuid || {})) (perLuid[k] ||= []).push(u);
    for (const [k, u] of Object.entries(v.fmtPerPid || {})) perPidFmt[k] = Math.max(perPidFmt[k] ?? 0, u);
    for (const [k, u] of Object.entries(v.rawPerPid || {})) perPidRaw[k] = Math.max(perPidRaw[k] ?? 0, u);
    for (const [k, n] of Object.entries(x.pidNames || {})) names[k] = n;
  }
  const activePids = [...new Set([...Object.keys(perPidFmt), ...Object.keys(perPidRaw)])]
    .filter((k) => (perPidFmt[k] ?? 0) > 0 || (perPidRaw[k] ?? 0) > 0.5)
    .map((k) => ({ pid: +k, name: names[k]?.name ?? null, inOurTree: names[k]?.inTree ?? null,
                   maxFmt: perPidFmt[k] ?? null, maxRaw: perPidRaw[k] != null ? +perPidRaw[k].toFixed(1) : null }))
    .sort((a, b) => (b.maxFmt ?? 0) - (a.maxFmt ?? 0));
  return {
    samples: cpuSamples.length,
    treeOneCore: stats(s.map((x) => x.treeCpuPctOneCore)), treeMachine: stats(s.map((x) => x.treeCpuPctMachine)),
    systemTotal: stats(s.map((x) => x.systemCpuPct)), gpuVideoEncodeTree: stats(s.map((x) => x.gpuVideoEncodePct)),
    vencAll: { fmtSum: stats(s.map((x) => x.vencAll?.fmtSum)), rawSum: stats(s.map((x) => x.vencAll?.rawSum)),
               perLuid: Object.fromEntries(Object.entries(perLuid).map(([k, a]) => [k, stats(a)])), activePids },
    nvidia: { enc: stats(nvSamples.map((x) => x.enc)), gpu: stats(nvSamples.map((x) => x.gpu)),
              name: nvSamples.find((x) => x.name)?.name ?? null, error: nvSamples.find((x) => x.error)?.error ?? null },
  };
}

async function record(page, mime, secs, vbps, file) {
  const fd = fs.openSync(file, 'w');
  const name = 'saveChunk_' + Math.random().toString(36).slice(2, 8);
  const chunkLog = [];
  await page.exposeFunction(name, (b64) => { const b = Buffer.from(b64, 'base64'); fs.writeSync(fd, b); chunkLog.push({ t: Date.now(), bytes: b.length }); });
  const r = await page.evaluate(async ({ mime, secs, vbps, name }) => {
    const s = window.mkStream(); const res = { requested: mime, errors: [] };
    let rec;
    try { rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: vbps, audioBitsPerSecond: 128000 }); }
    catch (e) { return { ...res, errors: [String(e)] }; }
    const pend = [];
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) pend.push(ev.data.arrayBuffer().then((ab) => {
      let bin = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return window[name](btoa(bin)); })); };
    rec.onerror = (e) => res.errors.push(String(e.error || e));
    const d0 = window.drawn; const t0 = performance.now();
    rec.start(1000);
    await new Promise((r) => setTimeout(r, 300)); res.mimeTypeAfterStart = rec.mimeType;
    await new Promise((r) => setTimeout(r, secs * 1000 - 300));
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    await Promise.all(pend);
    res.mimeTypeFinal = rec.mimeType; res.state = rec.state; res.elapsedMs = Math.round(performance.now() - t0);
    res.canvasFramesDrawn = window.drawn - d0; res.videoBitsPerSecond = rec.videoBitsPerSecond;
    return res;
  }, { mime, secs, vbps, name });
  fs.closeSync(fd);
  const bytes = fs.statSync(file).size;
  return { ...r, file: path.basename(file), bytes, chunks: chunkLog.length,
           measuredMbps: r.elapsedMs ? +(bytes * 8 / (r.elapsedMs / 1000) / 1e6).toFixed(3) : null };
}

(async () => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(OUT_ROOT, `run-${ts}-${LABEL}`); fs.mkdirSync(outDir, { recursive: true });
  const results = { ts, label: LABEL, headed: flag('headed'), only: ONLY || null, idleSecs: IDLE_SECS,
                    host: os.hostname(), platform: process.platform, channel: CHANNEL, secs: SECS, vbps: VBPS,
                    outDir, recordings: [], veRuns: [], notes: [] };
  const save = () => fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  const srv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(PAGE); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/`; // localhost = secure context (VideoEncoder)
  const { chromium } = loadPlaywright();
  if (IDLE_SECS > 0) { // idle baseline BEFORE our browser exists (noise floor incl. other apps' encoders)
    console.log(`idle baseline ${IDLE_SECS}s …`);
    const cpu0 = startCpuSampler(0), nv0 = startNvsmi();
    await new Promise((r) => setTimeout(r, IDLE_SECS * 1000));
    cpu0.stop(); nv0.stop();
    results.idleBaseline = { secs: IDLE_SECS, ...summarize(cpu0.samples, nv0.samples), rawSamples: cpu0.samples, nvSamples: nv0.samples };
    console.log('idle', JSON.stringify({ sys: results.idleBaseline.systemTotal, vencAllFmt: results.idleBaseline.vencAll.fmtSum,
      active: results.idleBaseline.vencAll.activePids, nvEnc: results.idleBaseline.nvidia.enc }));
    save();
  }
  // chromium.launch() uses a fresh temporary profile dir and its own process — never the user's Edge.
  // launchServer: own browser process + fresh temp profile; never the user's Edge. Gives us the root PID.
  const server = await chromium.launchServer({ channel: CHANNEL, headless: !flag('headed'),
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
           '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
           ...(flag('headed') ? ['--window-position=-2400,-2400', '--window-size=400,300'] : [])] });
  const rootPid = server.process()?.pid; results.browserPid = rootPid;
  const browser = await chromium.connect(server.wsEndpoint()); results.browserVersion = browser.version();
  try {
    const ctx = await browser.newContext({ permissions: [] });
    const page = await ctx.newPage();
    // best-effort GPU/video-acceleration report
    try { const gp = await ctx.newPage(); await gp.goto(CHANNEL === 'msedge' ? 'edge://gpu' : 'chrome://gpu'); await gp.waitForTimeout(2500);
      const txt = await gp.evaluate(() => { const el = document.querySelector('info-view') || document.body;
        return (el.shadowRoot ? el.shadowRoot.textContent : el.innerText) || ''; });
      fs.writeFileSync(path.join(outDir, 'gpu-page.txt'), txt);
      results.gpuVideoAccel = txt.split(/\n/).map((l) => l.trim()).filter((l) => /encode|h264|vp8|Video Acceleration/i.test(l)).slice(0, 40);
      await gp.close(); } catch (e) { results.notes.push('gpu page: ' + e.message); }
    await page.goto(url); await page.waitForTimeout(500);
    results.support = await inPageSupport(page); save();
    console.log('UA', results.support.ua); console.log('MediaRecorder', JSON.stringify(results.support.mediaRecorder, null, 1));
    console.log('VideoEncoder', JSON.stringify(results.support.videoEncoderConfig));
    for (const [codec, hw] of [['avc1.42E01F', 'prefer-hardware'], ['avc1.42E01F', 'prefer-software'], ['vp8', 'prefer-hardware']]) {
      const r = await veRun(page, codec, hw); results.veRuns.push(r); console.log('VE run', JSON.stringify(r));
    }
    save();
    await page.evaluate(() => window.mkStream());
    const sup = MIMES.filter((m) => results.support.mediaRecorder[m]);
    let h264 = sup.filter(isH264);
    if (!flag('all-h264')) { const seen = new Set(); h264 = h264.filter((m) => { const k = ext(m); if (seen.has(k)) return false; seen.add(k); return true; }); }
    const plan = ONLY ? [ONLY_MAP[ONLY] || ONLY] : ['video/webm;codecs=vp8,opus', ...h264];
    if (ONLY && !results.support.mediaRecorder[plan[0]] && !MIMES.includes(plan[0])) results.notes.push(`--only ${plan[0]} not in probe list`);
    results.plan = plan; console.log('plan', plan);
    for (const mime of plan) {
      const file = path.join(outDir, `rec-${safe(mime)}.${ext(mime)}`);
      const cpu = startCpuSampler(rootPid); const nv = startNvsmi();
      const t0 = Date.now(); let r;
      try { r = await record(page, mime, SECS, VBPS, file); } catch (e) { r = { requested: mime, errors: [String(e)] }; }
      cpu.stop(); nv.stop();
      r.window = { t0, t1: Date.now() };
      // name file by the ACTUAL container (e.g. webm;codecs=h264 may yield video/x-matroska)
      if (r.mimeTypeFinal && r.file) { const real = ext(r.mimeTypeFinal);
        if (real !== ext(mime)) { const nf = file.replace(/\.[a-z0-9]+$/, '') + '.actual.' + real; fs.renameSync(file, nf); r.file = path.basename(nf); } }
      const sm = summarize(cpu.samples, nv.samples);
      r.cpu = { samples: cpu.samples, treeOneCore: sm.treeOneCore, treeMachine: sm.treeMachine, systemTotal: sm.systemTotal,
                gpuVideoEncodeTree: sm.gpuVideoEncodeTree };
      r.vencAll = sm.vencAll;                       // unfiltered, all PIDs/adapters
      r.videoEncodePids = sm.vencAll.activePids;    // [{pid,name,inOurTree,maxFmt,maxRaw}]
      r.nvidiaSmi = { samples: nv.samples, enc: sm.nvidia.enc, gpu: sm.nvidia.gpu, name: sm.nvidia.name, error: sm.nvidia.error };
      results.recordings.push(r); save();
      console.log(`rec ${mime} -> ${r.mimeTypeFinal} ${r.bytes}B ${r.measuredMbps}Mbps chunks=${r.chunks} cpu(1core)=${JSON.stringify(r.cpu.treeOneCore)} nv.enc=${JSON.stringify(r.nvidiaSmi.enc)} vencAll=${JSON.stringify(r.vencAll.fmtSum)} pids=${JSON.stringify(r.videoEncodePids)} errs=${JSON.stringify(r.errors)}`);
    }
  } finally {
    try { await browser.close(); } catch {} await server.close(); srv.close(); save();
    console.log('RESULTS', path.join(outDir, 'results.json'));
  }
})().catch((e) => { console.error(e); process.exit(1); });
