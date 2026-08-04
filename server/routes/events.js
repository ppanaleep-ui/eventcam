import { Router } from 'express';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import rateLimit from 'express-rate-limit';
import archiver from 'archiver';
import { config, eventPublicUrl } from '../config.js';
import { db } from '../db/index.js';
import { storage } from '../storage/index.js';
import { subscribe, broadcast } from '../sse.js';

const router = Router();

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: config.createRateMax || 1,
  skip: () => config.createRateMax === 0,
  standardHeaders: true,
  legacyHeaders: false,
});

function publicEvent(e) {
  return {
    id: e.id,
    name: e.name,
    hostName: e.host_name,
    createdAt: Number(e.created_at),
    photoCount: e.photo_count,
  };
}

// Host auth: the admin token is handed to the creator once and stored on their
// device. Timing-safe-ish compare of an opaque random token.
function adminToken(req) {
  return req.get('x-admin-token') || req.query.token || '';
}
function isHost(req, event) {
  const t = adminToken(req);
  return !!t && !!event.admin_token && t === event.admin_token;
}

// Create an event.
router.post('/', createLimiter, async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80) || 'Untitled Event';
  const hostName = String(req.body?.hostName || '').trim().slice(0, 60) || null;

  const event = {
    id: nanoid(10),
    name,
    host_name: hostName,
    admin_token: nanoid(24),
    created_at: Date.now(),
  };
  await db().createEvent(event);

  res.status(201).json({
    ...publicEvent({ ...event, photo_count: 0 }),
    adminToken: event.admin_token, // returned once, to the creator only
    joinUrl: eventPublicUrl(req, event.id),
  });
});

// Public event info. Includes `isHost` so the client can reveal host controls.
router.get('/:id', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  res.json({ ...publicEvent(e), isHost: isHost(req, e), joinUrl: eventPublicUrl(req, e.id) });
});

// QR code for the invite link, as an SVG.
router.get('/:id/qr', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const svg = await QRCode.toString(eventPublicUrl(req, e.id), {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0a0a0a', light: '#ffffff' },
  });
  res.type('image/svg+xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

// Live feed of new photos (and deletions) for this event.
router.get('/:id/stream', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  subscribe(e.id, res);
});

// ---- Host-only controls ---------------------------------------------------

// Delete a photo. Broadcasts a `delete` so it disappears for everyone live.
router.delete('/:id/photos/:photoId', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  if (!isHost(req, e)) return res.status(403).json({ error: 'Host only' });

  const removed = await db().deletePhotoAndDec(e.id, req.params.photoId);
  if (!removed) return res.status(404).json({ error: 'Photo not found' });

  // Best-effort blob cleanup — the DB row is already gone.
  try {
    await storage().remove(e.id, removed.full_key);
    if (removed.thumb_key) await storage().remove(e.id, removed.thumb_key);
  } catch {}

  broadcast(e.id, 'delete', { id: removed.id });
  res.json({ ok: true, id: removed.id });
});

// Download the whole album as a streamed ZIP (host only).
router.get('/:id/download', async (req, res) => {
  const e = await db().getEvent(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  if (!isHost(req, e)) return res.status(403).json({ error: 'Host only' });

  const photos = await db().listAllPhotos(e.id);
  const safeName = (e.name || 'event').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'event';

  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="eventcam-${safeName}.zip"`,
  });

  const archive = archiver('zip', { zlib: { level: 0 } }); // JPEGs are already compressed
  archive.on('error', () => res.destroy());
  archive.pipe(res);

  let i = 1;
  for (const p of photos) {
    if (!p.full_key) continue;
    try {
      const stream = await storage().readStream(e.id, p.full_key);
      const who = (p.guest_name || 'guest').replace(/[^\w\-]+/g, '_').slice(0, 24);
      archive.append(stream, { name: `${String(i).padStart(4, '0')}_${who}.jpg` });
      i++;
    } catch {
      // Skip any object that can't be read rather than failing the whole zip.
    }
  }
  await archive.finalize();
});

export default router;
