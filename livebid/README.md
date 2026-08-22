# 🔨 LiveBid

A **Whatnot-style live shopping app** — sellers run live shows, viewers bid in
real time — with a **built-in wallet** that funds every purchase.

The wallet is the point of the app. Instead of charging a card per sale, buyers
top up once and every bid, purchase, refund and payout moves inside a
double-entry-style ledger where **no satang appears or disappears without a row
to explain it**.

**Everything (app + database) in one command:**

```bash
docker compose up --build              # http://localhost:3000
docker compose exec app npx prisma db seed   # demo sellers, buyers, a live show
```

**Or against your own Postgres:**

```bash
npm install
cp .env.example .env       # set DATABASE_URL + SESSION_SECRET
npm run db:migrate         # create the schema
npm run db:seed            # demo data
npm run dev                # http://localhost:3000
```

The seed prints logins (all `password123`) and a direct link to the live room:

| Account | Role |
| --- | --- |
| `admin@livebid.app` | admin console (`/admin`) — approves top-ups, pays withdrawals |
| `seller@livebid.app` | seller with a live show and a queued one |
| `buyer@livebid.app` | buyer, ฿5,000 in the wallet |
| `buyer2@livebid.app` | buyer, ฿3,000 in the wallet |

## How the money works

Every wallet has three buckets (all integers in satang — never floats):

| Bucket | Meaning |
| --- | --- |
| `available` | spendable right now |
| `held` | reserved behind a live bid — still the bidder's money |
| `pending` | a seller's sale proceeds, in escrow until the buyer confirms delivery |

The full path of a sale:

```
top-up ─▶ available ─┬─▶ held ────▶ (outbid) ────▶ available
                     │
                     └─▶ held ────▶ 🔨 hammer ──▶ buyer debited
                                                  ├─▶ platform commission
                                                  └─▶ seller `pending`
                                                        │
                                        buyer confirms delivery
                                                        ▼
                                                  seller `available` ─▶ withdrawal
```

Rules the code enforces:

- **A bid reserves, it does not charge.** Bidding moves `item + shipping` from
  `available` to `held`. Being outbid releases it on the spot — so a bidder can
  never be committed to more than they hold, and can't double-spend one balance
  across two auctions.
- **No bucket can go negative**, and every movement writes an append-only
  `LedgerEntry`. `npm run db:audit` re-derives all balances from the ledger and
  fails if anything drifted; the admin console shows the same audit.
- **Escrow by default.** The hammer captures the winner's hold into the seller's
  `pending`, minus the platform commission (`PLATFORM_FEE_PERCENT`, default 10%).
  Only the buyer confirming delivery releases it to `available`. A seller can
  cancel and refund an unshipped order straight back to the buyer.
- **Money enters and leaves in one place each.** Top-ups (PromptPay QR + slip)
  and withdrawals are the only doors, and both are reviewable in `/admin`.
- Everything above is atomic: bid, capture, refund and payout each run in a
  single database transaction, so a listing can never be sold without the buyer
  being debited (or vice versa).

## Features

| Flow | What it does |
| --- | --- |
| **Viewer** | Browse live/upcoming shows → live room with stream, chat and the item on the block → one-tap bidding with anti-snipe timer extension → buy-now items → orders + delivery confirmation |
| **Seller** | Become a seller in one click, create a show, queue auction and buy-now items (with photos), go live, send items up one at a time, pull an item (refunding every bid), ship orders, watch escrow and earnings |
| **Wallet** | Balances by bucket, PromptPay top-up with slip upload, withdrawals to a bank account, live reservations list, and the full personal ledger |
| **Admin** | Approve/reject top-ups, pay/reject withdrawals, platform float and commission totals, ledger audit |

## Real-time

One SSE stream per show (`/api/shows/[id]/stream`) carries chat, bids, listing
state and show status. There is **no background worker**: the auction clock is
driven lazily — the stream ticks once a second while anyone is watching, and
page renders and bid attempts settle any expired auction first. Closing is
idempotent, so a listing can never be settled twice.

Anti-snipe: a bid inside the last 10 seconds pushes the clock out to 10 seconds
again, so a last-millisecond bid can always be answered.

## Tech stack

- **Next.js 14** (App Router, TypeScript, Server Actions)
- **Prisma** + **PostgreSQL** (the same engine locally and in production, so a
  migration that passes locally passes on the host)
