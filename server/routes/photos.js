import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { storage } from '../storage/index.js';
import { broadcast } from '../sse.js';

const router = Router();

// Stream uploads to disk (or a temp dir, for S3) — never buffer whole images in
// memory — so the server stays flat under a crowd all snapping at once.
const multerStorage = multer.diskStorage({
  async destination(req, file, cb) {
    try {
      const e = await db().getEvent(req.params.id);
      if (!e) return cb(new Error('Event not found'));
      req._event = e;
      req._photoId = req._photoId || nanoid(16);
      cb(null, storage().destinationDir(e.id));
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    const kind = file.fieldname === 'thumb' ? 'thumb' : 'full';
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    cb(null, `${req._photoId}_${kind}.${ext}`);
  },
});

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: config.maxFullBytes, files: 2 },
  fileFilter(req, file, cb) {
    if (!config.allowedMime.includes(file.mimetype)) return cb(new Error('Unsupported image type'));
    cb(null, true);
  },
});

// Per-IP upload throttle. Set UPLOAD_RATE_MAX=0 to disable.
const uploadLimiter = rateLimit({
  windowMs: config.uploadRateWindowMs,
  max: config.uploadRateMax || 1,
  skip: () => config.uploadRateMax === 0,
  standardHeaders: true,
  legacyHeaders: false,
});

const fields = upload.fields([
  { name: 'full', maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);

// Upload a photo (full + thumbnail, both produced on the guest's device).
router.post('/:id/photos', uploadLimiter, (req, res) => {
  fields(req, res, async (err) => {
    if (err) {
      await cleanup(req);
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image too large' : err.message;
      return res.status(400).json({ error: msg });
    }

    const e = req._event;
    const full = req.files?.full?.[0];
    const thumb = req.files?.thumb?.[0];
    if (!e || !full) {
      await cleanup(req);
      return res.status(400).json({ error: 'Missing image' });
    }
    if (thumb && thumb.size > config.maxThumbBytes) {
      await cleanup(req);
      return res.status(400).json({ error: 'Thumbnail too large' });
    }

    try {
      // Push bytes to their final home (no-op for local, upload for S3).
      await storage().finalize(e.id, [full, ...(thumb ? [thumb] : [])]);

      const photo = {
        id: req._photoId,
        event_id: e.id,
        guest_name: String(req.body?.guestName || '').trim().slice(0, 60) || null,
        filter: String(req.body?.filter || '').trim().slice(0, 40) || null,
        width: clampInt(req.body?.width),
        height: clampInt(req.body?.height),
        bytes: full.size,
        full_key: full.filename,
        thumb_key: thumb ? thumb.filename : null,
        created_at: Date.now(),
      };
      await db().insertPhotoAndBump(photo);

      const dto = toDto(photo);
      broadcast(e.id, 'photo', dto);
      res.status(201).json(dto);
    } catch (e2) {
      await cleanup(req);
      res.status(500).json({ error: 'Could not save photo' });
    }
  });
});

// Paginated album feed, newest first. Cursor = created_at of the last item.
router.get('/:id/photos', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });

  const limit = Math.min(clampInt(req.query.limit) || config.pageSize, config.pageSize);
  const before = clampInt(req.query.before) || Number.MAX_SAFE_INTEGER;

  const rows = await db().listPhotos(e.id, before, limit);
  const items = rows.map(toDto);
  const nextCursor = rows.length === limit ? Number(rows[rows.length - 1].created_at) : null;
  res.set('Cache-Control', 'no-cache');
  res.json({ items, nextCursor, total: e.photo_count });
});

// Shared DTO builder — the wire shape guests see. Works for both DB backends.
export function toDto(p) {
  const s = storage();
  const fullKey = p.full_key;
  const thumbKey = p.thumb_key;
  return {
    id: p.id,
    eventId: p.event_id,
    guestName: p.guest_name,
    filter: p.filter,
    width: p.width,
    height: p.height,
    createdAt: Number(p.created_at),
    url: fullKey ? s.urlFor(p.event_id, fullKey) : null,
    thumbUrl: thumbKey
      ? s.urlFor(p.event_id, thumbKey)
      : fullKey
        ? s.urlFor(p.event_id, fullKey)
        : null,
  };
}

async function cleanup(req) {
  const all = [...(req.files?.full || []), ...(req.files?.thumb || [])];
  for (const f of all) {
    try {
      await fs.promises.rm(f.path, { force: true });
    } catch {}
  }
}

function clampInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default router;
