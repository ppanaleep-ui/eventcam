# 📷 EventCam — Digital Disposable Camera

A real, working web app that turns any event into a shared, live photo album —
the same idea as **Party Cam**. Guests scan a QR code, open a link (no app
download), snap photos with retro film filters right in the browser, and every
shot lands instantly in one collaborative album that updates live for everyone.

Built to stay flat and stable with **2,000+ guests using it at the same time**.

---

## Why it scales to a full wedding / festival crowd

The load pattern at a real event is lopsided: a huge number of people connected,
a steady trickle of uploads, and lots of album browsing. EventCam is designed
around that:

| Concern | Design choice |
| --- | --- |
| **Image processing** (the expensive part) | Done **100% on the guest's phone** via `<canvas>`. Filters, resizing, and thumbnail generation never touch the server — the CPU cost is spread across every device in the room. |
| **App servers** | Stateless. No sessions, no in-memory per-user state → run as many instances behind a load balancer as you like. |
| **Live updates** | Server-Sent Events (one cheap, one-way, auto-reconnecting HTTP stream per guest) instead of chatty websockets. |
| **Album bandwidth** | The grid loads small **thumbnails** (~420px), full images only on tap. |
| **Photo delivery** | Uploaded files have immutable names and long cache headers → drop a CDN in front and it serves the photos, not your app. |
| **Reads** | SQLite in WAL mode (dev) / Postgres (prod) with an index on `(event_id, created_at)`; the album feed is a keyset-paginated query. |

A single Node process handled a **2,000-concurrent-guest burst (6,000 requests)
with zero failures** in testing — see [Load testing](#load-testing). Horizontal
scaling + object storage + CDN is what takes it from "works" to "works at a
festival"; see **[SCALING.md](./SCALING.md)**.

---

## Features

- **Scan & join** — one QR code / link, works on any phone, no install.
- **In-browser camera** — front/back switch, live filter preview.
- **Retro film filters** — Classic, '90s (with date stamp), Noir, Sunwash light
  leak, Polaroid frame — grain, vignette and warmth included.
- **Live shared album** — new photos appear for everyone in real time (with an
  automatic polling fallback if the live connection can't hold).
- **Save & share** — download or native-share any photo.
- **Guest names** — remembered per device, no accounts or logins.
- **Host controls** — whoever creates the event can delete any photo (it
  disappears for everyone live) and download the whole album as a ZIP. Host
  access is an opaque token kept on the creator's device — no admin login.

---

## Quick start

```bash
npm install          # installs server + client (npm workspaces)
npm run dev          # server on :3000, Vite client on :5173
```

Open <http://localhost:5173>, create an event, and you'll get a QR code to
share.

> **Camera note:** browsers only allow the camera on `https://` or
> `http://localhost`. On your laptop, localhost works. To test on a phone on
> your LAN, put it behind an HTTPS tunnel (e.g. `cloudflared tunnel`,
> `ngrok http 5173`) and open that URL on the phone.

### Production build

```bash
npm run build        # builds the client into client/dist
npm start            # Express serves the API + the built client on :3000
```

Configure via environment variables — copy `.env.example` to `.env`. Set
`PUBLIC_URL` to your real https origin so QR/invite links are correct.

---

## How it works

```
Guest phone                         App server (stateless)          Storage
───────────                         ──────────────────────          ───────
getUserMedia → <canvas> filter
  → full JPEG + thumb JPEG  ──POST──▶ validate + stream to disk ───▶ /uploads
                                     write row to DB           ───▶ SQLite/PG
                                     broadcast via SSE ──┐
album (thumbnails) ◀──────GET────────  keyset query      │
live new photos    ◀──────SSE─────────────────────────── ┘
```

Everything visual — the filter look, the resizing, the thumbnails — is produced
on the device in [`client/src/lib/filters.js`](./client/src/lib/filters.js) and
[`capture.js`](./client/src/lib/capture.js). The server just validates and
stores bytes and metadata.

### Project layout

```
server/            Express API (stateless)
  index.js         app wiring, static + SPA serving, health check
  config.js        env-driven configuration
  db.js            SQLite schema (WAL)
  storage.js       filesystem storage abstraction (swap for S3)
  sse.js           per-event live update hub
  routes/          events + photos endpoints
client/            React + Vite front end (mobile-first PWA)
  src/lib/         api client, on-device camera/filter/capture engine
  src/pages/       Home, Event
  src/components/  Camera, Album, Invite, Lightbox, ...
scripts/loadtest.mjs   concurrency load test
```

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/events` | Create an event → `{ id, adminToken, joinUrl }` |
| `GET` | `/api/events/:id` | Public event info |
| `GET` | `/api/events/:id/qr` | Invite QR code (SVG) |
| `GET` | `/api/events/:id/stream` | SSE feed of new photos |
| `POST` | `/api/events/:id/photos` | Upload `full` + `thumb` (multipart) |
| `GET` | `/api/events/:id/photos?before=&limit=` | Paginated album feed |
| `GET` | `/healthz` | Health check |

---

## Load testing

With a server running, simulate a crowd hitting one event:

```bash
# disable per-IP limits first (all traffic comes from one IP in a load test)
UPLOAD_RATE_MAX=0 CREATE_RATE_MAX=0 npm start

# in another shell:
node scripts/loadtest.mjs --guests 2000 --uploaders 0.3 --rounds 2
```

Reports throughput, success/failure counts, and p50/p95/p99 latency.

---

## Pluggable backends

Backends are **auto-selected from the environment** — no code changes:

| Env var | Unset (default) | Set |
| --- | --- | --- |
| `DATABASE_URL` | SQLite (WAL) | Postgres |
| `S3_BUCKET` | local filesystem | S3 / R2 / MinIO object storage |
| `REDIS_URL` | in-process live updates | Redis pub/sub across instances |

## Deploying

- **Single box:** `npm run build && npm start` behind a TLS reverse proxy.
- **Full stack (Postgres + Redis + S3/MinIO) with one command:**
  `docker compose up --build` — the same horizontally-scalable topology,
  runnable locally.
- **Managed cloud & multi-instance:** step by step in **[DEPLOY.md](./DEPLOY.md)**,
  with the reasoning in **[SCALING.md](./SCALING.md)**.

## License

MIT
