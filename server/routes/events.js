import { Router } from 'express';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { config, eventPublicUrl } from '../config.js';
import { subscribe } from '../sse.js';

const router = Router();

// Creating events is the only genuinely "write once" endpoint that isn't a
// photo upload, so guard it against abuse. `skip` disables it when max is 0.
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: config.createRateMax || 1,
  skip: () => config.createRateMax === 0,
  standardHeaders: true,
  legacyHeaders: false,
});

const insertEvent = db.prepare(
  `INSERT INTO events (id, name, host_name, admin_token, created_at)
   VALUES (@id, @name, @host_name, @admin_token, @created_at)`
);
const getEvent = db.prepare(`SELECT * FROM events WHERE id = ?`);

function publicEvent(e) {
  return {
    id: e.id,
    name: e.name,
    hostName: e.host_name,
    createdAt: e.created_at,
    photoCount: e.photo_count,
  };
}

// Create an event.
router.post('/', createLimiter, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80) || 'Untitled Event';
  const hostName = String(req.body?.hostName || '').trim().slice(0, 60) || null;

  const event = {
    id: nanoid(10),
    name,
    host_name: hostName,
    admin_token: nanoid(24),
    created_at: Date.now(),
  };
  insertEvent.run(event);

  // admin_token is returned exactly once, to the creator, so they can manage
  // the event later. It is never exposed on the public event endpoint.
  res.status(201).json({
    ...publicEvent({ ...event, photo_count: 0 }),
    adminToken: event.admin_token,
    joinUrl: eventPublicUrl(req, event.id),
  });
});

// Public event info (used by every guest that opens the link).
router.get('/:id', (req, res) => {
  const e = getEvent.get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  res.json({ ...publicEvent(e), joinUrl: eventPublicUrl(req, e.id) });
});

// QR code for the invite link, as an SVG (crisp at any size, tiny payload).
router.get('/:id/qr', async (req, res) => {
  const e = getEvent.get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found' });
  const url = eventPublicUrl(req, e.id);
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0a0a0a', light: '#ffffff' },
  });
  res.type('image/svg+xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});

// Live feed of new photos for this event.
router.get('/:id/stream', (req, res) => {
  const e = getEvent.get(req.params.id);
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

export default router;
