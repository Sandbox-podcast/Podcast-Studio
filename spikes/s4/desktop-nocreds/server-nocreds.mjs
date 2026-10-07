/**
 * S4 drop-in server, credential-free variant (desktop-ai). Zero npm deps: node:http + node:fs + fetch.
 * Same API as ../dropin/server.mjs, but every S3 call uses a presigned URL from urls.json
 * (generated on the box by presign_desktop.py). No MinIO keys ever exist on this machine.
 *
 * Env: S4_PORT (3340) · S4_URLS (./urls.json; absent = smoke mode, create → 503)
 *      S4_RECORDER_JS = path to recorder.js. Not vendored here: the recorder is the unchanged
 *                      ../dropin/public/recorder.js (v2.2). Lookup order: public/recorder.js (copied next to
 *                      autorun.html on the target machine) → $S4_RECORDER_JS → ../dropin/public/recorder.js (repo layout).
 *      PROXY_PARTS=1 → presign-part returns a same-origin /proxy/part URL and the server forwards the PUT
 *                      (fallback only; default = browser PUTs straight to MinIO like previous S4 runs).
 * Listens on 127.0.0.1 and ::1 only (http://localhost:PORT).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.S4_PORT || 3340);
const URLS_FILE = process.env.S4_URLS || path.join(__dirname, 'urls.json');
const PROXY_PARTS = process.env.PROXY_PARTS === '1';
const OUT = path.join(__dirname, 'out');
const RECORDER_JS = [path.join(__dirname, 'public', 'recorder.js'), process.env.S4_RECORDER_JS,
  path.join(__dirname, '..', 'dropin', 'public', 'recorder.js')].find((f) => f && fs.existsSync(f)) || null;
fs.mkdirSync(OUT, { recursive: true });

const U = fs.existsSync(URLS_FILE) ? JSON.parse(fs.readFileSync(URLS_FILE, 'utf8')) : null;
const state = { startedAt: new Date().toISOString(), mode: U ? 'upload' : 'smoke', proxyParts: PROXY_PARTS,
  creates: 0, partsPresigned: [], listCalls: 0, completed: null, aborted: false, resultsWritten: null,
  autorun: { done: false, summary: null, lastLog: null } };

const evFile = path.join(OUT, 'server-events.jsonl');
function sev(type, data = {}) {
  const e = { t: new Date().toISOString(), type, ...data };
  fs.appendFileSync(evFile, JSON.stringify(e) + '\n');
  console.log(JSON.stringify(e));
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readBody(req) {
  const raw = (await readRaw(req)).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
// MinIO (Go encoding/xml) emits numeric entities, e.g. ETag &#34;abc&#34; — decode those too.
const xmlUnesc = (s) => s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? xmlUnesc(m[1]) : null; };

function requireUpload(res, key, uploadId) {
  if (!U) { json(res, 503, { error: 'smoke mode: no urls.json (no upload configured)' }); return false; }
  if (key !== undefined && key !== U.key) { json(res, 400, { error: 'key mismatch' }); return false; }
  if (uploadId !== undefined && uploadId !== U.uploadId) { json(res, 400, { error: 'uploadId mismatch' }); return false; }
  return true;
}

async function listParts() {
  const r = await fetch(U.list);
  const body = await r.text();
  if (!r.ok) throw new Error(`ListParts HTTP ${r.status}: ${body.slice(0, 300)}`);
  const parts = [];
  for (const m of body.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
    parts.push({ PartNumber: Number(tag(m[1], 'PartNumber')), ETag: tag(m[1], 'ETag'), Size: Number(tag(m[1], 'Size')) });
  }
  if (tag(body, 'IsTruncated') === 'true') throw new Error('ListParts truncated (>1000 parts?)');
  parts.sort((a, b) => a.PartNumber - b.PartNumber);
  return parts;
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, mode: state.mode, proxyParts: PROXY_PARTS, recorderJs: RECORDER_JS, endpoint: U?.endpoint || null,
      bucket: U?.bucket || null, key: U?.key || null, expiresAt: U?.expiresAt || null, partsMax: U?.partsMax || null });
  }
  if (p === '/api/multipart/create' && req.method === 'POST') {
    const body = await readBody(req);
    if (!requireUpload(res)) return;
    state.creates++;
    sev('create', { requestedFilename: body.filename, contentType: body.contentType, key: U.key, n: state.creates });
    return json(res, 200, { key: U.key, uploadId: U.uploadId, bucket: U.bucket });
  }
  if (p === '/api/multipart/presign-part' && req.method === 'POST') {
    const { key, uploadId, partNumber } = await readBody(req);
    if (!key || !uploadId || !partNumber) return json(res, 400, { error: 'key, uploadId, partNumber required' });
    if (!requireUpload(res, key, uploadId)) return;
    const n = Number(partNumber);
    const u = U.parts[String(n)];
    if (!u) { sev('presign-part-missing', { partNumber: n }); return json(res, 400, { error: `no pregenerated URL for part ${n} (max ${U.partsMax})` }); }
    state.partsPresigned.push(n);
    return json(res, 200, { url: PROXY_PARTS ? `/proxy/part?n=${n}` : u });
  }
  if (p === '/api/multipart/list-parts' && req.method === 'GET') {
    if (!requireUpload(res, url.searchParams.get('key'), url.searchParams.get('uploadId'))) return;
    state.listCalls++;
    const parts = await listParts();
    sev('list-parts', { count: parts.length });
    return json(res, 200, { parts });
  }
  if (p === '/api/multipart/complete' && req.method === 'POST') {
    const { key, uploadId, parts } = await readBody(req);
    if (!requireUpload(res, key, uploadId)) return;
    const xml = '<CompleteMultipartUpload>' + (parts || [])
      .sort((a, b) => a.PartNumber - b.PartNumber)
      .map((x) => `<Part><PartNumber>${Number(x.PartNumber)}</PartNumber><ETag>${String(x.ETag).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</ETag></Part>`)
      .join('') + '</CompleteMultipartUpload>';
    const r = await fetch(U.complete, { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml });
    const text = await r.text();
    if (!r.ok || /<Error>/.test(text)) { sev('complete-failed', { status: r.status, body: text.slice(0, 500) }); return json(res, 502, { error: `Complete HTTP ${r.status}: ${text.slice(0, 300)}` }); }
    const h = await fetch(U.head, { method: 'HEAD' });
    const out = { ok: true, key, contentLength: Number(h.headers.get('content-length')), etag: h.headers.get('etag'), headStatus: h.status, parts: (parts || []).length };
    state.completed = out;
    sev('complete', out);
    return json(res, 200, out);
  }
  if (p === '/api/multipart/abort' && req.method === 'POST') {
    const { key, uploadId } = await readBody(req);
    if (!requireUpload(res, key, uploadId)) return;
    const r = await fetch(U.abort, { method: 'DELETE' });
    state.aborted = r.status;
    sev('abort', { status: r.status });
    return json(res, r.ok ? 200 : 502, { ok: r.ok, status: r.status });
  }
  if (p === '/api/results' && req.method === 'POST') {
    const body = await readBody(req);
    const key = String(body.key || '');
    if (!body.results || typeof body.results !== 'object') return json(res, 400, { error: 'results object required' });
    if (U && key !== U.key) return json(res, 400, { error: 'key mismatch' });
    const resultsKey = /\.[a-z0-9]+$/i.test(key) ? key.replace(/\.[a-z0-9]+$/i, '.results.json') : `${key}.results.json`;
    const payload = JSON.stringify(body.results, null, 2);
    const localName = (resultsKey.split('/').pop() || 'results.json').replace(/[^a-zA-Z0-9._-]/g, '_');
    fs.writeFileSync(path.join(OUT, localName), payload);
    let bucketPut = null;
    if (U?.resultsPut && resultsKey === U.resultsKey) {
      try {
        const r = await fetch(U.resultsPut, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload });
        bucketPut = r.status;
      } catch (e) { bucketPut = String(e.message || e); }
    }
    state.resultsWritten = { resultsKey, localPath: `out/${localName}`, bucketPut };
    sev('results', state.resultsWritten);
    return json(res, 200, { ok: true, ...state.resultsWritten });
  }
  // --- autorun bookkeeping (headless page → launcher) ---
  if (p === '/api/autorun/log' && req.method === 'POST') {
    const body = await readBody(req);
    state.autorun.lastLog = body;
    sev('page', body);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/autorun/done' && req.method === 'POST') {
    const body = await readBody(req);
    state.autorun.done = true;
    state.autorun.summary = body;
    fs.writeFileSync(path.join(OUT, `autorun-${body.mode || 'unknown'}.json`), JSON.stringify(body, null, 2));
    sev('autorun-done', { mode: body.mode, ok: body.ok });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/autorun/probe' && req.method === 'GET') {
    const pf = path.join(__dirname, 'probe.json');
    return json(res, 200, fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : {});
  }
  if (p === '/api/autorun/state' && req.method === 'GET') {
    return json(res, 200, { ...state, partsPresignedCount: state.partsPresigned.length });
  }
  json(res, 404, { error: 'not found' });
}

async function handleProxyPart(req, res, url) {
  const n = Number(url.searchParams.get('n'));
  if (!U || !U.parts[String(n)]) return json(res, 400, { error: 'bad part' });
  const buf = await readRaw(req);
  const r = await fetch(U.parts[String(n)], { method: 'PUT', body: buf });
  const etag = r.headers.get('etag');
  sev('proxy-part', { n, size: buf.length, status: r.status });
  res.writeHead(r.status, { 'ETag': etag || '', 'Content-Type': 'text/plain' });
  res.end(r.ok ? '' : await r.text());
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const handler = async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname === '/proxy/part' && req.method === 'PUT' && PROXY_PARTS) return await handleProxyPart(req, res, url);
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    let rel = url.pathname;
    if (rel === '/s4-recorder.js' || rel === '/recorder.js') {
      if (!RECORDER_JS) { res.writeHead(404); return res.end('recorder.js not found (see header: S4_RECORDER_JS)'); }
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
      return fs.createReadStream(RECORDER_JS).pipe(res);
    }
    if (rel === '/') rel = '/autorun.html';
    const root = path.join(__dirname, 'public');
    const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    sev('error', { path: req.url, error: String(e.message || e) });
    if (!res.headersSent) json(res, 500, { error: String(e.message || e) });
  }
};

const listening = [];
for (const host of ['127.0.0.1', '::1']) {
  const s = http.createServer(handler);
  s.on('error', (e) => sev('listen-error', { host, error: String(e.message || e) }));
  s.listen(PORT, host, () => {
    listening.push(host);
    sev('server-up', { host, port: PORT, mode: state.mode, proxyParts: PROXY_PARTS, recorderJs: RECORDER_JS, key: U?.key || null, expiresAt: U?.expiresAt || null, pid: process.pid });
  });
}
