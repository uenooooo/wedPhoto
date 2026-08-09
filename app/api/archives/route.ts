import { RunTaskCommand, ECSClient } from "@aws-sdk/client-ecs";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { isValidEventKey } from "@/lib/event";
import { bucket, s3 } from "@/lib/s3";

export async function GET(request: NextRequest) {
  if (!isValidEventKey(request.nextUrl.searchParams.get("eventKey"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[a-f0-9-]+$/.test(id)) return NextResponse.json({ error: "不正なZIPです。" }, { status: 400 });
  const key = `archives/${id}.zip`;
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return NextResponse.json({ status: "ready", key });
  } catch {
    return NextResponse.json({ status: "processing" });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isValidEventKey(body.eventKey)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!Array.isArray(body.keys) || body.keys.length === 0 || body.keys.some((key: unknown) => typeof key !== "string" || !key.startsWith("ready/"))) {
    return NextResponse.json({ error: "選択ファイルが不正です。" }, { status: 400 });
  }
  const cluster = process.env.ZIP_CLUSTER_ARN;
  const taskDefinition = process.env.ZIP_TASK_DEFINITION_ARN;
  const subnets = process.env.ZIP_SUBNET_IDS?.split(",").filter(Boolean);
  const securityGroups = process.env.ZIP_SECURITY_GROUP_IDS?.split(",").filter(Boolean);
  if (!cluster || !taskDefinition || !subnets?.length || !securityGroups?.length) {
    return NextResponse.json({ error: "ZIP作成環境が未設定です。" }, { status: 503 });
  }
  const id = crypto.randomUUID();
  const archiveKey = `archives/${id}.zip`;
  try {
    const ecs = new ECSClient({ region: process.env.AWS_REGION ?? "ap-northeast-1" });
    await ecs.send(new RunTaskCommand({
      cluster,
      taskDefinition,
      launchType: "FARGATE",
      networkConfiguration: { awsvpcConfiguration: { subnets, securityGroups, assignPublicIp: "ENABLED" } },
      overrides: { containerOverrides: [{ name: process.env.ZIP_CONTAINER_NAME ?? "zip-worker", environment: [
        { name: "S3_BUCKET", value: bucket },
        { name: "ARCHIVE_KEY", value: archiveKey },
        { name: "MEDIA_KEYS", value: JSON.stringify(body.keys) },
      ] }] },
    }));
    return NextResponse.json({ id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "ZIP作成を開始できませんでした。" }, { status: 500 });
  }
}
