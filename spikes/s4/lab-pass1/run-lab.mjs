/**
 * S4 lab orchestrator — headless Chromium (Playwright) on localhost.
 * Label: local-dev / headless / synthetic — NOT Sandbox-hardware pass.
 *
 * Network cuts block ONLY MinIO (127.0.0.1:9000) so the lab API on :3320
 * stays reachable for list-parts / resume after reconnect.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  S3Client, GetObjectCommand, HeadObjectCommand,
  ListMultipartUploadsCommand, AbortMultipartUploadCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { loadMinioEnv } from './load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_PORT = Number(process.env.LAB_PORT || 3320);
const BASE = `http://127.0.0.1:${LAB_PORT}`;
const OUT = path.join(__dirname, 'out');
const ARTIFACTS = path.join(__dirname, 'artifacts');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ARTIFACTS, { recursive: true });

const cfg = loadMinioEnv();
const s3 = new S3Client({
  region: cfg.region,
  endpoint: cfg.endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const summary = {
  label: 'localhost / headless / synthetic — NOT Sandbox-hardware pass',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  browser: null,
  flags: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
  sourceType: 'canvas.captureStream(30) + WebAudio oscillator (sawtooth+LFO)',
  networkCutMethod: 'Playwright route.abort on **://127.0.0.1:9000/** (presigned PUTs only); lab API :3320 stays up',
  items: {},
  errors: [],
};

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (code) => resolve({ code, stdout, stderr }));
    p.on('error', reject);
  });
}

async function waitHealth(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return await r.json();
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('lab server health timeout');
}

async function downloadKey(key, dest) {
  const out = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  const bytes = Buffer.from(await out.Body.transformToByteArray());
  fs.writeFileSync(dest, bytes);
  return bytes;
}

async function headKey(key) {
  return s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function ffprobeJson(file) {
  const { code, stdout, stderr } = await sh('ffprobe', [
    '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', file,
  ]);
  if (code !== 0) return { ok: false, code, stderr: stderr.slice(0, 2000) };
  return { ok: true, data: JSON.parse(stdout) };
}

async function abortAllIncomplete(prefix = cfg.keyPrefix) {
  const out = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: prefix }));
  const aborted = [];
  for (const u of out.Uploads || []) {
    await s3.send(new AbortMultipartUploadCommand({
      Bucket: cfg.bucket, Key: u.Key, UploadId: u.UploadId,
    }));
    aborted.push({ key: u.Key, uploadId: u.UploadId });
  }
  return aborted;
}

async function listLabObjects() {
  const out = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
  return (out.Contents || []).map((o) => ({ key: o.Key, size: o.Size, lastModified: o.LastModified }));
}

function launchOpts() {
  return {
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-dev-shm-usage',
    ],
  };
}

/** Block MinIO only (presigned PUT host). Lab API remains reachable. */
async function cutMinio(page, durationMs, label) {
  const appliedAt = Date.now();
  const handler = (route) => route.abort('internetdisconnected');
  await page.route('**://127.0.0.1:9000/**', handler);
  await page.evaluate(() => window.__s4?.setOnline?.(false));
  await new Promise((r) => setTimeout(r, durationMs));
  await page.unroute('**://127.0.0.1:9000/**', handler);
  await page.evaluate(() => window.__s4?.setOnline?.(true));
  // Kick resume of any buffered/failed parts
  await page.evaluate(async () => {
    if (window.__s4?.uploader) await window.__s4.uploader.resumeMissing();
  }).catch(() => {});
  const endedAt = Date.now();
  return {
    label,
    requestedMs: durationMs,
    actualMs: endedAt - appliedAt,
    wallStartIso: new Date(appliedAt).toISOString(),
    wallEndIso: new Date(endedAt).toISOString(),
    method: 'page.route abort 127.0.0.1:9000',
  };
}

