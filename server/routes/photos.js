import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { storage } from '../storage/index.js';
import { broadcast } from '../sse.js';
import { ownerId, isHost } from '../eventAuth.js';

const router = Router();

// Whether a non-host guest may view the album right now (gallery enabled, and
// — for "reveal after" events — only once the event has ended).
function guestsMaySee(e) {
  if (!(e.guests_can_view == null ? true : !!e.guests_can_view)) return false;
  if ((e.reveal || 'instant') === 'after') {
    if (!e.ends_at || Date.now() < Number(e.ends_at)) return false;
  }
  return true;
}

const IMG_EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };
const VID_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const isVideoMime = (m) => config.allowedVideoMime.includes(m);
const isImageMime = (m) => config.allowedMime.includes(m);

// Stream uploads to disk (or a temp dir, for S3) — never buffer whole files in
// memory — so the server stays flat under a crowd all uploading at once.
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
    if (file.fieldname === 'thumb') {
      cb(null, `${req._photoId}_thumb.${IMG_EXT[file.mimetype] || 'jpg'}`);
    } else {
      const ext = VID_EXT[file.mimetype] || IMG_EXT[file.mimetype] || 'jpg';
      cb(null, `${req._photoId}_full.${ext}`);
    }
  },
});

const upload = multer({
  storage: multerStorage,
  // The 'full' field may be a video, so allow up to the video cap here and
  // enforce the tighter photo/thumb limits after upload.
  limits: { fileSize: config.maxVideoBytes, files: 2 },
  fileFilter(req, file, cb) {
    if (file.fieldname === 'thumb') {
      if (!isImageMime(file.mimetype)) return cb(new Error('Thumbnail must be an image'));
    } else if (!isImageMime(file.mimetype) && !isVideoMime(file.mimetype)) {
      return cb(new Error('Unsupported file type'));
    }
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

// Upload a photo or video (full media + thumbnail, produced on the device).
router.post('/:id/photos', uploadLimiter, (req, res) => {
  fields(req, res, async (err) => {
    if (err) {
      await cleanup(req);
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : err.message;
      return res.status(400).json({ error: msg });
    }

    const e = req._event;
    const full = req.files?.full?.[0];
    const thumb = req.files?.thumb?.[0];
    if (!e || !full) {
      await cleanup(req);
      return res.status(400).json({ error: 'Missing file' });
    }

    const kind = isVideoMime(full.mimetype) ? 'video' : 'photo';
    // Enforce the per-kind size limits (multer's single limit was the video cap).
    if (kind === 'photo' && full.size > config.maxFullBytes) {
      await cleanup(req);
      return res.status(400).json({ error: 'Image too large' });
    }
    if (thumb && thumb.size > config.maxThumbBytes) {
      await cleanup(req);
      return res.status(400).json({ error: 'Thumbnail too large' });
    }

    try {
      await storage().finalize(e.id, [full, ...(thumb ? [thumb] : [])]);

      const hidden = req.body?.hidden === '1' || req.body?.hidden === 'true' ? 1 : 0;
      const photo = {
        id: req._photoId,
        event_id: e.id,
        guest_name: String(req.body?.guestName || '').trim().slice(0, 60) || null,
        owner_id: ownerId(req) || null,
        kind,
        filter: String(req.body?.filter || '').trim().slice(0, 40) || null,
        width: clampInt(req.body?.width),
        height: clampInt(req.body?.height),
        duration: clampInt(req.body?.duration) || null,
        bytes: full.size,
        full_key: full.filename,
        thumb_key: thumb ? thumb.filename : null,
        hidden,
        created_at: Date.now(),
      };
      await db().insertPhotoAndBump(photo);

      const dto = toDto(photo);
      // Only broadcast public photos live, and only when the album is currently
      // viewable by guests (so "reveal after" / gallery-off events don't leak
      // photos over the live stream). The host sees everything on reload.
      if (!hidden && guestsMaySee(e)) broadcast(e.id, 'photo', dto);
      res.status(201).json(dto);
    } catch (e2) {
      await cleanup(req);
      res.status(500).json({ error: 'Could not save upload' });
    }
  });
});

// Paginated album feed, newest first. Cursor = created_at of the last item.
router.get('/:id/photos', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });

  const limit = Math.min(clampInt(req.query.limit) || config.pageSize, config.pageSize);
  const before = clampInt(req.query.before) || Number.MAX_SAFE_INTEGER;

  const host = isHost(req, e);
  // Guests can't load the album when the gallery is off or photos are still
  // hidden until the event's reveal time.
  if (!host && !guestsMaySee(e)) {
    res.set('Cache-Control', 'no-cache');
    return res.json({ items: [], nextCursor: null, total: e.photo_count, locked: true });
  }

  const rows = await db().listPhotos(e.id, before, limit, {
    viewerId: ownerId(req),
    isHost: host,
  });
  const items = rows.map(toDto);
  const nextCursor = rows.length === limit ? Number(rows[rows.length - 1].created_at) : null;
  res.set('Cache-Control', 'no-cache');
  res.json({ items, nextCursor, total: e.photo_count });
});

// Toggle a like (heart) on a photo/video. Identified by the guest's device id.
router.post('/:id/photos/:photoId/like', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const gid = ownerId(req);
  if (!gid) return res.status(400).json({ error: 'Missing guest id' });
  const photo = await db().getPhoto(e.id, req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const r = await db().toggleLike(photo.id, gid);
  broadcast(e.id, 'like', { id: photo.id, likeCount: r.likeCount });
  res.json(r);
});

// Comments.
router.get('/:id/photos/:photoId/comments', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const rows = await db().listComments(req.params.photoId);
  res.set('Cache-Control', 'no-cache');
  res.json({ items: rows.map((c) => ({ id: c.id, name: c.name, text: c.text, createdAt: Number(c.created_at) })) });
});

router.post('/:id/photos/:photoId/comments', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const photo = await db().getPhoto(e.id, req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Empty comment' });
  const c = {
    id: nanoid(16),
    photo_id: photo.id,
    event_id: e.id,
    guest_id: ownerId(req) || null,
    name: String(req.body?.name || req.body?.guestName || '').trim().slice(0, 60) || null,
    text,
    created_at: Date.now(),
  };
  const count = await db().addComment(c);
  const dto = { id: c.id, name: c.name, text: c.text, createdAt: c.created_at };
  broadcast(e.id, 'comment', { id: photo.id, commentCount: count, comment: dto });
  res.status(201).json({ comment: dto, commentCount: count });
});

// Shared DTO builder — the wire shape guests see. Works for both DB backends.
// ownerId is an opaque random device id; the client compares it to its own to
// decide whether to show a "delete my own" button.
export function toDto(p) {
  const s = storage();
  const fullKey = p.full_key;
  const thumbKey = p.thumb_key;
  return {
    id: p.id,
    eventId: p.event_id,
    kind: p.kind || 'photo',
    guestName: p.guest_name,
    ownerId: p.owner_id || null,
    hidden: !!p.hidden,
    filter: p.filter,
    width: p.width,
    height: p.height,
    duration: p.duration || null,
    createdAt: Number(p.created_at),
    likeCount: p.like_count || 0,
    liked: !!p.liked,
    commentCount: p.comment_count || 0,
    url: fullKey ? s.urlFor(p.event_id, fullKey) : null,
    // For videos with no generated poster, leave thumbUrl null so the client
    // shows a play placeholder instead of putting the video file in an <img>.
    thumbUrl: thumbKey
      ? s.urlFor(p.event_id, thumbKey)
      : p.kind === 'video'
        ? null
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
