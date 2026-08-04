import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/*
 * Storage abstraction.
 *
 * Default: local filesystem under DATA_DIR/uploads/<eventId>/.
 * Good enough for a single box and for development.
 *
 * For the 2000-concurrent-guests scenario you want an S3-compatible object
 * store + CDN instead, so app servers stay stateless and can scale
 * horizontally. To do that, replace the body of the functions below with
 * calls to your object store (and ideally hand out presigned upload URLs so
 * bytes never transit the app server at all). See SCALING.md.
 */

const uploadsRoot = path.join(config.dataDir, 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });

export const UPLOADS_ROOT = uploadsRoot;

export function eventDir(eventId) {
  const dir = path.join(uploadsRoot, eventId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Public URL path the browser uses to fetch an asset.
export function publicPath(eventId, filename) {
  return `/uploads/${eventId}/${filename}`;
}

export function removeEvent(eventId) {
  fs.rmSync(path.join(uploadsRoot, eventId), { recursive: true, force: true });
}
