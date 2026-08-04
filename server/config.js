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

  // Where SQLite db + uploaded files live. Point this at a shared/persistent
  // volume in production, or swap storage.js for S3-compatible object storage.
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),

  // Public base URL used to build QR / invite links. In production set this to
  // your real https origin, e.g. https://eventcam.app
  publicUrl: process.env.PUBLIC_URL || '',

  // Upload guard rails. Real image processing happens on the guest's device,
  // so these are just safety limits for the raw bytes we accept.
  maxFullBytes: num(process.env.MAX_FULL_BYTES, 12 * 1024 * 1024), // 12 MB
  maxThumbBytes: num(process.env.MAX_THUMB_BYTES, 2 * 1024 * 1024), // 2 MB
  allowedMime: (process.env.ALLOWED_MIME || 'image/jpeg,image/png,image/webp').split(','),

  // How many photos a single event page can pull per request.
  pageSize: num(process.env.PAGE_SIZE, 60),

  // Per-IP rate limits. Guests at a real event each have their own IP, so
  // these are per-person. Set the max to 0 to disable a limiter entirely
  // (useful for single-IP load testing).
  uploadRateMax: num(process.env.UPLOAD_RATE_MAX, 40), // per window, per IP
  uploadRateWindowMs: num(process.env.UPLOAD_RATE_WINDOW_MS, 60 * 1000),
  createRateMax: num(process.env.CREATE_RATE_MAX, 60), // per hour, per IP

  isProd() {
    return this.env === 'production';
  },
};

export function eventPublicUrl(req, eventId) {
  const base =
    config.publicUrl ||
    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/e/${eventId}`;
}
