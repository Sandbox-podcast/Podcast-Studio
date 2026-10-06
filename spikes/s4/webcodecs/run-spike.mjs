/**
 * Runner: starts server.mjs (:3330), launches a browser (system Chrome or Playwright Chromium), records,
 * samples CPU of the browser process tree, downloads the completed object, sha256 + ffprobe + seek tests.
 * Usage: node run-spike.mjs [--browser chrome|chromium] [--duration 60] [--prefer avc|vp9] [--tag name]
 * Label: localhost / headless / synthetic.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { loadMinioEnv } from './load-env.mjs';
import { analyze } from './analyze.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const BROWSER = arg('browser', 'chrome'), DURATION = Number(arg('duration', 60)), PREFER = arg('prefer', null), TAG = arg('tag', BROWSER), MARKER = process.argv.includes('--marker');
const PORT = 3330;
const cfg = loadMinioEnv();
const s3 = new S3Client({ region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true, credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } });

// ---- CPU sampling of all descendants of this runner whose comm looks like chrome ----
const CLK = Number(execFileSync('getconf', ['CLK_TCK']).toString().trim());
function procTree() {
  const out = {};
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const r = st.slice(st.lastIndexOf(')') + 2).split(' ');
      const comm = st.slice(st.indexOf('(') + 1, st.lastIndexOf(')'));
      out[d] = { pid: +d, comm, ppid: +r[1], ticks: +r[11] + +r[12] };
    } catch (_) {}
  }
  return out;
}
function browserProcs() {
  const all = procTree(); const mine = new Set([process.pid]); let grew = true;
  while (grew) { grew = false; for (const p of Object.values(all)) if (!mine.has(p.pid) && mine.has(p.ppid)) { mine.add(p.pid); grew = true; } }
  const res = {};
  for (const pid of mine) { const p = all[pid]; if (p && /chrom|headless/i.test(p.comm)) {
    let type = 'browser'; try { const cl = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8'); const m = cl.match(/--type=([a-z-]+)/); if (m) type = m[1] + (cl.includes('--utility-sub-type=') ? ':' + cl.match(/--utility-sub-type=([^\s\0]+)/)[1].split('.').pop() : ''); } catch (_) {}
    res[pid] = { ...p, type }; } }
  return res;
}

const server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, SPIKE_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok) => server.stdout.on('data', (d) => { if (String(d).includes('spike-server-up')) ok(); }));
const consoleLines = [];
let browser;
const result = { label: 'localhost / headless / synthetic', browserName: BROWSER, tag: TAG, startedAt: new Date().toISOString() };
try {
  browser = await chromium.launch({
    headless: true, ...(BROWSER === 'chrome' ? { channel: 'chrome' } : {}),
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  result.browserVersion = browser.version();
  const page = await browser.newPage();
  page.on('console', (m) => { const t = m.text(); consoleLines.push(`${new Date().toISOString()} ${m.type()} ${t}`); if (t.startsWith('[s4wc]')) console.log(t.slice(0, 300)); });
  page.on('pageerror', (e) => consoleLines.push('PAGEERROR ' + e));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  const filename = `wc-${TAG}-${Date.now()}.mp4`;
  const recP = page.evaluate((o) => window.__s4wc.record(o), { durationSec: DURATION, prefer: PREFER, marker: MARKER, filename });
  await page.waitForFunction(() => window.__s4wc.status === 'recording', null, { timeout: 30000 });
  // CPU window = recording window only
  const c0 = browserProcs(); const w0 = performance.now();
  const cpuSeries = [];
  const iv = setInterval(() => { const c = browserProcs(); let t = 0; for (const p of Object.values(c)) t += p.ticks; cpuSeries.push({ t: +((performance.now() - w0) / 1000).toFixed(1), ticks: t }); }, 5000);
  await page.waitForFunction(() => window.__s4wc.status !== 'recording', null, { timeout: (DURATION + 60) * 1000, polling: 250 });
  clearInterval(iv);
  const c1 = browserProcs(); const wallS = (performance.now() - w0) / 1000;
  const perType = {};
  for (const [pid, p] of Object.entries(c1)) { const d = (p.ticks - (c0[pid]?.ticks ?? 0)) / CLK; perType[p.type] = (perType[p.type] || 0) + d; }
  result.cpu = {
    windowSec: +wallS.toFixed(1), nproc: Number(execFileSync('nproc').toString().trim()),
    totalPctOfOneCore: +(Object.values(perType).reduce((a, b) => a + b, 0) / wallS * 100).toFixed(1),
    perTypePctOfOneCore: Object.fromEntries(Object.entries(perType).map(([k, v]) => [k, +(v / wallS * 100).toFixed(1)])),
    loadavgAtEnd: fs.readFileSync('/proc/loadavg', 'utf8').trim(),
  };
  const rec = await recP;
  result.recording = rec;
  // player-level check (browser decodes the object straight from MinIO via presigned GET, range requests)
  const { url } = await (await fetch(`http://127.0.0.1:${PORT}/api/presign-get?key=${encodeURIComponent(rec.key)}`)).json();
  result.playerCheck = await page.evaluate((u) => window.__s4wc.playerCheck(u, 30), url);
  await browser.close(); browser = null;

  // ---- download remote, sha256 ----
  const obj = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: rec.key }));
  const remote = Buffer.from(await obj.Body.transformToByteArray());
  const remotePath = `artifacts/${filename.replace('.mp4', '-remote.mp4')}`; fs.writeFileSync(remotePath, remote);
  const localPath = `artifacts/${filename.replace('.mp4', '-local.mp4')}`;
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  result.integrity = { remoteBytes: remote.length, localBytes: fs.statSync(localPath).size, remoteSha256: sha(remote), localSha256File: sha(fs.readFileSync(localPath)), pageSha256: rec.localSha256 };
  result.integrity.match = result.integrity.remoteSha256 === result.integrity.localSha256File && result.integrity.localSha256File === rec.localSha256;

  // ---- ffprobe / ffmpeg (see analyze.mjs) ----
  result.ffprobe = analyze(remotePath, TAG);
} catch (e) {
  result.error = String(e.stack || e); console.error(e);
} finally {
  if (browser) await browser.close().catch(() => {});
  // abort any incomplete MPU left under our prefix
  const inc = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
  for (const u of inc.Uploads || []) await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: u.Key, UploadId: u.UploadId }));
  const inc2 = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
  result.cleanup = { abortedIncomplete: (inc.Uploads || []).length, remainingIncomplete: (inc2.Uploads || []).length };
  server.kill('SIGTERM');
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(`out/${TAG}-results.json`, JSON.stringify(result, null, 2));
  fs.writeFileSync(`out/${TAG}-console.log`, consoleLines.join('\n'));
  console.log(JSON.stringify({ tag: TAG, error: result.error, cpu: result.cpu, bytes: result.recording?.totalBytes, bitrate: result.recording?.measuredBitrateBps, integrity: result.integrity?.match, ffDuration: result.ffprobe?.formatDuration, warnings: result.ffprobe?.fullDecode?.warnings, av: result.ffprobe?.av, player: result.playerCheck, cleanup: result.cleanup }, null, 1));
}
