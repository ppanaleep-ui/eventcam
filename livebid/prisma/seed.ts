/**
 * Demo data: an admin, two sellers, two buyers with topped-up wallets, one show
 * that is already live with items queued, and one scheduled for later.
 *
 * Money is seeded through the ledger (never by writing balances directly), so a
 * freshly seeded database passes `npm run db:audit`.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { creditAvailable } from "../src/lib/wallet";

const prisma = new PrismaClient();

const PASSWORD = "password123";

async function user(opts: {
  email: string;
  handle: string;
  displayName: string;
  avatarEmoji: string;
  isSeller?: boolean;
  isAdmin?: boolean;
  topUp?: number;
}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const record = await prisma.user.upsert({
    where: { email: opts.email },
    update: {},
    create: {
      email: opts.email,
      handle: opts.handle,
      displayName: opts.displayName,
      avatarEmoji: opts.avatarEmoji,
      isSeller: opts.isSeller ?? false,
      isAdmin: opts.isAdmin ?? false,
      passwordHash,
      wallet: { create: {} },
    },
  });

  if (opts.topUp) {
    await prisma.$transaction(async (tx) => {
      const topUp = await tx.topUp.create({
        data: {
          userId: record.id,
          amount: opts.topUp!,
          method: "DEMO",
          reference: `SEED-${record.handle.toUpperCase()}`,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      await creditAvailable(tx, record.id, opts.topUp!, "TOPUP", {
        refType: "topup",
        refId: topUp.id,
        note: "Seed balance",
      });
    });
  }

  return record;
}

async function main() {
  // Start from a clean slate so re-seeding stays idempotent.
  await prisma.$transaction([
    prisma.ledgerEntry.deleteMany(),
    prisma.order.deleteMany(),
    prisma.hold.deleteMany(),
    prisma.bid.deleteMany(),
    prisma.chatMessage.deleteMany(),
    prisma.listing.deleteMany(),
    prisma.show.deleteMany(),
    prisma.topUp.deleteMany(),
    prisma.withdrawal.deleteMany(),
    prisma.wallet.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  await user({
    email: "admin@livebid.app",
    handle: "admin",
    displayName: "LiveBid Ops",
    avatarEmoji: "🛠",
    isAdmin: true,
  });

  const ploy = await user({
    email: "seller@livebid.app",
    handle: "ploy_collects",
    displayName: "Ploy S.",
    avatarEmoji: "🦊",
    isSeller: true,
  });

  const buyerA = await user({
    email: "buyer@livebid.app",
    handle: "nine",
    displayName: "Nine T.",
    avatarEmoji: "🐼",
    topUp: 500_000, // ฿5,000
  });

  const buyerB = await user({
    email: "buyer2@livebid.app",
    handle: "mint",
    displayName: "Mint P.",
    avatarEmoji: "🐝",
    topUp: 300_000, // ฿3,000
  });

  const liveShow = await prisma.show.create({
    data: {
      sellerId: ploy.id,
      title: "Friday night card breaks 🔥",
      description: "Vintage holos, graded slabs and a few mystery packs.",
      category: "Trading cards",
      coverEmoji: "🃏",
      status: "LIVE",
      startedAt: new Date(),
      listings: {
        create: [
          {
            title: "1999 Holo Charizard (PSA 7)",
            emoji: "🔥",
            type: "AUCTION",
            startPrice: 150_000,
            minIncrement: 10_000,
            shippingFee: 5_000,
            durationSec: 45,
            position: 1,
          },
          {
            title: "Mystery pack — 5 slabs",
            emoji: "🎁",
            type: "AUCTION",
            startPrice: 20_000,
            minIncrement: 2_000,
            shippingFee: 5_000,
            durationSec: 30,
            position: 2,
          },
          {
            title: "Team bag — 100 commons",
            emoji: "🧧",
            type: "BUY_NOW",
            startPrice: 1,
            buyNowPrice: 35_000,
            minIncrement: 1,
            shippingFee: 4_000,
            position: 3,
          },
        ],
      },
    },
  });

  await prisma.show.create({
    data: {
      sellerId: ploy.id,
      title: "Sunday sneaker drop 👟",
      description: "Deadstock pairs, EU 40–45.",
      category: "Sneakers",
      coverEmoji: "👟",
      status: "SCHEDULED",
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
      listings: {
        create: [
          {
            title: "AJ1 Chicago Lost & Found, EU 43",
            emoji: "👟",
            type: "AUCTION",
            startPrice: 800_000,
            minIncrement: 20_000,
            shippingFee: 8_000,
            durationSec: 60,
            position: 1,
          },
        ],
      },
    },
  });

  await prisma.chatMessage.createMany({
    data: [
      { showId: liveShow.id, userId: buyerA.id, text: "let's goooo 🔥" },
      { showId: liveShow.id, userId: buyerB.id, text: "waiting for the mystery pack" },
      { showId: liveShow.id, kind: "SYSTEM", text: "🔴 The show is live!" },
    ],
  });

  console.log(`
Seed complete ✅

  Admin   admin@livebid.app  / ${PASSWORD}
  Seller  seller@livebid.app / ${PASSWORD}   (@ploy_collects)
  Buyer   buyer@livebid.app  / ${PASSWORD}   (@nine, ฿5,000 in wallet)
  Buyer   buyer2@livebid.app / ${PASSWORD}   (@mint, ฿3,000 in wallet)

  Live room     http://localhost:3000/live/${liveShow.id}
  Control room  http://localhost:3000/seller/shows/${liveShow.id}
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
