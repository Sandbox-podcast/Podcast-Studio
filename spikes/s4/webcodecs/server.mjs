/**
 * S4 WebCodecs spike API + static server (localhost only). Port SPIKE_PORT (default 3330).
 * Same presigned-multipart pattern as ../s4-lab/server.mjs; key prefix spike/s4-webcodecs/.
 * Credentials from ../minio/.env or env vars (load-env.mjs); never logged.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand,
  CompleteMultipartUploadCommand, AbortMultipartUploadCommand, ListMultipartUploadsCommand,
  HeadObjectCommand, GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadMinioEnv } from './load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SPIKE_PORT || 3330);
const cfg = loadMinioEnv();
const s3 = new S3Client({
  region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
});

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readRaw = (req) => new Promise((ok, ko) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', ko); });
const readBody = async (req) => { const raw = (await readRaw(req)).toString('utf8'); return raw ? JSON.parse(raw) : {}; };
const safeKey = (k) => { if (typeof k !== 'string' || !k.startsWith(cfg.keyPrefix)) throw new Error('key outside prefix'); return k; };

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/health') return json(res, 200, { ok: true, bucket: cfg.bucket, keyPrefix: cfg.keyPrefix });
  if (p === '/api/multipart/create' && req.method === 'POST') {
    const b = await readBody(req);
    const filename = String(b.filename || `rec-${Date.now()}.mp4`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${cfg.keyPrefix}${filename}`;
    const out = await s3.send(new CreateMultipartUploadCommand({ Bucket: cfg.bucket, Key: key, ContentType: b.contentType || 'video/mp4' }));
    return json(res, 200, { key, uploadId: out.UploadId });
  }
  if (p === '/api/multipart/presign-part' && req.method === 'POST') {
    const { key, uploadId, partNumber } = await readBody(req);
    const u = await getSignedUrl(s3, new UploadPartCommand({ Bucket: cfg.bucket, Key: safeKey(key), UploadId: uploadId, PartNumber: Number(partNumber) }), { expiresIn: 3600 });
    return json(res, 200, { url: u });
  }
  if (p === '/api/multipart/list-parts') {
    const out = await s3.send(new ListPartsCommand({ Bucket: cfg.bucket, Key: safeKey(url.searchParams.get('key')), UploadId: url.searchParams.get('uploadId') }));
    return json(res, 200, { parts: (out.Parts || []).map((x) => ({ PartNumber: x.PartNumber, ETag: x.ETag, Size: x.Size })) });
  }
  if (p === '/api/multipart/complete' && req.method === 'POST') {
    const { key, uploadId, parts } = await readBody(req);
    await s3.send(new CompleteMultipartUploadCommand({ Bucket: cfg.bucket, Key: safeKey(key), UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((x) => ({ PartNumber: x.PartNumber, ETag: x.ETag })) } }));
    const head = await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return json(res, 200, { ok: true, key, contentLength: head.ContentLength, etag: head.ETag });
  }
  if (p === '/api/multipart/abort' && req.method === 'POST') {
    const { key, uploadId } = await readBody(req);
    await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: safeKey(key), UploadId: uploadId }));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/presign-get') {
    const u = await getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: safeKey(url.searchParams.get('key')) }), { expiresIn: 3600 });
    return json(res, 200, { url: u });
  }
  if (p === '/api/admin/list-incomplete') {
    const out = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
    return json(res, 200, { uploads: (out.Uploads || []).map((u) => ({ key: u.Key, uploadId: u.UploadId })) });
  }
  if (p === '/api/local-copy' && req.method === 'POST') {
    // page posts its locally assembled bytes so the runner can sha256 local vs remote
    const name = String(url.searchParams.get('name') || 'local.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
    const buf = await readRaw(req);
    fs.writeFileSync(path.join(__dirname, 'artifacts', name), buf);
    return json(res, 200, { ok: true, bytes: buf.length });
  }
  return json(res, 404, { error: 'not found' });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    const rel = url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^[/\\]+/, '');
    const file = path.join(__dirname, 'public', rel);
    if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(String(e.message || e)); json(res, 500, { error: String(e.message || e) }); }
});
server.listen(PORT, '127.0.0.1', () => console.log(JSON.stringify({ event: 'spike-server-up', listen: `http://127.0.0.1:${PORT}`, bucket: cfg.bucket, keyPrefix: cfg.keyPrefix })));
