import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env ${name} (see .env.example)`);
  }
  return value;
}

export function getBucket(): string {
  return requireEnv("S3_BUCKET");
}

export function getKeyPrefix(): string {
  return process.env.S3_KEY_PREFIX ?? "spike/s4-lab/";
}

export function createS3Client(): S3Client {
  const endpoint = requireEnv("S3_ENDPOINT");
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
}

export async function createMultipartUpload(key: string): Promise<string> {
  const client = createS3Client();
  const out = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
  if (!out.UploadId) {
    throw new Error("CreateMultipartUpload returned no UploadId");
  }
  return out.UploadId;
}

export async function presignUploadPart(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  const client = createS3Client();
  const command = new UploadPartCommand({
    Bucket: getBucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

export async function listUploadedParts(
  key: string,
  uploadId: string,
): Promise<Array<{ PartNumber: number; ETag: string }>> {
  const client = createS3Client();
  const parts: Array<{ PartNumber: number; ETag: string }> = [];
  let marker: string | undefined;
  for (;;) {
    const out = await client.send(
      new ListPartsCommand({
        Bucket: getBucket(),
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: marker,
      }),
    );
    for (const p of out.Parts ?? []) {
      if (p.PartNumber != null && p.ETag) {
        parts.push({ PartNumber: p.PartNumber, ETag: p.ETag });
      }
    }
    if (!out.IsTruncated) {
      break;
    }
    marker = out.NextPartNumberMarker;
  }
  return parts.sort((a, b) => a.PartNumber - b.PartNumber);
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ PartNumber: number; ETag: string }>,
): Promise<void> {
  const client = createS3Client();
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({
          PartNumber: p.PartNumber,
          ETag: p.ETag,
        })),
      },
    }),
  );
}

export async function abortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<void> {
  const client = createS3Client();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
    }),
  );
}
