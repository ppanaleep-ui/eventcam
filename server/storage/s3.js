import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';

/*
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, Backblaze B2...).
 *
 * multer writes uploads to a temp dir; finalize() streams them to the bucket
 * and deletes the temp files, so app instances stay stateless and any of them
 * can serve any event. Photos are read by the browser from S3_PUBLIC_BASE
 * (ideally a CDN), not from this process.
 *
 * `@aws-sdk/client-s3` is imported dynamically so it's only loaded when S3 is
 * actually configured. For the biggest scale win, hand out presigned PUT URLs
 * so bytes skip the app server entirely — see SCALING.md.
 */

const tmpRoot = path.join(os.tmpdir(), 'eventcam-uploads');
fs.mkdirSync(tmpRoot, { recursive: true });

export async function createS3Storage() {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import(
    '@aws-sdk/client-s3'
  );

  const client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint || undefined,
    forcePathStyle: config.s3.forcePathStyle,
    credentials:
      config.s3.accessKeyId && config.s3.secretAccessKey
        ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
        : undefined,
  });

  const bucket = config.s3.bucket;
  const objectKey = (eventId, key) => `${eventId}/${key}`;

  const publicBase =
    config.s3.publicBase ||
    (config.s3.endpoint
      ? `${config.s3.endpoint.replace(/\/$/, '')}/${bucket}`
      : `https://${bucket}.s3.${config.s3.region}.amazonaws.com`);

  return {
    kind: 's3',
    servesStatically: false,

    destinationDir(eventId) {
      const dir = path.join(tmpRoot, eventId);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },

    // Upload each temp file to the bucket, then remove the temp copy.
    async finalize(eventId, files) {
      for (const f of files) {
        const body = fs.createReadStream(f.path);
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey(eventId, f.filename),
            Body: body,
            ContentType: f.mimetype,
            CacheControl: 'public, max-age=2592000, immutable',
          })
        );
        await fs.promises.rm(f.path, { force: true });
      }
    },

    urlFor(eventId, key) {
      return `${publicBase.replace(/\/$/, '')}/${objectKey(eventId, key)}`;
    },

    async readStream(eventId, key) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey(eventId, key) })
      );
      return res.Body; // a Node Readable stream
    },

    async remove(eventId, key) {
      if (!key) return;
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(eventId, key) })
      );
    },
  };
}
