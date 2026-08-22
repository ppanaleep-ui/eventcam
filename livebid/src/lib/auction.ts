import type { Listing } from "@prisma/client";
import { prisma } from "./db";
import { publish } from "./bus";
import { formatMoney } from "./money";
import { ANTI_SNIPE_WINDOW_SEC, MAX_BID } from "./config";
import {
  adjustHold,
  captureSale,
  releaseHold,
  WalletError,
  type Tx,
} from "./wallet";

export class AuctionError extends Error {}

/** The smallest bid that would currently win a listing. */
export function nextBidAmount(listing: Pick<Listing, "topBid" | "startPrice" | "minIncrement">): number {
  return listing.topBid > 0 ? listing.topBid + listing.minIncrement : listing.startPrice;
}

/** What a bid actually costs the bidder (and therefore what gets held). */
export function totalFor(listing: Pick<Listing, "shippingFee">, price: number): number {
  return price + listing.shippingFee;
}

export function listingWire(listing: Listing & { topBidder?: { handle: string } | null }) {
  return {
    id: listing.id,
    title: listing.title,
    emoji: listing.emoji,
    photoUrl: listing.photoUrl,
    type: listing.type,
    status: listing.status,
    startPrice: listing.startPrice,
    buyNowPrice: listing.buyNowPrice,
    minIncrement: listing.minIncrement,
    shippingFee: listing.shippingFee,
    topBid: listing.topBid,
    topBidderHandle: listing.topBidder?.handle ?? null,
    nextBid: nextBidAmount(listing),
    endsAt: listing.endsAt ? listing.endsAt.toISOString() : null,
    soldPrice: listing.soldPrice,
  };
}

async function systemMessage(tx: Tx, showId: string, text: string) {
  const message = await tx.chatMessage.create({
    data: { showId, kind: "SYSTEM", text },
  });
  return {
    id: message.id,
    kind: "SYSTEM" as const,
    text,
    handle: null,
    displayName: null,
    avatarEmoji: null,
    createdAt: message.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Show / listing control (seller side)
// ---------------------------------------------------------------------------

export async function startShow(sellerId: string, showId: string) {
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== sellerId) throw new AuctionError("Show not found");
  if (show.status === "ENDED") throw new AuctionError("This show has already ended");

  const updated = await prisma.show.update({
    where: { id: showId },
    data: { status: "LIVE", startedAt: show.startedAt ?? new Date() },
  });
  const message = await systemMessage(prisma, showId, "🔴 The show is live!");
  publish(showId, { type: "show", payload: { status: updated.status } });
  publish(showId, { type: "chat", payload: message });
  return updated;
}

export async function endShow(sellerId: string, showId: string) {
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== sellerId) throw new AuctionError("Show not found");

  // Any auction still running is settled before the room closes, so no bidder
  // is left with funds held against a show that will never finish.
  await settleDueListings(showId, { force: true });

  const updated = await prisma.show.update({
    where: { id: showId },
    data: { status: "ENDED", endedAt: new Date() },
  });
  const message = await systemMessage(prisma, showId, "👋 The show has ended. Thanks for watching!");
  publish(showId, { type: "show", payload: { status: updated.status } });
  publish(showId, { type: "chat", payload: message });
  return updated;
}

/** Puts a queued item on the block and starts its countdown. */
export async function startListing(sellerId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { show: true },
  });
  if (!listing || listing.show.sellerId !== sellerId) throw new AuctionError("Item not found");
  if (listing.status !== "QUEUED") throw new AuctionError("This item is not in the queue");
  if (listing.show.status !== "LIVE") throw new AuctionError("Start the show first");

  // One item at a time on the block, exactly like a real auction.
  await settleDueListings(listing.showId, { force: true });

  const now = new Date();
  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      status: "ACTIVE",
      startedAt: now,
      endsAt: listing.type === "AUCTION" ? new Date(now.getTime() + listing.durationSec * 1000) : null,
    },
    include: { topBidder: { select: { handle: true } } },
  });

  const label = listing.type === "AUCTION" ? "🔨 Now on the block" : "🛒 Now available";
  const message = await systemMessage(prisma, listing.showId, `${label}: ${listing.title}`);
  publish(listing.showId, { type: "listing", payload: listingWire(updated) });
  publish(listing.showId, { type: "chat", payload: message });
  return updated;
}

/** Pulls an item without selling it, refunding every hold on it. */
export async function cancelListing(sellerId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { show: true },
  });
  if (!listing || listing.show.sellerId !== sellerId) throw new AuctionError("Item not found");
  if (listing.status === "SOLD") throw new AuctionError("Sold items cannot be cancelled");

  await prisma.$transaction(async (tx) => {
    await releaseAllHolds(tx, listingId);
    await tx.listing.update({
      where: { id: listingId },
      data: { status: "CANCELLED", settledAt: new Date(), topBid: 0, topBidderId: null },
    });
  });

  const fresh = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { topBidder: { select: { handle: true } } },
  });
  publish(listing.showId, { type: "listing", payload: listingWire(fresh) });
  return fresh;
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

