import { listUploadedParts } from "@/lib/s3";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    const uploadId = searchParams.get("uploadId");
    if (!key || !uploadId) {
      return NextResponse.json(
        { error: "key and uploadId query params required" },
        { status: 400 },
      );
    }
    const parts = await listUploadedParts(key, uploadId);
    return NextResponse.json({ parts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "list failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
