import { completeMultipartUpload } from "@/lib/s3";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      key?: string;
      uploadId?: string;
      parts?: Array<{ PartNumber: number; ETag: string }>;
    };
    const { key, uploadId, parts } = body;
    if (!key || !uploadId || !parts?.length) {
      return NextResponse.json(
        { error: "key, uploadId, parts required" },
        { status: 400 },
      );
    }
    await completeMultipartUpload(key, uploadId, parts);
    return NextResponse.json({ ok: true, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "complete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
