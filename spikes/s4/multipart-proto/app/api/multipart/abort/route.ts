import { abortMultipartUpload } from "@/lib/s3";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { key?: string; uploadId?: string };
    const { key, uploadId } = body;
    if (!key || !uploadId) {
      return NextResponse.json(
        { error: "key and uploadId required" },
        { status: 400 },
      );
    }
    await abortMultipartUpload(key, uploadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "abort failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