async function runMainPass(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[s4]') || t.includes('part ') || t.includes('resume')) {
      fs.appendFileSync(path.join(OUT, 'browser-console.log'), `[${msg.type()}] ${t}\n`);
    }
  });
  page.on('pageerror', (err) => {
    fs.appendFileSync(path.join(OUT, 'browser-console.log'), `[pageerror] ${err}\n`);
  });

  await page.goto(`${BASE}/recorder.html`, { waitUntil: 'networkidle' });
  const probe = await page.evaluate(() => window.__s4.probe());
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(probe, null, 2));

  const durationSec = Number(process.env.S4_DURATION_SEC || 180);

  const startPromise = page.evaluate(async (opts) => {
    return window.__s4.startRecording(opts);
  }, {
    participant: 'lab-main',
    durationSec,
    partMiB: 5,
    vBitrate: 8_000_000,
    timeslice: 1000,
    mimeType: 'video/webm;codecs=vp8,opus',
    chromeFakeDeviceFlags: true,
  });

  // Wait until ≥1 part uploaded OR 20s into recording
  await page.waitForFunction(() => {
    const parts = window.__s4?.results?.parts || [];
    const rec = window.__s4?.results?.recording;
    return parts.some((p) => p.status === 'uploaded') ||
      (rec && performance.now() - rec.tStartPerf > 20000);
  }, null, { timeout: 120000 }).catch((e) => {
    fs.appendFileSync(path.join(OUT, 'browser-console.log'), `[wait] ${e}\n`);
  });

  const cuts = [];
  cuts.push(await cutMinio(page, 10_000, 'cut-10s'));
  await new Promise((r) => setTimeout(r, 12_000));
  cuts.push(await cutMinio(page, 30_000, 'cut-30s'));

  const results = await startPromise;
  results.cuts = cuts;

  const localSha = results.integrity?.localSha256;
  const localBytes = results.integrity?.localBytes;
  const key = results.integrity?.key;

  let remote = null;
  let probeOut = null;
  if (key) {
    const remotePath = path.join(ARTIFACTS, 'lab-main-remote.webm');
    try {
      const remoteBuf = await downloadKey(key, remotePath);
      const remoteSha = sha256(remoteBuf);
      const head = await headKey(key);
      probeOut = await ffprobeJson(remotePath);
      // Also dump local sha comparison file
      fs.writeFileSync(path.join(OUT, 'integrity.json'), JSON.stringify({
        key, localSha, localBytes,
        remoteSha, remoteBytes: remoteBuf.length,
        headContentLength: head.ContentLength,
        shaMatch: localSha === remoteSha,
        sizeMatch: localBytes === remoteBuf.length,
      }, null, 2));
      remote = {
        key,
        path: remotePath,
        bytes: remoteBuf.length,
        sha256: remoteSha,
        headContentLength: head.ContentLength,
        shaMatchLocal: localSha ? remoteSha === localSha : null,
        sizeMatchLocal: localBytes != null ? remoteBuf.length === localBytes : null,
      };
    } catch (e) {
      remote = { key, error: String(e.message || e) };
    }
  }

  fs.writeFileSync(path.join(OUT, 'main-results.json'), JSON.stringify({
    results, remote, probeOut, localSha, localBytes, cuts, probe,
  }, null, 2));
  await context.close();
  return { results, remote, probeOut, localSha, localBytes, cuts, probe };
}

async function runSyncPass(browser) {
  const c1 = await browser.newContext();
  const c2 = await browser.newContext();
  const p1 = await c1.newPage();
  const p2 = await c2.newPage();
  await p1.goto(`${BASE}/recorder.html`);
  await p2.goto(`${BASE}/recorder.html`);

  const durationSec = Number(process.env.S4_SYNC_DURATION_SEC || 45);
  const goAt = Date.now() + 800;

  const runOne = (page, name) => page.evaluate(async ({ name, durationSec, goAt }) => {
    while (Date.now() < goAt) { /* spin until shared wall clock */ }
    const wallNow = Date.now();
    const timeOrigin = performance.timeOrigin;
    const t0 = performance.now();
    const res = await window.__s4.startRecording({
      participant: name,
      durationSec,
      partMiB: 5,
      vBitrate: 2_000_000,
      timeslice: 500,
    });
    return {
      name,
      goAt,
      wallNow,
      timeOrigin,
      t0,
      sync: res.sync,
      firstChunkAt: res.recording?.firstChunkAt ?? null,
      mimeType: res.mimeType,
      totalBytesLocal: res.recording?.totalBytesLocal,
      key: res.integrity?.key,
      errors: res.errors,
      parts: res.parts?.length,
    };
  }, { name, durationSec, goAt });

  const [r1, r2] = await Promise.all([
    runOne(p1, 'lab-sync-a'),
    runOne(p2, 'lab-sync-b'),
  ]);

  const offset = {
    timeOriginDeltaMs: r1.timeOrigin - r2.timeOrigin,
    wallStartDeltaMs: r1.wallNow - r2.wallNow,
    firstChunkAbsA: r1.firstChunkAt != null ? r1.timeOrigin + r1.firstChunkAt : null,
    firstChunkAbsB: r2.firstChunkAt != null ? r2.timeOrigin + r2.firstChunkAt : null,
    firstChunkAbsDeltaMs:
      (r1.firstChunkAt != null && r2.firstChunkAt != null)
        ? (r1.timeOrigin + r1.firstChunkAt) - (r2.timeOrigin + r2.firstChunkAt)
        : null,
    goAt,
    durationSec,
  };

  fs.writeFileSync(path.join(OUT, 'sync-results.json'), JSON.stringify({ r1, r2, offset }, null, 2));
  await c1.close();
  await c2.close();
  return { r1, r2, offset };
}

