import { presignUploadPart } from "@/lib/s3";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      key?: string;
      uploadId?: string;
      partNumber?: number;
    };
    const { key, uploadId, partNumber } = body;
    if (!key || !uploadId || partNumber == null || partNumber < 1) {
      return NextResponse.json(
        { error: "key, uploadId, partNumber required" },
        { status: 400 },
      );
    }
    const url = await presignUploadPart(key, uploadId, partNumber);
    return NextResponse.json({ url, partNumber });
  } catch (error) {
    const message = error instanceof Error ? error.message : "presign failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
