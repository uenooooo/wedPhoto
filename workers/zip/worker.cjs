const path = require("node:path");
const { createReadStream, createWriteStream } = require("node:fs");
const { once } = require("node:events");
const archiver = require("archiver");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const bucket = process.env.S3_BUCKET;
const archiveKey = process.env.ARCHIVE_KEY;
const mediaKeys = JSON.parse(process.env.MEDIA_KEYS ?? "[]");
if (!bucket || !archiveKey || !mediaKeys.length) throw new Error("ZIP worker environment is invalid.");

const client = new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-1" });
const archive = archiver("zip", { zlib: { level: 0 } }); // JPEG/MP4は再圧縮してもほぼ小さくならない
const archivePath = "/tmp/archive.zip";
const output = createWriteStream(archivePath);
archive.pipe(output);

(async () => {
  const archiveWritten = once(output, "close");
  for (const key of mediaKeys) {
    if (typeof key !== "string" || !key.startsWith("ready/")) throw new Error("Invalid media key.");
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    archive.append(object.Body, { name: path.basename(key) });
  }
  archive.finalize();
  await archiveWritten;
  await new Upload({ client, params: { Bucket: bucket, Key: archiveKey, Body: createReadStream(archivePath), ContentType: "application/zip" } }).done();
})().catch((error) => { console.error(error); process.exitCode = 1; });
