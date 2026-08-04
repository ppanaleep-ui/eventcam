import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.js';
import { UPLOADS_ROOT } from './storage.js';
import { connectionCount } from './sse.js';
import eventsRouter from './routes/events.js';
import photosRouter from './routes/photos.js';

const app = express();
app.set('trust proxy', 1); // honour X-Forwarded-* behind a load balancer / CDN

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '64kb' }));

// Health check for load balancers / uptime monitors.
app.get('/healthz', (req, res) =>
  res.json({ ok: true, sseConnections: connectionCount(), uptime: process.uptime() })
);

// Serve uploaded photos. Immutable filenames => aggressive caching. Put a CDN
// in front of this path in production and these headers do the heavy lifting.
app.use(
  '/uploads',
  express.static(UPLOADS_ROOT, {
    immutable: true,
    maxAge: '30d',
    fallthrough: false,
  })
);

// API
app.use('/api/events', eventsRouter);
app.use('/api/events', photosRouter);

// Serve the built client (production) and let the SPA handle client routes.
const clientDist = path.join(config.root, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Central error handler (keeps multer/other errors JSON, not HTML).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(config.port, () => {
  console.log(`EventCam server listening on http://localhost:${config.port} [${config.env}]`);
  if (!fs.existsSync(clientDist) && config.isProd()) {
    console.warn('client/dist not found — run `npm run build` before starting in production.');
  }
});