export type BidResult = { listingId: string; amount: number; held: number };

export async function placeBid(userId: string, listingId: string, amount: number): Promise<BidResult> {
  if (!Number.isInteger(amount) || amount <= 0) throw new AuctionError("Enter a valid bid");
  if (amount > MAX_BID) throw new AuctionError("That bid is above the per-bid limit");

  // Close anything whose clock already ran out before judging this bid.
  await settleDueListings(undefined, { listingId });

  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: { show: { select: { id: true, sellerId: true, status: true } } },
    });
    if (!listing) throw new AuctionError("Item not found");
    if (listing.type !== "AUCTION") throw new AuctionError("This item is a buy-now item");
    if (listing.status !== "ACTIVE") throw new AuctionError("Bidding is closed for this item");
    if (listing.show.status !== "LIVE") throw new AuctionError("This show is not live");
    if (listing.show.sellerId === userId) throw new AuctionError("You cannot bid on your own item");

    const now = new Date();
    if (listing.endsAt && listing.endsAt.getTime() <= now.getTime()) {
      throw new AuctionError("Time is up for this item");
    }
    if (listing.topBidderId === userId) throw new AuctionError("You are already the top bidder");

    const minimum = nextBidAmount(listing);
    if (amount < minimum) {
      throw new AuctionError(`Bid at least ${formatMoney(minimum)}`);
    }

    // Reserve the full amount the bidder would owe — item + shipping.
    const needed = totalFor(listing, amount);
    const existingHold = await tx.hold.findUnique({
      where: { listingId_userId: { listingId, userId } },
    });
    const currentlyHeld = existingHold && existingHold.status === "ACTIVE" ? existingHold.amount : 0;

    await adjustHold(tx, userId, needed - currentlyHeld, {
      refType: "listing",
      refId: listingId,
      note: `Bid on ${listing.title}`,
    });

    if (existingHold) {
      await tx.hold.update({
        where: { id: existingHold.id },
        data: { amount: needed, status: "ACTIVE", resolvedAt: null },
      });
    } else {
      await tx.hold.create({ data: { listingId, userId, amount: needed } });
    }

    // The bidder we just beat gets their money back immediately.
    if (listing.topBidderId && listing.topBidderId !== userId) {
      const previous = await tx.hold.findUnique({
        where: { listingId_userId: { listingId, userId: listing.topBidderId } },
      });
      if (previous && previous.status === "ACTIVE") {
        await releaseHold(tx, previous.userId, previous.amount, {
          refType: "listing",
          refId: listingId,
          note: `Outbid on ${listing.title}`,
        });
        await tx.hold.update({
          where: { id: previous.id },
          data: { status: "RELEASED", resolvedAt: now },
        });
      }
    }

    await tx.bid.create({ data: { listingId, userId, amount } });

    // Anti-snipe: a bid in the closing seconds pushes the clock back out, so a
    // last-millisecond bid can always be answered.
    let endsAt = listing.endsAt;
    if (endsAt && endsAt.getTime() - now.getTime() < ANTI_SNIPE_WINDOW_SEC * 1000) {
      endsAt = new Date(now.getTime() + ANTI_SNIPE_WINDOW_SEC * 1000);
    }

    const updated = await tx.listing.update({
      where: { id: listingId },
      data: { topBid: amount, topBidderId: userId, endsAt },
      include: { topBidder: { select: { handle: true } } },
    });

    const bidder = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { handle: true, avatarEmoji: true },
    });
    const message = await systemMessage(
      tx,
      listing.showId,
      `${bidder.avatarEmoji} @${bidder.handle} bid ${formatMoney(amount)}`,
    );

    return { listing: updated, message, showId: listing.showId, needed };
  });

  publish(result.showId, { type: "listing", payload: listingWire(result.listing) });
  publish(result.showId, { type: "chat", payload: result.message });
  publish(result.showId, { type: "bid", payload: { listingId, amount } });

  return { listingId, amount, held: result.needed };
}

// ---------------------------------------------------------------------------
// Buy now
// ---------------------------------------------------------------------------

export async function buyNow(userId: string, listingId: string, shippingAddress?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: { show: { select: { id: true, sellerId: true, status: true } } },
    });
    if (!listing) throw new AuctionError("Item not found");
    if (listing.type !== "BUY_NOW" || listing.buyNowPrice == null) {
      throw new AuctionError("This item is auction-only");
    }
    if (listing.status !== "ACTIVE") throw new AuctionError("This item is not for sale right now");
    if (listing.show.status !== "LIVE") throw new AuctionError("This show is not live");
    if (listing.show.sellerId === userId) throw new AuctionError("You cannot buy your own item");

    const total = totalFor(listing, listing.buyNowPrice);
    const capture = await captureSale(tx, {
      buyerId: userId,
      sellerId: listing.show.sellerId,
      total,
      fromHold: false,
      ref: { refType: "listing", refId: listingId, note: `Bought ${listing.title}` },
    });

    const order = await tx.order.create({
      data: {
        listingId,
        buyerId: userId,
        sellerId: listing.show.sellerId,
        itemPrice: listing.buyNowPrice,
        shippingFee: listing.shippingFee,
        platformFee: capture.platformFee,
        total: capture.total,
        sellerNet: capture.sellerNet,
        shippingAddress: shippingAddress || null,
      },
    });

    const updated = await tx.listing.update({
      where: { id: listingId },
      data: {
        status: "SOLD",
        soldPrice: listing.buyNowPrice,
        winnerId: userId,
        settledAt: new Date(),
      },
      include: { topBidder: { select: { handle: true } } },
    });

    const buyer = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { handle: true, avatarEmoji: true },
    });
    const message = await systemMessage(
      tx,
      listing.showId,
      `${buyer.avatarEmoji} @${buyer.handle} bought ${listing.title} for ${formatMoney(listing.buyNowPrice)}`,
    );

    return { order, listing: updated, message, showId: listing.showId };
  });

  publish(result.showId, { type: "listing", payload: listingWire(result.listing) });
  publish(result.showId, { type: "chat", payload: result.message });
  return result.order;
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