- **Tailwind CSS**
- **Server-Sent Events** over an in-process bus (swap for Redis pub/sub in a
  multi-instance deploy — `src/lib/bus.ts` is the only file that changes)
- **PromptPay** QR generation (EMVCo, self-contained — no external service)

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | long random string signing session cookies |
| `PLATFORM_FEE_PERCENT` | commission per sale (default `10`) |
| `PROMPTPAY_ID` | PromptPay phone/national ID that top-ups are paid into |
| `AUTO_APPROVE_TOPUP` | `true` clears top-ups as soon as a slip is uploaded (demo only) |
| `ADMIN_EMAILS` | comma-separated e-mails that get `/admin` |
| `STORAGE_DIR` | where uploads are written — point at a mounted volume in production |
| `NEXT_PUBLIC_APP_URL` | public base URL of the deployment |

## Scripts

```bash
npm run dev          # dev server
npm run build        # prisma generate + next build
npm run start        # prisma migrate deploy + next start  (what the host runs)
npm run test:flow    # end-to-end money test against TEST_DATABASE_URL (see below)
npm run db:audit     # re-derive every wallet balance from the ledger
npm run db:seed      # reset + reseed demo data
```

`npm run test:flow` runs a real auction against a scratch database and asserts
balances at every step — top-up, bid, outbid, an unfundable bid, the hammer,
escrow release, buy-now, a pulled lot — then proves the ledger re-derives those
balances exactly and that wallets + commission still equal what was paid in.


## Deploying

Migrations run at boot (`npm run start` = `prisma migrate deploy && next start`),
so the database does not need to be reachable at build time and every deploy
brings the schema forward on its own. Health check: `GET /api/health`.

Two things decide where this runs well:

- **Live rooms hold an open SSE connection.** Pick a host that keeps a normal
  long-lived Node process — Railway, Render, Fly, a VPS. Vercel works, but its
  serverless functions cap streaming duration, so live rooms reconnect every
  time the cap is hit.
- **Uploads need a disk.** Container filesystems are wiped on redeploy: mount a
  volume and set `STORAGE_DIR` to it, or the slips and photos disappear.

### Railway (quickest)

1. New Project → Deploy from GitHub repo → pick this repo.
2. Set the service's **root directory** to `livebid` (`railway.json` there
   supplies the build/start commands and the health check).
3. Add a **PostgreSQL** database to the project — Railway injects `DATABASE_URL`.
4. Add the remaining variables: `SESSION_SECRET` (long random string),
   `NEXT_PUBLIC_APP_URL` (the generated domain), `PROMPTPAY_ID`, `ADMIN_EMAILS`,
   and `STORAGE_DIR=/data/uploads` with a volume mounted at `/data/uploads`.
5. Deploy, then seed demo data if you want it:
   `DATABASE_URL="<the public connection string>" npm run db:seed` from your
   machine.

### Render (blueprint)

`render.yaml` in this folder declares the web service, the Postgres database and
a 1 GB disk for uploads. New → Blueprint → point at the repo; Render fills in
`DATABASE_URL`, generates `SESSION_SECRET`, and asks you for `PROMPTPAY_ID`,
`ADMIN_EMAILS` and `NEXT_PUBLIC_APP_URL`.

### Docker anywhere (VPS, Fly, your own box)

```bash
docker compose up --build -d        # app + Postgres + volumes
```

`docker-compose.yml` is a working single-host deployment: change
`SESSION_SECRET`, put it behind a TLS terminator (Caddy, nginx, Cloudflare) and
it is done. To build the image alone: `docker build -t livebid .`

### First run on a fresh deployment

1. Sign up with an e-mail listed in `ADMIN_EMAILS` — that account gets `/admin`.
2. Open `/seller`, create a show, queue items, go live.
3. Buyers top up in `/wallet` (PromptPay QR + slip) and you approve the transfer
   in `/admin` — or set `AUTO_APPROVE_TOPUP=true` while you are testing.

## What's deliberately not here

Video ingest. A show can point at any embeddable player URL (`streamUrl`), and
without one the stage renders a placeholder — every other part of the app works
the same. Wiring an RTMP ingest + HLS playback service is the only missing piece
between this and a production live-shopping product.
