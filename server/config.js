import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const num = (v, d) => (v === undefined ? d : Number(v));

export const config = {
  root: ROOT,
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),

  // Where SQLite db + uploaded files live (when using the local drivers).
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),

  // Public base URL used to build QR / invite links. In production set this to
  // your real https origin, e.g. https://eventcam.app
  publicUrl: process.env.PUBLIC_URL || '',

  // Upload guard rails. Real image processing happens on the guest's device,
  // so these are just safety limits for the raw bytes we accept.
  maxFullBytes: num(process.env.MAX_FULL_BYTES, 16 * 1024 * 1024), // 16 MB (crisp photos)
  maxThumbBytes: num(process.env.MAX_THUMB_BYTES, 2 * 1024 * 1024), // 2 MB
  maxVideoBytes: num(process.env.MAX_VIDEO_BYTES, 80 * 1024 * 1024), // 80 MB
  allowedMime: (process.env.ALLOWED_MIME || 'image/jpeg,image/png,image/webp').split(','),
  allowedVideoMime: (process.env.ALLOWED_VIDEO_MIME || 'video/mp4,video/webm,video/quicktime').split(','),

  // How many photos a single event page can pull per request.
  pageSize: num(process.env.PAGE_SIZE, 60),

  // Per-IP rate limits. Guests at a real event each have their own IP, so
  // these are per-person. Set the max to 0 to disable a limiter (load testing).
  uploadRateMax: num(process.env.UPLOAD_RATE_MAX, 40),
  uploadRateWindowMs: num(process.env.UPLOAD_RATE_WINDOW_MS, 60 * 1000),
  createRateMax: num(process.env.CREATE_RATE_MAX, 60),

  // ---- Pluggable backends (auto-selected from env) --------------------------

  // Database: Postgres when DATABASE_URL is set, else local SQLite.
  databaseUrl: process.env.DATABASE_URL || '',

  // Object storage: S3-compatible when S3_BUCKET is set, else local filesystem.
  s3: {
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || '', // e.g. https://<account>.r2.cloudflarestorage.com or MinIO
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // MinIO needs this
    // Where the browser fetches photos from (a CDN in front of the bucket, or
    // the bucket's own public URL). Falls back to the endpoint/bucket.
    publicBase: process.env.S3_PUBLIC_BASE || '',
  },

  // Live updates: fan out via Redis pub/sub across instances when set.
  redisUrl: process.env.REDIS_URL || '',

  // ---- Accounts / auth (organizers must log in; guests never do) -----------
  // The site owner: whoever registers with this email is auto-approved and can
  // approve everyone else. Set it before the owner registers.
  ownerEmail: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
  // Secret used to sign login cookies. MUST be set (and stable) in production.
  jwtSecret: process.env.JWT_SECRET || '',
  // Login cookie lifetime.
  sessionDays: num(process.env.SESSION_DAYS, 30),

  isProd() {
    return this.env === 'production';
  },
  usePostgres() {
    return !!this.databaseUrl;
  },
  useS3() {
    return !!this.s3.bucket;
  },
  useRedis() {
    return !!this.redisUrl;
  },
};

export function eventPublicUrl(req, eventId) {
  const base =
    config.publicUrl ||
    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/e/${eventId}`;
}
