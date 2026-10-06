import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadMinioEnv() {
  const p = process.env.S4_ENV_FILE
    ? path.resolve(process.env.S4_ENV_FILE)
    : path.resolve(__dirname, '../../minio-dev/.env');
  if (!fs.existsSync(p)) {
    throw new Error(`S4 env file not found: ${p} (set S4_ENV_FILE)`);
  }
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return {
    endpoint: `http://127.0.0.1:${env.MINIO_API_PORT || 9000}`,
    region: 'us-east-1',
    bucket: env.MINIO_BUCKET_NAME || 'podcast-recordings-poc',
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
    keyPrefix: process.env.S4_KEY_PREFIX || 'spike/s4-dropin/',
    envFile: p,
  };
}
