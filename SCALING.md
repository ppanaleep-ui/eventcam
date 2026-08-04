# Scaling EventCam to 2,000+ concurrent guests

The app runs fine on a single box for a small party. This is the checklist for
taking it to a wedding hall, conference, or festival where a couple thousand
people scan the QR at roughly the same time.

The core idea that makes this achievable is already baked in: **all image work
happens on the guest's device.** The server never decodes, resizes, or filters
an image — it validates and stores bytes. That removes the usual bottleneck.
What's left is ordinary, horizontally-scalable web plumbing.

---

## 1. Understand the load shape

At an event with `N` guests:

- **~N persistent SSE connections** (everyone has the album open) — cheap, but
  the one thing that's genuinely "concurrent".
- **A trickle of uploads** — even a lively crowd uploads a few photos per minute
  each, and each upload is a plain file `POST` (no server-side processing).
- **Bursty reads** — album opens and "load more" scrolls, served as small
  thumbnails.

So the scaling targets, in order, are: (1) hold lots of idle SSE connections,
(2) serve images from something that isn't your app, (3) run multiple stateless
app instances.

---

## 2. Move photos to object storage + CDN  ← biggest win

Local disk (the default in `server/storage.js`) doesn't work across multiple
instances and makes your app serve every image byte. Replace it with an
S3-compatible store (S3, R2, GCS, Backblaze) and put a CDN in front.

Two ways, best first:

**a) Presigned direct uploads (recommended).** The guest's browser uploads the
JPEG straight to the bucket; bytes never transit your app server.

1. Add `POST /api/events/:id/upload-url` that returns a presigned `PUT` URL +
   the final object key.
2. Client `PUT`s the `full` and `thumb` blobs to those URLs.
3. Client calls `POST /api/events/:id/photos` with just the metadata (keys,
   dimensions, filter, guest name) to record the row + broadcast.

**b) Proxy uploads.** Keep the current multipart endpoint but stream to the
bucket instead of disk (swap the body of `storage.js`). Simpler, but upload
bandwidth still flows through your app.

Either way, serve reads via the CDN. The immutable filenames + long
`Cache-Control` already set on `/uploads` mean the CDN caches aggressively and
your origin is barely touched.

---

## 3. Swap SQLite for Postgres

SQLite (WAL) is great for one box. For multiple instances use Postgres. The
schema and queries port directly — the only app-level change is the driver in
`server/db.js`. Add connection pooling (`pg` pool, or PgBouncer). The existing
index on `(event_id, created_at DESC)` is what keeps the keyset-paginated album
feed fast no matter how many photos an event accumulates.

---

## 4. Make SSE work across instances (Redis pub/sub)

`server/sse.js` broadcasts within one process. Behind a load balancer, a photo
recorded on instance A must reach guests connected to instance B.

- On upload, `PUBLISH event:<id>` to Redis instead of (or in addition to) the
  local broadcast.
- Each instance `SUBSCRIBE`s and fans the message out to its own connected
  `res` objects.

Also make sure your proxy doesn't buffer SSE: disable buffering for the
`/stream` path (the handler already sends `X-Accel-Buffering: no` for Nginx) and
allow long-lived connections. Raise the per-process file-descriptor limit
(`ulimit -n`) — each SSE guest is an open socket.

If you'd rather not hold thousands of long connections at all, the client
already degrades gracefully: swap the `EventSource` in `Event.jsx` for a 5–10s
poll of the photos endpoint. Less instant, essentially free.

---

## 5. Run multiple stateless app instances

The app keeps **no per-user state in memory** (guest identity lives in the
browser's `localStorage`; the only in-process state is the SSE connection set,
addressed by Redis in step 4). So you can:

- Run `M` instances (containers / dynos / pods).
- Put them behind a load balancer. SSE needs sticky-ish routing only in that a
  connection stays on the instance it opened on — which it naturally does; Redis
  handles cross-instance delivery.
- Autoscale on CPU / connection count.

Rule of thumb: one modern core comfortably holds a few thousand idle SSE
connections plus the upload/read trickle. 2,000 guests is well within a small
handful of instances.

---

## 6. Tune the guard rails

In `.env` / environment:

- `UPLOAD_RATE_MAX` — per-IP uploads per minute. Guests each have their own IP,
  so the default (40) is per-person; keep it. It's mostly there to blunt abuse.
- `MAX_FULL_BYTES` / `MAX_THUMB_BYTES` — caps on accepted bytes. The client
  already targets ~1600px / ~420px JPEGs, so real uploads are small.
- `PAGE_SIZE` — album page size; 60 balances round-trips vs. payload.

---

## 7. Reference production topology

```
                         ┌─────────────┐
              guests ───▶ │ CDN (images │◀── object storage (S3/R2)
                         │  + static)  │
                         └─────┬───────┘
                               │ /api, /stream
                         ┌─────▼───────┐
                         │Load balancer│
                         └──┬───┬───┬──┘
                     ┌──────┘   │   └──────┐
                 ┌───▼──┐   ┌───▼──┐   ┌───▼──┐   stateless app instances
                 │ app  │   │ app  │   │ app  │   (Express)
                 └──┬───┘   └──┬───┘   └──┬───┘
                    └────┬─────┴────┬─────┘
                    ┌────▼───┐  ┌───▼────┐
                    │Postgres│  │ Redis  │  (metadata)   (SSE pub/sub)
                    └────────┘  └────────┘
```

---

## Quick capacity check

Validate a deployment before the event with the included load test:

```bash
node scripts/loadtest.mjs --url https://your-host --guests 2000 --uploaders 0.3 --rounds 2
```

Watch p95 latency and the failure count. If p95 climbs, add app instances
(step 5) and confirm images are being served by the CDN, not your origin
(step 2) — those two are almost always the fix.
