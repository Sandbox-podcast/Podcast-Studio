/**
 * Box tests for S4 drop-in v2.1 audio presence guard.
 * Cases: (1) live WebAudio mic-like → samplesSeen>0, Opus in WebM
 *        (2) audio track stopped before start → issue + audioMissing
 *        (3) track stopped mid-take → issue with timestamp
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command,
  ListMultipartUploadsCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { loadMinioEnv } from './load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_PORT = Number(process.env.LAB_PORT || 3320);
const HARNESS_PORT = Number(process.env.HARNESS_PORT || 8089);
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const cfg = loadMinioEnv();
const s3 = new S3Client({
  region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
});

function sh(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (code) => resolve({ code, stdout, stderr }));
    p.on('error', reject);
  });
}

function serveHarness(port) {
  const html = `<!doctype html><html><body>
<canvas id="cv" width="640" height="360"></canvas>
<script src="http://127.0.0.1:${LAB_PORT}/s4-recorder.js"></script>
<script>
const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
let raf=0;
(function draw(){ const t=performance.now()/1000; ctx.fillStyle='#135'; ctx.fillRect(0,0,640,360);
 ctx.fillStyle='#fff'; ctx.font='28px monospace'; ctx.fillText('AUD '+t.toFixed(2),20,40); raf=requestAnimationFrame(draw);})();

function makeAudio() {
  const ac = new (window.AudioContext||window.webkitAudioContext)();
  const osc = ac.createOscillator(); osc.type='sawtooth'; osc.frequency.value=440;
  const gain = ac.createGain(); gain.gain.value=0.2;
  const dest = ac.createMediaStreamDestination();
  osc.connect(gain).connect(dest); osc.start();
  return { ac, osc, track: dest.stream.getAudioTracks()[0], streamPart: dest.stream };
}

window.__audioCases = {
  async caseLive(durationSec=6) {
    const a = makeAudio();
    const v = canvas.captureStream(30);
    const stream = new MediaStream([...v.getVideoTracks(), a.track]);
    const issues=[];
    const h = await S4Recorder.startSession({
      stream, label: 'aud-live', apiBase: 'http://127.0.0.1:${LAB_PORT}',
      participant: 'box', durationSec, partMiB: 5, timeslice: 500, vBitrate: 800000,
      onAudioIssue: (i) => issues.push(i), expectAudio: true, opfs: true,
    });
    const res = await h.done;
    try { a.osc.stop(); a.ac.close(); } catch(_){}
    return { res, issues };
  },
  async caseEndedBeforeStart(durationSec=4) {
    const a = makeAudio();
    a.track.stop(); // ended before start
    await new Promise(r=>setTimeout(r,50));
    const v = canvas.captureStream(30);
    // Prefer attaching the ended track so start-state inspect sees readyState=ended.
    let stream;
    try {
      stream = new MediaStream([...v.getVideoTracks(), a.track]);
    } catch (_) {
      stream = new MediaStream([...v.getVideoTracks()]);
    }
    const issues=[];
    const h = await S4Recorder.startSession({
      stream, label: 'aud-ended', apiBase: 'http://127.0.0.1:${LAB_PORT}',
      participant: 'box', durationSec, partMiB: 5, timeslice: 500, vBitrate: 800000,
      onAudioIssue: (i) => issues.push(i), expectAudio: true, opfs: true,
    });
    const res = await h.done;
    try { a.ac.close(); } catch(_){}
    return { res, issues, note: 'audio track stopped before startSession' };
  },
  async caseStopMid(durationSec=6, stopAtSec=2.5) {
    const a = makeAudio();
    const v = canvas.captureStream(30);
    const stream = new MediaStream([...v.getVideoTracks(), a.track]);
    const issues=[];
    const h = await S4Recorder.startSession({
      stream, label: 'aud-mid', apiBase: 'http://127.0.0.1:${LAB_PORT}',
      participant: 'box', durationSec, partMiB: 5, timeslice: 500, vBitrate: 800000,
      onAudioIssue: (i) => issues.push(i), expectAudio: true, opfs: true,
    });
    await new Promise(r=>setTimeout(r, stopAtSec*1000));
    a.track.stop();
    const res = await h.done;
    try { a.osc.stop(); a.ac.close(); } catch(_){}
    return { res, issues };
  },
};
</script></body></html>`;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

async function waitHealth() {
  for (let i=0;i<50;i++) {
    try { const r = await fetch(`http://127.0.0.1:${LAB_PORT}/api/health`); if (r.ok) return r.json(); } catch(_){}
    await new Promise(r=>setTimeout(r,200));
  }
  throw new Error('health timeout');
}

async function cleanup() {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: 'spike/s4-dropin/' }));
  const deleted=[];
  for (const o of listed.Contents||[]) {
    if (!/box-aud-|aud-live|aud-ended|aud-mid|dropin-box-aud/.test(o.Key) && !/\/box-aud-/.test(o.Key)) {
      // delete only our test objects: participant box, labels aud-*
      if (!o.Key.includes('/box-aud-') && !o.Key.match(/box-aud-(live|ended|mid)/) && !o.Key.includes('box-aud-')) {
        if (!(o.Key.includes('aud-live') || o.Key.includes('aud-ended') || o.Key.includes('aud-mid'))) continue;
      }
    }
    if (o.Key.includes('aud-live') || o.Key.includes('aud-ended') || o.Key.includes('aud-mid')) {
      await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: o.Key }));
      deleted.push(o.Key);
    }
  }
  const mpu = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: 'spike/s4-dropin/' }));
  for (const u of mpu.Uploads||[]) {
    if (u.Key.includes('aud-live')||u.Key.includes('aud-ended')||u.Key.includes('aud-mid')) {
      await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: u.Key, UploadId: u.UploadId }));
    }
  }
  return deleted;
}

const report = { cases: {}, errors: [], deleted: [] };
let labProc, harness;
try {
  process.env.CORS_ORIGINS = `http://127.0.0.1:${HARNESS_PORT},http://localhost:${HARNESS_PORT}`;
  labProc = spawn('node', ['server.mjs'], { cwd: __dirname, env: { ...process.env, LAB_PORT: String(LAB_PORT) }, stdio: ['ignore','pipe','pipe'] });
  labProc.stdout.on('data', d => process.stdout.write(d));
  labProc.stderr.on('data', d => process.stderr.write(d));
  await waitHealth();
  harness = await serveHarness(HARNESS_PORT);

  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  page.on('pageerror', e => report.errors.push('pageerror:'+e.message));
  await page.goto(`http://127.0.0.1:${HARNESS_PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.S4Recorder?.startSession && !!window.__audioCases);

  // Case 1
  const c1 = await page.evaluate(async () => window.__audioCases.caseLive(6));
  const key1 = c1.res?.integrity?.key;
  let opus = null;
  if (key1) {
    const dest = path.join(OUT, 'aud-live.webm');
    const got = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key1 }));
    fs.writeFileSync(dest, Buffer.from(await got.Body.transformToByteArray()));
    const probe = await sh('ffprobe', ['-v','error','-show_entries','stream=codec_type,codec_name','-of','csv=p=0', dest]);
    opus = { streams: probe.stdout.trim().split('\n').filter(Boolean), rc: probe.code };
  }
  report.cases.live = {
    samplesSeen: c1.res?.audio?.samplesSeen,
    firstSampleMs: c1.res?.audio?.firstSampleMs,
    issues: c1.res?.audio?.issues,
    callbackIssues: c1.issues,
    audioMissing: c1.res?.audioMissing,
    completeOk: c1.res?.completeOk,
    key: key1,
    remote: c1.res?.integrity?.remoteContentLength,
    ffprobe: opus,
    mode: c1.res?.audio?.mode,
  };
  if (!(c1.res?.audio?.samplesSeen > 0)) report.errors.push('live: samplesSeen not >0');
  if (c1.res?.audioMissing) report.errors.push('live: unexpected audioMissing');
  if (!opus?.streams?.some(s => s.includes('audio') && s.includes('opus'))) report.errors.push('live: no opus audio stream in WebM: '+JSON.stringify(opus));

  // Case 2
  const c2 = await page.evaluate(async () => window.__audioCases.caseEndedBeforeStart(4));
  report.cases.endedBefore = {
    samplesSeen: c2.res?.audio?.samplesSeen,
    issues: c2.res?.audio?.issues,
    callbackIssues: c2.issues,
    audioMissing: c2.res?.audioMissing,
    completeOk: c2.res?.completeOk,
    key: c2.res?.integrity?.key,
    note: c2.note,
  };
  if (!c2.res?.audioMissing) report.errors.push('endedBefore: expected audioMissing');
  if (!c2.res?.audio?.issues?.length && !c2.issues?.length) report.errors.push('endedBefore: expected onAudioIssue');

  // Case 3
  const c3 = await page.evaluate(async () => window.__audioCases.caseStopMid(6, 2.5));
  report.cases.stopMid = {
    samplesSeen: c3.res?.audio?.samplesSeen,
    issues: c3.res?.audio?.issues,
    callbackIssues: c3.issues,
    audioMissing: c3.res?.audioMissing,
    completeOk: c3.res?.completeOk,
    key: c3.res?.integrity?.key,
  };
  const midIssues = [...(c3.res?.audio?.issues||[]), ...(c3.issues||[])];
  const endedIssue = midIssues.find(i => i.reason === 'track_ended' || i.reason === 'processor_stream_ended');
  if (!endedIssue) report.errors.push('stopMid: expected track_ended/processor_stream_ended issue got '+JSON.stringify(midIssues));
  else if (!(endedIssue.tMs >= 2000 && endedIssue.tMs <= 4500)) report.errors.push('stopMid: mid-stop tMs out of range: '+endedIssue.tMs);
  // samples should have been seen before stop
  if (!(c3.res?.audio?.samplesSeen > 0)) report.errors.push('stopMid: expected samples before stop');

  await browser.close();
  report.deleted = await cleanup();
} catch (e) {
  report.errors.push(String(e.message||e));
  console.error(e);
} finally {
  if (harness) await new Promise(r => harness.close(r));
  if (labProc) { labProc.kill('SIGTERM'); await new Promise(r=>setTimeout(r,400)); try{labProc.kill('SIGKILL');}catch(_){} }
  fs.writeFileSync(path.join(OUT, 'audio-guard-test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.errors.length===0, cases: report.cases, errors: report.errors }, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}
