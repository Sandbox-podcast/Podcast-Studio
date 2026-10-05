/**
 * Pass 2b — OPFS crash recovery (headless Chromium, persistent context).
 * record → first part uploaded → cut MinIO → CLOSE page mid-cut (crash) →
 * reconnect → fresh page, same profile → recoverAll() → complete → verify.
 * Ground truth = every chunk MediaRecorder delivered (tapped to Node via exposeBinding).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { S3Client, GetObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { loadMinioEnv } from './load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = `http://127.0.0.1:${Number(process.env.LAB_PORT || 3320)}`;
const OUT = path.join(__dirname, 'out');
const ART = path.join(__dirname, 'artifacts');
const CUT_BEFORE_CRASH_MS = Number(process.env.S4_CRASH_AFTER_CUT_MS || 20000);
const cfg = loadMinioEnv();
const s3 = new S3Client({ region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const iso = () => new Date().toISOString();
const MINIO = '**://127.0.0.1:9000/**';

const report = { label: 'localhost / headless / synthetic — NOT Sandbox-hardware pass', pass: 'S4 pass 2b — OPFS crash recovery',
  startedAt: iso(), timeline: {}, crashMethod: 'page.close() during MinIO cut (persistent context keeps OPFS)', errors: [] };
const events = [];
const tap = new Map();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 's4-opfs-profile-'));

const ctx = await chromium.launchPersistentContext(profile, { headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'] });
report.browser = ctx.browser()?.version() ?? 'persistent';
await ctx.exposeBinding('__s4Tap', (_src, idx, b64) => { tap.set(idx, Buffer.from(b64, 'base64')); });
const hook = (page, tag) => page.on('console', (m) => {
  const t = m.text();
  if (t.startsWith('[s4-ev] ')) { try { events.push({ page: tag, ...JSON.parse(t.slice(8)) }); } catch {} }
});

try {
  // ---- page 1: record, cut, crash
  const p1 = await ctx.newPage(); hook(p1, 'p1');
  await p1.goto(`${BASE}/recorder.html`, { waitUntil: 'networkidle' });
  await p1.evaluate(() => window.__s4.opfsWipe());
  const recP = p1.evaluate((o) => window.__s4.startRecording(o), {
    participant: 'lab-opfs', durationSec: 300, partMiB: 5, vBitrate: 8_000_000, timeslice: 1000,
    mimeType: 'video/webm;codecs=vp8,opus', opfs: true, tap: true,
  }).catch((e) => ({ closed: String(e.message || e).slice(0, 120) }));
  report.timeline.recordStart = iso();
  await p1.waitForFunction(() => (window.__s4?.results?.parts || []).some((p) => p.status === 'uploaded'), null, { timeout: 60000, polling: 250 });
  report.timeline.firstPartUploaded = iso();
  await p1.route(MINIO, (r) => r.abort('internetdisconnected'));
  await p1.evaluate(() => window.__s4.setOnline(false, 'cut-crash'));
  report.timeline.cutStart = iso();
  await new Promise((r) => setTimeout(r, CUT_BEFORE_CRASH_MS));
  const pre = await p1.evaluate(() => ({ parts: window.__s4.results.parts.map((p) => [p.partNumber, p.status]), opfs: window.__s4.results.opfs }));
  report.timeline.crash = iso();
  const tCrash = Date.now();
  await p1.close();                       // ---- CRASH (page gone, in-memory buffer gone)
  report.crashTapChunks = tap.size;
  await recP;
  report.preCrash = pre;
  report.timeline.reconnect = iso();      // network back (route belonged to p1)

  // ---- page 2: fresh page, same profile → recover
  const tOpen = Date.now();
  const p2 = await ctx.newPage(); hook(p2, 'p2');
  await p2.goto(`${BASE}/recorder.html`, { waitUntil: 'load' });
  const tLoaded = Date.now();
  const rec = await p2.evaluate(() => window.__s4.recoverAll());
  const tDone = Date.now();
  report.recovery = rec;
  report.timeline.recoveryDone = iso();
  report.timings = { pageOpenToLoadedMs: tLoaded - tOpen, recoverAllMs: rec.totalMs, pageOpenToRecoveredMs: tDone - tOpen, crashToRecoveredMs: tDone - tCrash };

  // ---- verify vs ground truth
  const idxs = [...tap.keys()].sort((a, b) => a - b);
  const contiguous = idxs.every((v, i) => v === i + 1);
  const produced = Buffer.concat(idxs.map((i) => tap.get(i)));
  const sess = rec.sessions[0];
  let remote = null;
  if (sess?.completed?.key) {
    const o = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: sess.completed.key }));
    remote = Buffer.from(await o.Body.transformToByteArray());
    fs.writeFileSync(path.join(ART, 'lab-opfs-recovered.webm'), remote);
  }
  fs.writeFileSync(path.join(ART, 'lab-opfs-produced.webm'), produced);
  const lostBytes = produced.length - (remote?.length ?? 0);
  report.integrity = {
    producedChunks: idxs.length, producedChunksContiguous: contiguous, producedBytes: produced.length,
    recoveredBytes: remote?.length ?? null,
    recoveredSha256: remote ? sha(remote) : null,
    producedSha256: sha(produced),
    producedPrefixSha256: remote ? sha(produced.subarray(0, remote.length)) : null,
    recoveredIsExactPrefixOfProduced: remote ? sha(produced.subarray(0, remote.length)) === sha(remote) : false,
    fullMatch: remote ? sha(remote) === sha(produced) : false,
    lostBytes, lossPct: produced.length ? Math.round((lostBytes / produced.length) * 1e6) / 1e4 : null,
  };
} catch (e) {
  report.errors.push(String(e.stack || e));
}

// ---- OPFS stats from page-1 events
const cw = events.filter((e) => e.page === 'p1' && e.type === 'opfs-chunk-write').map((e) => e.ms);
const pw = events.filter((e) => e.page === 'p1' && e.type === 'opfs-part-write');
const stat = (a) => a.length ? { n: a.length, min: Math.min(...a), median: [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)], max: Math.max(...a), mean: Math.round(a.reduce((x, y) => x + y, 0) / a.length * 1000) / 1000 } : null;
report.opfsWrites = { chunkWriteMs: stat(cw), partWriteMs: stat(pw.map((e) => e.ms)), partWrites: pw.map((e) => ({ partNumber: e.partNumber, size: e.size, ms: e.ms, manifestMs: e.manifestMs })) ,
  opfsErrors: events.filter((e) => e.type === 'opfs-error') };
report.events = events;

try {
  const p3 = await ctx.newPage();
  await p3.goto(`${BASE}/recorder.html`, { waitUntil: 'load' });
  report.opfsSessionsLeftAfter = await p3.evaluate(() => window.__s4.opfsList());
} catch (e) { report.errors.push('opfs list: ' + e.message); }
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });

const inc = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
const aborted = [];
for (const u of inc.Uploads || []) { await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: u.Key, UploadId: u.UploadId })); aborted.push(u.Key); }
const inc2 = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
report.cleanup = { abortedCount: aborted.length, aborted, incompleteMpuCountAfter: (inc2.Uploads || []).length };
report.finishedAt = iso();
fs.writeFileSync(path.join(OUT, 'opfs-results.json'), JSON.stringify(report, null, 2));
const { events: _e, ...brief } = report;
console.log(JSON.stringify({ timings: brief.timings, integrity: brief.integrity, opfsWrites: { chunkWriteMs: brief.opfsWrites?.chunkWriteMs, partWriteMs: brief.opfsWrites?.partWriteMs, errors: brief.opfsWrites?.opfsErrors?.length },
  preCrash: brief.preCrash?.parts, recovery: brief.recovery?.sessions?.map((s) => ({ remoteBefore: s.remoteBefore, resent: s.resentParts, lost: s.lostParts, tail: s.tail, completed: s.completed, errors: s.errors, sessionMs: s.sessionMs })),
  opfsLeft: brief.opfsSessionsLeftAfter, cleanup: brief.cleanup, errors: brief.errors }, null, 2));
