import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { CreateJobCommand, MediaConvertClient } from "@aws-sdk/client-mediaconvert";
import sharp from "sharp";

const s3 = new S3Client({});
const bucket = process.env.BUCKET;

export const handler = async (event) => {
  for (const record of event.Records ?? []) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const type = object.ContentType ?? "";
    if (type.startsWith("image/")) {
      const source = Buffer.from(await object.Body.transformToByteArray());
      const id = crypto.randomUUID();
      const image = sharp(source).rotate();
      const thumbnail = await image.clone().resize({ width: 600, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
      const output = await image.jpeg({ quality: 90 }).withMetadata().toBuffer();
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `thumbnails/${id}.jpg`, Body: thumbnail, ContentType: "image/jpeg" }));
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `ready/${id}.jpg`, Body: output, ContentType: "image/jpeg" }));
      continue;
    }
    if (type.startsWith("video/")) {
      const mediaConvert = new MediaConvertClient({});
      await mediaConvert.send(new CreateJobCommand({ Role: process.env.MEDIACONVERT_ROLE_ARN, Settings: { Inputs: [{ FileInput: `s3://${bucket}/${key}`, VideoSelector: { Rotate: "AUTO" }, AudioSelectors: { "Audio Selector 1": { DefaultSelection: "DEFAULT" } } }], OutputGroups: [{ OutputGroupSettings: { Type: "FILE_GROUP_SETTINGS", FileGroupSettings: { Destination: `s3://${bucket}/ready/` } }, Outputs: [{ NameModifier: "_video", ContainerSettings: { Container: "MP4", Mp4Settings: { MoovPlacement: "PROGRESSIVE_DOWNLOAD" } }, VideoDescription: { CodecSettings: { Codec: "H_264", H264Settings: { RateControlMode: "QVBR", QvbrSettings: { QvbrQualityLevel: 7 }, MaxBitrate: 8000000, FramerateControl: "INITIALIZE_FROM_SOURCE", ParControl: "INITIALIZE_FROM_SOURCE" } } }, AudioDescriptions: [{ AudioSourceName: "Audio Selector 1", CodecSettings: { Codec: "AAC", AacSettings: { RateControlMode: "CBR", Bitrate: 128000, CodingMode: "CODING_MODE_2_0", SampleRate: 48000 } } }] }] }, { OutputGroupSettings: { Type: "FILE_GROUP_SETTINGS", FileGroupSettings: { Destination: `s3://${bucket}/thumbnails/` } }, Outputs: [{ NameModifier: "_thumbnail", ContainerSettings: { Container: "RAW" }, VideoDescription: { CodecSettings: { Codec: "FRAME_CAPTURE", FrameCaptureSettings: { FramerateNumerator: 1, FramerateDenominator: 1, MaxCaptures: 1, Quality: 80 } } } }] }] } }));
    }
  }
};
