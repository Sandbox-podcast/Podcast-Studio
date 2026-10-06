import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseDotEnv(content) {
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/** MinIO config for pass-2 lab — never hardcode credentials. */
export function loadMinioEnv() {
  const filePath = process.env.S4_MINIO_ENV_FILE
    ? path.resolve(process.env.S4_MINIO_ENV_FILE)
    : path.resolve(__dirname, '../minio/.env');

  let fileEnv = {};
  if (fs.existsSync(filePath)) {
    fileEnv = parseDotEnv(fs.readFileSync(filePath, 'utf8'));
  }

  const merged = { ...fileEnv, ...pickProcessEnv() };

  const host = merged.MINIO_LAN_HOST || merged.S3_HOST || '127.0.0.1';
  const port = merged.MINIO_API_PORT || '9000';
  const endpoint = merged.S3_ENDPOINT || `http://${host}:${port}`;

  return {
    endpoint,
    region: merged.S3_REGION || 'us-east-1',
    bucket: merged.MINIO_BUCKET_NAME || merged.S3_BUCKET || 'podcast-recordings-poc',
    accessKeyId: merged.MINIO_ROOT_USER || merged.S3_ACCESS_KEY_ID,
    secretAccessKey: merged.MINIO_ROOT_PASSWORD || merged.S3_SECRET_ACCESS_KEY,
    keyPrefix: merged.S4_LAB_KEY_PREFIX || 'spike/s4-lab/rec/',
  };
}

function pickProcessEnv() {
  const keys = [
    'MINIO_LAN_HOST',
    'MINIO_API_PORT',
    'MINIO_BUCKET_NAME',
    'MINIO_ROOT_USER',
    'MINIO_ROOT_PASSWORD',
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S4_LAB_KEY_PREFIX',
  ];
  const out = {};
  for (const k of keys) {
    if (process.env[k]) out[k] = process.env[k];
  }
  return out;
}
