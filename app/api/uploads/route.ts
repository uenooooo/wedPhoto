import { CompleteMultipartUploadCommand, CreateMultipartUploadCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextRequest, NextResponse } from "next/server";
import { isValidEventKey } from "@/lib/event";
import { bucket, s3 } from "@/lib/s3";

const partSize = 10 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "upload";
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isValidEventKey(body.eventKey)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!body.name || !body.type) return NextResponse.json({ error: "ファイル情報が不正です。" }, { status: 400 });
  if (typeof body.type !== "string" || (!body.type.startsWith("image/") && !body.type.startsWith("video/"))) {
    return NextResponse.json({ error: "写真または動画を選択してください。" }, { status: 400 });
  }
  const key = body.key ?? `uploads/${crypto.randomUUID()}-${safeName(body.name)}`;
  try {
    if (body.action === "start") {
      const result = await s3().send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: body.type }));
      return NextResponse.json({ key, uploadId: result.UploadId, partSize });
    }
    if (body.action === "part") {
      const command = new UploadPartCommand({ Bucket: bucket, Key: body.key, UploadId: body.uploadId, PartNumber: body.partNumber });
      return NextResponse.json({ url: await getSignedUrl(s3(), command, { expiresIn: 900 }) });
    }
    if (body.action === "complete") {
      await s3().send(new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: body.key,
        UploadId: body.uploadId,
        MultipartUpload: { Parts: body.parts },
      }));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "操作が不正です。" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "アップロードの準備に失敗しました。" }, { status: 500 });
  }
}
