# Deploying EventCam

Three ways to run it, smallest to largest. All configuration is via environment
variables — see [`.env.example`](./.env.example). The backends are
**auto-selected**: set `DATABASE_URL` and it uses Postgres, set `S3_BUCKET` and
it uses object storage, set `REDIS_URL` and live updates fan out across
instances. Set none and you get SQLite + local disk + in-process SSE.

---

## 1. Single box (simplest)

```bash
npm install
npm run build
PUBLIC_URL=https://your-domain npm start
```

Put TLS in front (Caddy/Nginx) and persist `DATA_DIR`. Good for a party or a
few hundred guests.

---

## 2. Full stack with Docker Compose (Postgres + Redis + S3/MinIO)

This runs the exact horizontally-scalable topology from
[SCALING.md](./SCALING.md) on your machine — stateless app, Postgres, Redis
fan-out, and S3 object storage (MinIO standing in for S3/R2).

```bash
docker compose up --build
# app:            http://localhost:3000
# MinIO console:  http://localhost:9001  (minioadmin / minioadmin)
```

`docker compose` brings up: the app, Postgres, Redis, MinIO, and a one-shot job
that creates the `eventcam` bucket and marks it publicly readable so the browser
can fetch photos directly from object storage.

### Simulating multiple instances

The app is stateless, so you can run several copies. Add a load balancer
(nginx/Caddy) that fans `/` to the app service, then:

```bash
docker compose up --scale app=3
```

Redis carries live photo events between instances; Postgres and MinIO are
shared. This is the same shape you'd deploy to ECS/Kubernetes/Fly/Render, just
on one host.

---

## 3. Managed cloud (production)

Point the same image at managed services:

| Piece | Managed option | Env var |
| --- | --- | --- |
| App | ECS / Fly / Render / Kubernetes (run N replicas) | — |
| Database | RDS / Neon / Supabase Postgres | `DATABASE_URL` (`PGSSL=true`) |
| Live updates | ElastiCache / Upstash Redis | `REDIS_URL` |
| Photos | S3 / Cloudflare R2 / B2 | `S3_*` |
| Photo delivery | CloudFront / Cloudflare CDN in front of the bucket | `S3_PUBLIC_BASE` |

Checklist:

1. Build & push the image (`docker build -t eventcam .`).
2. Create the bucket; put a CDN in front and set `S3_PUBLIC_BASE` to the CDN URL.
3. Provision Postgres and Redis; set `DATABASE_URL` (with `PGSSL=true`) and
   `REDIS_URL`.
4. Set `PUBLIC_URL` to your https origin so QR / invite links are correct.
5. Run 2+ app replicas behind your load balancer. The app creates its own
   tables on first boot.
6. Raise the file-descriptor limit on app instances — each connected guest holds
   one SSE socket.
7. Validate before the event:
   `node scripts/loadtest.mjs --url https://your-host --guests 2000 --uploaders 0.3 --rounds 2`

For the reasoning behind each choice and how to push further (presigned direct
uploads, SSE vs. polling trade-offs), see **[SCALING.md](./SCALING.md)**.
