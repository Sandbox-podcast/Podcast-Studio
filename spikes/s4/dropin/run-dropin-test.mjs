/**
 * Box smoke v2: dual concurrent sessions + forced ~3s canvas pause + exportResults.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client, GetObjectCommand, HeadObjectCommand,
  DeleteObjectCommand, ListObjectsV2Command,
  ListMultipartUploadsCommand, AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { loadMinioEnv } from './load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_PORT = Number(process.env.LAB_PORT || 3320);
const HARNESS_PORT = Number(process.env.HARNESS_PORT || 8088);
const DURATION_SEC = Number(process.env.DURATION_SEC || 20);
const PAUSE_MS = Number(process.env.PAUSE_MS || 3000);
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const cfg = loadMinioEnv();
const s3 = new S3Client({
  region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
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
  const root = path.join(__dirname, 'harness');
  const server = http.createServer((req, res) => {
    let rel = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file);
    const mime = ext === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function waitHealth(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(`http://127.0.0.1:${LAB_PORT}/api/health`); if (r.ok) return r.json(); } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('lab health timeout');
}

async function cleanupPrefix(prefix) {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix }));
  const deleted = [];
  for (const o of listed.Contents || []) {
    if (o.Key === 'spike/s4-lab/rec/lab-opfs-1791219110555.webm') continue;
    if (!o.Key.startsWith('spike/s4-dropin/')) continue;
    // Never delete real-cam evidence keys with vision-host if somehow present on box MinIO — only dropin-box test
    if (o.Key.includes('vision-host-')) continue;
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: o.Key }));
    deleted.push(o.Key);
  }
  const mpu = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: prefix }));
  for (const u of mpu.Uploads || []) {
    if (!u.Key.startsWith('spike/s4-dropin/') || u.Key.includes('vision-host-')) continue;
    await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: u.Key, UploadId: u.UploadId }));
  }
  return deleted;
}

async function remuxProbe(label, key) {
  const dest = path.join(OUT, `${label}-raw.webm`);
  const got = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  const bytes = Buffer.from(await got.Body.transformToByteArray());
  fs.writeFileSync(dest, bytes);
  const remuxed = path.join(OUT, `${label}-remux.webm`);
  const setts = "setts=pts='if(lte(PTS,PREV_OUTPTS),PREV_OUTPTS+1,PTS)':dts='if(lte(DTS,PREV_OUTDTS),PREV_OUTDTS+1,DTS)'";
  const remux = await sh('ffmpeg', ['-hide_banner','-nostats','-y','-v','warning','-i',dest,'-map','0','-c','copy','-bsf:a',setts,remuxed]);
  const probe = await sh('ffprobe', ['-v','error','-print_format','json','-show_format','-show_streams',remuxed]);
  const data = probe.code === 0 ? JSON.parse(probe.stdout) : null;
  return {
    key, bytes: bytes.length, remuxRc: remux.code,
    duration: data?.format?.duration || null,
    streams: (data?.streams || []).map((s) => s.codec_type),
    bit_rate: data?.format?.bit_rate || null,
  };
}

const report = {
  startedAt: new Date().toISOString(), health: null, preflight: null,
  dual: null, probes: {}, corsErrors: [], pageErrors: [], deleted: [], errors: [],
};

let harnessServer, labProc;
try {
  if (!process.env.CORS_ORIGINS) {
    process.env.CORS_ORIGINS = `http://127.0.0.1:${HARNESS_PORT},http://localhost:${HARNESS_PORT}`;
  }
  labProc = spawn('node', ['server.mjs'], {
    cwd: __dirname, env: { ...process.env, LAB_PORT: String(LAB_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  labProc.stdout.on('data', (d) => process.stdout.write(d));
  labProc.stderr.on('data', (d) => process.stderr.write(d));

  report.health = await waitHealth();
  const pf = await fetch(`http://127.0.0.1:${LAB_PORT}/api/health`, {
    method: 'OPTIONS',
    headers: { Origin: `http://127.0.0.1:${HARNESS_PORT}`, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'content-type' },
  });
  report.preflight = { status: pf.status, allowOrigin: pf.headers.get('access-control-allow-origin') };

  harnessServer = await serveHarness(HARNESS_PORT);
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => report.pageErrors.push(String(e.message || e)));
  page.on('console', (msg) => {
    const t = msg.text();
    if (/CORS|Failed to fetch|Access-Control/i.test(t)) report.corsErrors.push(t);
  });

  await page.goto(`http://127.0.0.1:${HARNESS_PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.S4Recorder?.startSession && !!window.__harness, null, { timeout: 15000 });

  const dual = await page.evaluate(async ({ durationSec, pauseMs }) => {
    return window.__harness.runDual(durationSec, pauseMs, 6);
  }, { durationSec: DURATION_SEC, pauseMs: PAUSE_MS });

  report.dual = {
    raw: {
      key: dual.raw?.integrity?.key,
      bytes: dual.raw?.integrity?.localBytes,
      remote: dual.raw?.integrity?.remoteContentLength,
      errors: dual.raw?.errors,
      gaps: dual.raw?.gaps,
      visibility: dual.raw?.visibility,
      watchdogMode: dual.raw?.watchdogMode,
      elapsedMs: dual.raw?.recording?.elapsedMs,
      export: dual.exports?.raw,
    },
    matted: {
      key: dual.matted?.integrity?.key,
      bytes: dual.matted?.integrity?.localBytes,
      remote: dual.matted?.integrity?.remoteContentLength,
      errors: dual.matted?.errors,
      gaps: dual.matted?.gaps,
      visibility: dual.matted?.visibility,
      watchdogMode: dual.matted?.watchdogMode,
      elapsedMs: dual.matted?.recording?.elapsedMs,
      export: dual.exports?.matted,
    },
    gapEvents: dual.gapEvents,
  };

  if (!dual.raw?.integrity?.key || !dual.matted?.integrity?.key) {
    report.errors.push('missing object keys');
  } else {
    report.probes.raw = await remuxProbe('raw', dual.raw.integrity.key);
    report.probes.matted = await remuxProbe('matted', dual.matted.integrity.key);
  }

  // Watchdog expectations
  const matGaps = dual.matted?.gaps || [];
  const rawGaps = dual.raw?.gaps || [];
  const matHasBig = matGaps.some((g) => g.durationMs >= PAUSE_MS * 0.7);
  const rawHasBig = rawGaps.some((g) => g.durationMs >= PAUSE_MS * 0.7);
  report.watchdogCheck = {
    pauseMsRequested: PAUSE_MS,
    mattedGaps: matGaps,
    rawGaps: rawGaps,
    mattedReportsPause: matHasBig,
    rawReportsPause: rawHasBig,
  };
  if (!matHasBig) report.errors.push('matted session did not report ~3s gap');
  if (rawHasBig) report.errors.push('raw session unexpectedly reported ~3s gap');

  await browser.close();
  report.deleted = await cleanupPrefix('spike/s4-dropin/');
} catch (e) {
  report.errors.push(String(e.message || e));
  console.error(e);
} finally {
  if (harnessServer) await new Promise((r) => harnessServer.close(r));
  if (labProc) { labProc.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 400)); try { labProc.kill('SIGKILL'); } catch (_) {} }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'dropin-v2-test-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.errors.length === 0,
    rawDur: report.probes.raw?.duration,
    matDur: report.probes.matted?.duration,
    rawGaps: report.watchdogCheck?.rawGaps?.length,
    matGaps: report.watchdogCheck?.mattedGaps,
    exports: { raw: report.dual?.raw?.export, matted: report.dual?.matted?.export },
    errors: report.errors,
  }, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}