async function releaseAllHolds(tx: Tx, listingId: string, exceptUserId?: string) {
  const holds = await tx.hold.findMany({ where: { listingId, status: "ACTIVE" } });
  for (const hold of holds) {
    if (exceptUserId && hold.userId === exceptUserId) continue;
    await releaseHold(tx, hold.userId, hold.amount, {
      refType: "listing",
      refId: listingId,
      note: "Auction closed — bid released",
    });
    await tx.hold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", resolvedAt: new Date() },
    });
  }
}

/**
 * Closes one auction: the top bidder's hold becomes a paid order, everyone
 * else gets their funds back. Safe to call repeatedly — a listing that is no
 * longer ACTIVE is a no-op, which is what makes lazy settlement work.
 */
export async function settleListing(listingId: string) {
  const outcome = await prisma.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      include: { show: { select: { id: true, sellerId: true } } },
    });
    if (!listing || listing.status !== "ACTIVE") return null;

    // No bids — the item goes back on the shelf.
    if (!listing.topBidderId || listing.topBid <= 0) {
      await releaseAllHolds(tx, listingId);
      const updated = await tx.listing.update({
        where: { id: listingId },
        data: { status: "UNSOLD", settledAt: new Date() },
        include: { topBidder: { select: { handle: true } } },
      });
      const message = await systemMessage(tx, listing.showId, `😶 ${listing.title} went unsold`);
      return { listing: updated, message, showId: listing.showId, order: null };
    }

    const winnerId = listing.topBidderId;
    const hold = await tx.hold.findUnique({
      where: { listingId_userId: { listingId, userId: winnerId } },
    });
    if (!hold || hold.status !== "ACTIVE") {
      throw new WalletError("The winning bid is no longer funded");
    }

    const total = totalFor(listing, listing.topBid);
    const capture = await captureSale(tx, {
      buyerId: winnerId,
      sellerId: listing.show.sellerId,
      total,
      fromHold: true,
      ref: { refType: "listing", refId: listingId, note: `Won ${listing.title}` },
    });
    await tx.hold.update({
      where: { id: hold.id },
      data: { status: "CAPTURED", resolvedAt: new Date() },
    });
    await releaseAllHolds(tx, listingId, winnerId);

    const order = await tx.order.create({
      data: {
        listingId,
        buyerId: winnerId,
        sellerId: listing.show.sellerId,
        itemPrice: listing.topBid,
        shippingFee: listing.shippingFee,
        platformFee: capture.platformFee,
        total: capture.total,
        sellerNet: capture.sellerNet,
      },
    });

    const updated = await tx.listing.update({
      where: { id: listingId },
      data: {
        status: "SOLD",
        soldPrice: listing.topBid,
        winnerId,
        settledAt: new Date(),
      },
      include: { topBidder: { select: { handle: true } } },
    });

    const winner = await tx.user.findUniqueOrThrow({
      where: { id: winnerId },
      select: { handle: true },
    });
    const message = await systemMessage(
      tx,
      listing.showId,
      `🏆 SOLD to @${winner.handle} for ${formatMoney(listing.topBid)}`,
    );

    return { listing: updated, message, showId: listing.showId, order };
  });

  if (!outcome) return null;
  publish(outcome.showId, { type: "listing", payload: listingWire(outcome.listing) });
  publish(outcome.showId, { type: "chat", payload: outcome.message });
  return outcome;
}

/**
 * Lazy auction clock. There is no background worker: every live-room SSE tick,
 * page render and bid attempt calls this, so an auction closes the moment
 * anyone looks at it (and at most ~1s late while the room has viewers).
 */
export async function settleDueListings(
  showId?: string,
  opts: { listingId?: string; force?: boolean } = {},
) {
  const due = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      type: "AUCTION",
      ...(showId ? { showId } : {}),
      ...(opts.listingId ? { id: opts.listingId } : {}),
      ...(opts.force ? {} : { endsAt: { lte: new Date() } }),
    },
    select: { id: true },
  });

  for (const listing of due) {
    await settleListing(listing.id);
  }
  return due.length;
}
