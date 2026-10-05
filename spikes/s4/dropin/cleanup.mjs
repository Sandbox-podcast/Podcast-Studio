import {
  S3Client, ListMultipartUploadsCommand, AbortMultipartUploadCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { loadMinioEnv } from './load-env.mjs';

const cfg = loadMinioEnv();
const s3 = new S3Client({
  region: cfg.region, endpoint: cfg.endpoint, forcePathStyle: true,
  credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
});

const incomplete = await s3.send(new ListMultipartUploadsCommand({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
const aborted = [];
for (const u of incomplete.Uploads || []) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket: cfg.bucket, Key: u.Key, UploadId: u.UploadId }));
  aborted.push(u.Key);
}
const objs = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.keyPrefix }));
console.log(JSON.stringify({
  aborted,
  objects: (objs.Contents || []).map((o) => ({ key: o.Key, size: o.Size })),
}, null, 2));
