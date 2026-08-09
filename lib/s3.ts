import { S3Client } from "@aws-sdk/client-s3";

export const bucket = process.env.S3_BUCKET;

export function s3() {
  if (!bucket) throw new Error("S3_BUCKET is not configured");
  return new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-1" });
}
