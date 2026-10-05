import { createMultipartUpload, getKeyPrefix } from "@/lib/s3";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { filename?: string };
    const suffix = body.filename?.replace(/[^a-zA-Z0-9._-]/g, "_") ?? "blob.bin";
    const key = `${getKeyPrefix()}${Date.now()}-${suffix}`;
    const uploadId = await createMultipartUpload(key);
    return NextResponse.json({ key, uploadId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
