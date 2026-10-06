// List objects + incomplete MPUs under spike/s4-webcodecs/; with --delete-except k1,k2 delete superseded objects. Abort all incomplete MPUs.
import { S3Client, ListObjectsV2Command, DeleteObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { loadMinioEnv } from './load-env.mjs';
const cfg = loadMinioEnv();
const s3 = new S3Client({ region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true, credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } });
const i = process.argv.indexOf('--delete-except'); const keep = i > 0 ? process.argv[i + 1].split(',') : null;
const inc = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
for (const u of inc.Uploads || []) await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: u.Key, UploadId: u.UploadId }));
const objs = (await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }))).Contents || [];
for (const o of objs) {
  const kept = !keep || keep.some((k) => o.Key.endsWith(k));
  if (!kept) await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: o.Key }));
  console.log(kept ? 'KEEP' : 'DEL ', o.Key, o.Size);
}
const after = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
console.log(JSON.stringify({ abortedIncomplete: (inc.Uploads || []).length, remainingIncomplete: (after.Uploads || []).length }));
