/**
 * Browser-side sketch for S4 lab: multipart via presigned PUT + resume via ListParts.
 * Not production-hardened (no checksum policy, minimal error UX).
 */

export type CompletedPart = { PartNumber: number; ETag: string };

export type MultipartSession = {
  key: string;
  uploadId: string;
  partSizeBytes: number;
};

export async function startMultipart(
  filename: string,
  partSizeBytes: number,
): Promise<MultipartSession> {
  const res = await fetch("/api/multipart/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const { key, uploadId } = (await res.json()) as {
    key: string;
    uploadId: string;
  };
  return { key, uploadId, partSizeBytes };
}

export async function listRemoteParts(
  key: string,
  uploadId: string,
): Promise<CompletedPart[]> {
  const q = new URLSearchParams({ key, uploadId });
  const res = await fetch(`/api/multipart/list-parts?${q}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const data = (await res.json()) as { parts: CompletedPart[] };
  return data.parts;
}

async function presignPart(
  key: string,
  uploadId: string,
  partNumber: number,
): Promise<string> {
  const res = await fetch("/api/multipart/presign-part", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, uploadId, partNumber }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}

export async function uploadPart(
  url: string,
  partNumber: number,
  body: Blob,
): Promise<CompletedPart> {
  const put = await fetch(url, { method: "PUT", body });
  if (!put.ok) {
    throw new Error(`PUT part failed: ${put.status}`);
  }
  const etag = put.headers.get("ETag");
  if (!etag) {
    throw new Error(
      "Missing ETag response header (check MinIO CORS ExposeHeaders)",
    );
  }
  return { PartNumber: partNumber, ETag: etag };
}

export async function uploadFileMultipart(
  file: Blob,
  filename: string,
  session: MultipartSession,
  options?: {
    onProgress?: (doneParts: number, totalParts: number) => void;
    simulateCutAfterPart?: number;
  },
): Promise<{ key: string; parts: CompletedPart[] }> {
  const totalParts = Math.max(1, Math.ceil(file.size / session.partSizeBytes));
  let completed = await listRemoteParts(session.key, session.uploadId);
  const doneNumbers = new Set(completed.map((p) => p.PartNumber));

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    if (doneNumbers.has(partNumber)) {
      options?.onProgress?.(doneNumbers.size, totalParts);
      continue;
    }

    if (options?.simulateCutAfterPart === partNumber) {
      throw new Error("SIMULATED_NETWORK_CUT");
    }

    const start = (partNumber - 1) * session.partSizeBytes;
    const end = Math.min(start + session.partSizeBytes, file.size);
    const chunk = file.slice(start, end);
    const url = await presignPart(session.key, session.uploadId, partNumber);
    const part = await uploadPart(url, partNumber, chunk);
    completed.push(part);
    doneNumbers.add(partNumber);
    options?.onProgress?.(doneNumbers.size, totalParts);
  }

  completed = completed.sort((a, b) => a.PartNumber - b.PartNumber);
  const res = await fetch("/api/multipart/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: session.key,
      uploadId: session.uploadId,
      parts: completed,
    }),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return { key: session.key, parts: completed };
}
