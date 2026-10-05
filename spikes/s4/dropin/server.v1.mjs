/**
 * S4 drop-in API + static server (localhost only).
 * Ports: API/static on LAB_PORT (default 3320). Does not touch LiveKit/MinIO/harness ports.
 * CORS: CORS_ORIGINS (default http://127.0.0.1:8088,http://localhost:8088).
 * Script alias: /s4-recorder.js → public/recorder.js
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { loadMinioEnv } from './load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LAB_PORT || 3320);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://127.0.0.1:8088,http://localhost:8088')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const cfg = loadMinioEnv();

const s3 = new S3Client({
  region: cfg.region,
  endpoint: cfg.endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

function pickCorsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) return origin;
  return null;
}

function corsHeaders(req, extra = {}) {
  const o = pickCorsOrigin(req);
  const h = { ...extra };
  if (o) {
    h['Access-Control-Allow-Origin'] = o;
    h['Vary'] = 'Origin';
    h['Access-Control-Expose-Headers'] = 'ETag,etag';
  }
  return h;
}

function json(req, res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, corsHeaders(req, { 'Content-Type': 'application/json' }));
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function handleOptions(req, res) {
  const o = pickCorsOrigin(req);
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (o) {
    headers['Access-Control-Allow-Origin'] = o;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(o ? 204 : 403, headers);
  res.end();
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    return json(req, res, 200, { ok: true, endpoint: cfg.endpoint, bucket: cfg.bucket, keyPrefix: cfg.keyPrefix });
  }

  if (url.pathname === '/api/multipart/create' && req.method === 'POST') {
    const body = await readBody(req);
    const filename = String(body.filename || `rec-${Date.now()}.webm`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${cfg.keyPrefix}${filename}`;
    const out = await s3.send(new CreateMultipartUploadCommand({
      Bucket: cfg.bucket,
      Key: key,
      ContentType: body.contentType || 'video/webm',
    }));
    return json(req, res, 200, { key, uploadId: out.UploadId, bucket: cfg.bucket });
  }

  if (url.pathname === '/api/multipart/presign-part' && req.method === 'POST') {
    const body = await readBody(req);
    const { key, uploadId, partNumber } = body;
    if (!key || !uploadId || !partNumber) return json(req, res, 400, { error: 'key, uploadId, partNumber required' });
    const urlSigned = await getSignedUrl(
      s3,
      new UploadPartCommand({
        Bucket: cfg.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: Number(partNumber),
      }),
      { expiresIn: 3600 },
    );
    return json(req, res, 200, { url: urlSigned });
  }

  if (url.pathname === '/api/multipart/list-parts' && req.method === 'GET') {
    const key = url.searchParams.get('key');
    const uploadId = url.searchParams.get('uploadId');
    if (!key || !uploadId) return json(req, res, 400, { error: 'key, uploadId required' });
    const parts = [];
    let marker;
    for (;;) {
      const out = await s3.send(new ListPartsCommand({
        Bucket: cfg.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker,
      }));
      for (const p of out.Parts || []) {
        if (p.PartNumber != null && p.ETag) {
          parts.push({ PartNumber: p.PartNumber, ETag: p.ETag, Size: p.Size });
        }
      }
      if (!out.IsTruncated) break;
      marker = out.NextPartNumberMarker;
    }
    parts.sort((a, b) => a.PartNumber - b.PartNumber);
    return json(req, res, 200, { parts });
  }

  if (url.pathname === '/api/multipart/complete' && req.method === 'POST') {
    const body = await readBody(req);
    const { key, uploadId, parts } = body;
    await s3.send(new CompleteMultipartUploadCommand({
      Bucket: cfg.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: (parts || []).map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
      },
    }));
    const head = await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return json(req, res, 200, { ok: true, key, contentLength: head.ContentLength, etag: head.ETag });
  }

  if (url.pathname === '/api/multipart/abort' && req.method === 'POST') {
    const body = await readBody(req);
    await s3.send(new AbortMultipartUploadCommand({
      Bucket: cfg.bucket, Key: body.key, UploadId: body.uploadId,
    }));
    return json(req, res, 200, { ok: true });
  }

  if (url.pathname === '/api/admin/list-incomplete' && req.method === 'GET') {
    const out = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
    return json(req, res, 200, {
      uploads: (out.Uploads || []).map((u) => ({ key: u.Key, uploadId: u.UploadId, initiated: u.Initiated })),
    });
  }

  if (url.pathname === '/api/admin/list-objects' && req.method === 'GET') {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
    return json(req, res, 200, {
      objects: (out.Contents || []).map((o) => ({ key: o.Key, size: o.Size, lastModified: o.LastModified })),
    });
  }

  if (url.pathname === '/api/admin/download' && req.method === 'GET') {
    const key = url.searchParams.get('key');
    if (!key) return json(req, res, 400, { error: 'key required' });
    const out = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    const bytes = Buffer.from(await out.Body.transformToByteArray());
    res.writeHead(200, corsHeaders(req, {
      'Content-Type': out.ContentType || 'application/octet-stream',
      'Content-Length': bytes.length,
    }));
    return res.end(bytes);
  }

  json(req, res, 404, { error: 'not found' });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (req.method === 'OPTIONS') {
      return handleOptions(req, res);
    }

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    // Alias for harness drop-in
    let rel = url.pathname;
    if (rel === '/s4-recorder.js') rel = '/recorder.js';
    else if (rel === '/') rel = '/recorder.html';

    rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(__dirname, 'public', rel);
    if (!file.startsWith(path.join(__dirname, 'public'))) {
      res.writeHead(403); return res.end('forbidden');
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    const ext = path.extname(file);
    res.writeHead(200, corsHeaders(req, { 'Content-Type': MIME[ext] || 'application/octet-stream' }));
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    json(req, res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({
    event: 's4-dropin-server-up',
    listen: `http://127.0.0.1:${PORT}`,
    s3: cfg.endpoint,
    bucket: cfg.bucket,
    keyPrefix: cfg.keyPrefix,
    corsOrigins: CORS_ORIGINS,
    recorder: `http://127.0.0.1:${PORT}/s4-recorder.js`,
  }));
});
