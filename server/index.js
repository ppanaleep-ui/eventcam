import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { initStorage, storage } from './storage/index.js';
import { initSse, connectionCount } from './sse.js';
import eventsRouter from './routes/events.js';
import photosRouter from './routes/photos.js';

async function main() {
  // Bring up the pluggable backends before we accept traffic.
  await initDb();
  await initStorage();
  await initSse();

  const app = express();
  app.set('trust proxy', 1); // honour X-Forwarded-* behind a load balancer / CDN

  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (req, res) =>
    res.json({
      ok: true,
      db: config.usePostgres() ? 'postgres' : 'sqlite',
      storage: storage().kind,
      sse: config.useRedis() ? 'redis' : 'local',
      sseConnections: connectionCount(),
      uptime: process.uptime(),
    })
  );

  // Serve uploaded photos locally only when using filesystem storage. With S3,
  // the browser fetches straight from the bucket/CDN and this app never does.
  if (storage().servesStatically) {
    app.use(
      '/uploads',
      express.static(storage().uploadsRoot, { immutable: true, maxAge: '30d', fallthrough: false })
    );
  }

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
}

main().catch((err) => {
  console.error('Failed to start EventCam:', err);
  process.exit(1);
});
