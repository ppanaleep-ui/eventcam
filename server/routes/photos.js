import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { config } from '../config.js';
import { eventDir, publicPath } from '../storage.js';
import { broadcast } from '../sse.js';

const router = Router();

const getEvent = db.prepare(`SELECT * FROM events WHERE id = ?`);
const insertPhoto = db.prepare(
  `INSERT INTO photos (id, event_id, guest_name, filter, width, height, bytes, created_at)
   VALUES (@id, @event_id, @guest_name, @filter, @width, @height, @bytes, @created_at)`
);
const bumpCount = db.prepare(
  `UPDATE events SET photo_count = photo_count + 1 WHERE id = ?`
);

// Stream uploads straight to disk (never buffer whole images in memory) so the
// server stays flat under a crowd all snapping at once.
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const e = getEvent.get(req.params.id);
    if (!e) return cb(new Error('Event not found'));
    req._event = e;
    req._photoId = req._photoId || nanoid(16);
    cb(null, eventDir(e.id));
  },
  filename(req, file, cb) {
    const kind = file.fieldname === 'thumb' ? 'thumb' : 'full';
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    cb(null, `${req._photoId}_${kind}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxFullBytes, files: 2 },
  fileFilter(req, file, cb) {
    if (!config.allowedMime.includes(file.mimetype)) {
      return cb(new Error('Unsupported image type'));
    }
    cb(null, true);
  },
});

// Per-IP upload throttle. Generous enough for a genuine guest firing off shots,
// tight enough to blunt a script. Set UPLOAD_RATE_MAX=0 to disable.
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
  fields(req, res, (err) => {
    if (err) {
      // Clean up any partial file that made it to disk.
      cleanup(req);
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image too large' : err.message;
      return res.status(400).json({ error: msg });
    }

    const e = req._event;
    const full = req.files?.full?.[0];
    const thumb = req.files?.thumb?.[0];
    if (!e || !full) {
      cleanup(req);
      return res.status(400).json({ error: 'Missing image' });
    }
    if (thumb && thumb.size > config.maxThumbBytes) {
      cleanup(req);
      return res.status(400).json({ error: 'Thumbnail too large' });
    }

    const guestName = String(req.body?.guestName || '').trim().slice(0, 60) || null;
    const filter = String(req.body?.filter || '').trim().slice(0, 40) || null;
    const width = clampInt(req.body?.width);
    const height = clampInt(req.body?.height);

    const photo = {
      id: req._photoId,
      event_id: e.id,
      guest_name: guestName,
      filter,
      width,
      height,
      bytes: full.size,
      created_at: Date.now(),
    };

    const tx = db.transaction(() => {
      insertPhoto.run(photo);
      bumpCount.run(e.id);
    });
    tx();

    const dto = toDto(photo, full, thumb);
    broadcast(e.id, 'photo', dto);
    res.status(201).json(dto);
  });
});

// Paginated album feed, newest first. Cursor = created_at of the last item.
router.get('/:id/photos', (req, res) => {
  const e = getEvent.get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });

  const limit = Math.min(clampInt(req.query.limit) || config.pageSize, config.pageSize);
  const before = clampInt(req.query.before) || Number.MAX_SAFE_INTEGER;

  const rows = db
    .prepare(
      `SELECT * FROM photos
       WHERE event_id = ? AND created_at < ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(e.id, before, limit);

  const items = rows.map((r) => toDto(r));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
  res.set('Cache-Control', 'no-cache');
  res.json({ items, nextCursor, total: e.photo_count });
});

function toDto(p, full, thumb) {
  const fullName = full ? full.filename : findFile(p.event_id, p.id, 'full');
  const thumbName = thumb ? thumb.filename : findFile(p.event_id, p.id, 'thumb');
  return {
    id: p.id,
    eventId: p.event_id,
    guestName: p.guest_name,
    filter: p.filter,
    width: p.width,
    height: p.height,
    createdAt: p.created_at,
    url: fullName ? publicPath(p.event_id, fullName) : null,
    thumbUrl: thumbName ? publicPath(p.event_id, thumbName) : fullName ? publicPath(p.event_id, fullName) : null,
  };
}

// On the read path we don't know the stored extension, so probe the few we allow.
function findFile(eventId, photoId, kind) {
  for (const ext of ['jpg', 'webp', 'png']) {
    const name = `${photoId}_${kind}.${ext}`;
    if (fs.existsSync(path.join(eventDir(eventId), name))) return name;
  }
  return null;
}

function cleanup(req) {
  const all = [
    ...(req.files?.full || []),
    ...(req.files?.thumb || []),
  ];
  for (const f of all) fs.rm(f.path, { force: true }, () => {});
}

function clampInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default router;
