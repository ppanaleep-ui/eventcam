# 💐 PhotoWish

A modern **digital + printed wedding wish book** platform. Guests scan a QR code at
the reception, upload a photo and write a message from their own phone, and
optionally send a monetary gift ("online envelope") via PromptPay with a transfer
slip. Wishes appear on a **live slideshow** on the venue's big screen in real time,
the couple gets **LINE notifications**, and after the event everything is exported
to be printed as a keepsake **photobook**.

## ✨ Features

| Flow | What it does |
| --- | --- |
| **Guest** | Scan QR → optional online envelope (PromptPay QR + slip) → pick a photo → write a wish → submit |
| **Couple** | Sign up, manage the event, print the guest QR, share the slideshow link, watch wishes & money totals update live, moderate wishes, export the photobook |
| **Slideshow** | Full-screen display alternating pre-wedding photos and guest wishes, with new wishes pushed in instantly over SSE |
| **System** | PromptPay QR generation, slip verification, LINE push notifications, JSON data export for photobook production |

## 🧱 Tech stack

- **Next.js 14** (App Router, TypeScript, Server Actions)
- **Prisma** ORM + **SQLite** (swap to Postgres by changing `datasource` + `DATABASE_URL`)
- **Tailwind CSS**
- **Server-Sent Events** for real-time updates (in-process pub/sub — swap for Redis in multi-instance deploys)
- Real integration code paths for **PromptPay** (self-contained), **EasySlip** slip verification, and the **LINE Messaging API**

## 🚀 Getting started

```bash
npm install
cp .env.example .env      # then edit values
npm run db:migrate        # create the SQLite schema
npm run db:seed           # optional: demo couple + event
npm run dev               # http://localhost:3000
```

The seed prints a demo login (`demo@photowish.app` / `password123`) and a guest/slideshow URL.

### Production

```bash
npm run build   # prisma generate + migrate deploy + next build
npm run start
```

## 🔌 Integrations & configuration

Environment variables live in `.env` (see `.env.example`):

- `DATABASE_URL` — SQLite file (or a Postgres URL if you switch providers)
- `SESSION_SECRET` — long random string used to sign session cookies
- `NEXT_PUBLIC_APP_URL` — public base URL, used to build QR codes and shareable links
- `SLIP_VERIFY_PROVIDER` / `EASYSLIP_API_TOKEN` — set to `easyslip` + a token to
  enable **automatic Thai transfer-slip verification**. Left empty, slips are stored
  and can be verified manually from the dashboard.

**PromptPay** works out of the box — each couple enters their PromptPay ID
(phone number or national ID) in **Settings**, and the guest envelope page renders a
scannable QR with no external service required.

**LINE notifications** are configured **per event** in the dashboard **Settings**
(channel access token + destination userId/groupId from a LINE Official Account).
If unset, notifications are skipped silently — the guest flow never blocks on them.

## 🗂️ Project structure

```
prisma/
  schema.prisma        # User, Event, Wish, Envelope, Media
  seed.ts
src/
  lib/                 # db, auth (jose + bcrypt), events-bus (SSE), uploads,
                       # promptpay, qr, line, slip, utils
  app/
    page.tsx           # marketing / landing
    login, signup      # couple auth (server actions)
    e/[slug]/          # GUEST: landing, wish, envelope, thanks, slideshow
    dashboard/         # COUPLE: overview, wishes, envelopes, qr, photobook, settings
    api/
      e/[slug]/wishes      # POST a wish (photo + message)
      e/[slug]/envelopes   # POST an envelope (slip + amount) → verify → notify
      e/[slug]/stream      # SSE live activity
      files/[...path]      # serves runtime-uploaded images
      dashboard/[id]/export# owner-only JSON export for the photobook
  components/          # client components (forms, slideshow, live badge, …)
```

## 📤 File uploads

Uploaded images (guest photos, slips, pre-wedding media) are stored under
`storage/uploads/` (git-ignored) and served through `/api/files/[...path]` — this
works reliably under `next start`, unlike writing into `public/` at runtime. For
production at scale, point `saveImage` at S3/GCS and serve via signed URLs.

## 🔒 Notes

- Guest submission endpoints are intentionally public (guests aren't logged in);
  they validate input and cap sizes. Add rate-limiting / captcha before a real
  large-scale event.
- The SSE bus is per-process. For horizontally-scaled deployments, replace
  `src/lib/events-bus.ts` with Redis pub/sub (the publish/subscribe surface is small).