async function main() {
  console.log('waiting for lab server…');
  const health = await waitHealth();
  console.log('health', health);

  const browser = await chromium.launch(launchOpts());
  const ver = await browser.version();
  summary.browser = { playwrightChromium: ver, systemChrome: null };
  try {
    const { stdout } = await sh('google-chrome', ['--version']);
    summary.browser.systemChrome = stdout.trim();
  } catch (_) {}

  console.log('=== main record+upload+resume ===');
  try {
    const main = await runMainPass(browser);
    const uploadOk = !!(main.remote && main.remote.shaMatchLocal);
    summary.items.recording = {
      status: main.results.errors?.length ? 'PASS_WITH_ERRORS' : 'PASS',
      mimeType: main.results.mimeType,
      mimeTypesSupported: main.probe?.mime || main.results.mimeTypesSupported,
      source: summary.sourceType,
      durationSecTarget: main.results.recording?.durationSecTarget,
      elapsedMs: main.results.recording?.elapsedMs,
      chunkCount: main.results.recording?.chunkCount,
      totalBytesLocal: main.results.recording?.totalBytesLocal,
      measuredBitrateBps: main.results.recording?.measuredBitrateBps,
      errors: main.results.errors,
    };
    summary.items.webCodecs = {
      status: 'FEASIBILITY_ONLY',
      ...(main.probe?.webCodecs || main.results.webCodecs || {}),
    };
    summary.items.segmentsUpload = {
      status: uploadOk ? 'PASS' : (main.remote?.error || main.results.errors?.length ? 'FAIL' : 'PASS_WITH_CAVEATS'),
      partCount: main.results.parts?.length,
      parts: main.results.parts,
      key: main.results.integrity?.key,
      remote: main.remote,
      localSha: main.localSha,
      localBytes: main.localBytes,
    };
    summary.items.networkCutResume = {
      status: main.cuts?.length === 2 && uploadOk ? 'PASS' : (uploadOk ? 'PASS_WITH_CAVEATS' : 'FAIL'),
      cuts: main.cuts,
      shaMatchLocal: main.remote?.shaMatchLocal ?? null,
      sizeMatchLocal: main.remote?.sizeMatchLocal ?? null,
    };
    summary.items.ffprobe = {
      status: main.probeOut?.ok ? 'PASS' : 'FAIL',
      summary: main.probeOut?.ok ? {
        format: {
          format_name: main.probeOut.data.format?.format_name,
          duration: main.probeOut.data.format?.duration,
          size: main.probeOut.data.format?.size,
          bit_rate: main.probeOut.data.format?.bit_rate,
        },
        streams: (main.probeOut.data.streams || []).map((s) => ({
          codec_type: s.codec_type,
          codec_name: s.codec_name,
          width: s.width,
          height: s.height,
          duration: s.duration,
          nb_frames: s.nb_frames,
        })),
      } : { error: main.probeOut?.stderr || main.probeOut },
    };
  } catch (e) {
    summary.items.recording = { status: 'FAIL', error: String(e.message || e) };
    summary.errors.push(String(e.stack || e));
    console.error(e);
  }

  console.log('=== multi-track sync ===');
  try {
    const sync = await runSyncPass(browser);
    summary.items.multiTrackSync = {
      status: 'MEASURED',
      offset: sync.offset,
      a: { key: sync.r1.key, firstChunkAt: sync.r1.firstChunkAt, totalBytesLocal: sync.r1.totalBytesLocal, parts: sync.r1.parts, errors: sync.r1.errors },
      b: { key: sync.r2.key, firstChunkAt: sync.r2.firstChunkAt, totalBytesLocal: sync.r2.totalBytesLocal, parts: sync.r2.parts, errors: sync.r2.errors },
    };
  } catch (e) {
    summary.items.multiTrackSync = { status: 'FAIL', error: String(e.message || e) };
    summary.errors.push(String(e.stack || e));
    console.error(e);
  }

  console.log('=== cleanup incomplete ===');
  try {
    const aborted = await abortAllIncomplete();
    const objects = await listLabObjects();
    summary.items.abortCleanup = {
      status: 'PASS',
      abortedIncomplete: aborted,
      remainingObjectsUnderPrefix: objects,
    };
  } catch (e) {
    summary.items.abortCleanup = { status: 'FAIL', error: String(e.message || e) };
  }

  await browser.close();
  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('DONE', JSON.stringify({
    recording: summary.items.recording?.status,
    upload: summary.items.segmentsUpload?.status,
    resume: summary.items.networkCutResume?.status,
    ffprobe: summary.items.ffprobe?.status,
    sync: summary.items.multiTrackSync?.status,
    cleanup: summary.items.abortCleanup?.status,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
