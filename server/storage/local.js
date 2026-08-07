import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/*
 * Local filesystem storage. multer writes uploads straight into the event's
 * directory with their final key as the filename, so finalize() is a no-op.
 */

const uploadsRoot = path.join(config.dataDir, 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });

export function createLocalStorage() {
  return {
    kind: 'local',
    // Whether the app process serves photo bytes (true here; false for S3+CDN).
    servesStatically: true,
    uploadsRoot,

    // Directory multer should write an event's files into.
    destinationDir(eventId) {
      const dir = path.join(uploadsRoot, eventId);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },

    // Files are already in place after multer; nothing to move/upload.
    async finalize() {},

    // Public URL the browser uses to fetch a stored object.
    urlFor(eventId, key) {
      return `/uploads/${eventId}/${key}`;
    },

    async readStream(eventId, key) {
      return fs.createReadStream(path.join(uploadsRoot, eventId, key));
    },

    async remove(eventId, key) {
      if (!key) return;
      await fs.promises.rm(path.join(uploadsRoot, eventId, key), { force: true });
    },

    // Drop the whole event folder in one go.
    async removeEvent(eventId) {
      await fs.promises.rm(path.join(uploadsRoot, eventId), { recursive: true, force: true });
    },
  };
}
