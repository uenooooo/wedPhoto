import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { isValidEventKey } from "@/lib/event";
import { bucket, s3 } from "@/lib/s3";

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const videoExtensions = new Set(["mp4", "webm", "mov"]);

export async function GET(request: NextRequest) {
  if (!isValidEventKey(request.nextUrl.searchParams.get("eventKey"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const output = await s3().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "ready/" }));
    const items = (output.Contents ?? []).flatMap((object) => {
      const key = object.Key;
      if (!key || key.endsWith(".json")) return [];
      const extension = key.split(".").pop()?.toLowerCase() ?? "";
      const type = imageExtensions.has(extension) ? "image" : videoExtensions.has(extension) ? "video" : null;
      if (!type) return [];
      const url = `https://${bucket}.s3.${process.env.AWS_REGION ?? "ap-northeast-1"}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;
      return [{ key, type, createdAt: object.LastModified?.toISOString() ?? "", url, thumbnailUrl: type === "image" ? url.replace("/ready/", "/thumbnails/") : undefined }];
    });
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ items });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "一覧を読み込めませんでした。" }, { status: 500 });
  }
}
