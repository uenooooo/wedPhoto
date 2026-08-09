import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { isValidEventKey } from "@/lib/event";
import { bucket, s3 } from "@/lib/s3";

export async function GET(request: NextRequest) {
  if (!isValidEventKey(request.nextUrl.searchParams.get("eventKey"))) return new NextResponse(null, { status: 404 });
  const key = request.nextUrl.searchParams.get("key");
  if (!key || (!key.startsWith("ready/") && !key.startsWith("archives/"))) return new NextResponse(null, { status: 400 });
  const filename = key.split("/").pop()?.replace(/[^a-zA-Z0-9._-]/g, "_") || "download";
  const url = await getSignedUrl(s3(), new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  }), { expiresIn: 300 });
  return NextResponse.redirect(url);
}
