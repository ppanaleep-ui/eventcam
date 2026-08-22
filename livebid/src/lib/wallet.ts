import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { feeOf } from "./money";
import { platformFeePercent } from "./config";

/**
 * The wallet ledger — the single place where money moves.
 *
 * Buckets per wallet:
 *   available  spendable now
 *   held       reserved against a live bid (still the bidder's money)
 *   pending    sale proceeds in escrow until the buyer confirms delivery
 *
 * Rules enforced here and nowhere else:
 *   1. A bucket can never go negative.
 *   2. Every movement writes an append-only LedgerEntry, so
 *      sum(entries per bucket) === wallet bucket balance. `auditWallets()`
 *      re-derives the balances and reports any drift.
 *   3. Callers pass a transaction client, so a bid/purchase is atomic:
 *      either the buyer is debited AND the order exists, or neither.
 */

export type Tx = Prisma.TransactionClient | PrismaClient;

export type Bucket = "AVAILABLE" | "HELD" | "PENDING";

export type LedgerKind =
  | "TOPUP"
  | "HOLD"
  | "HOLD_RELEASE"
  | "PURCHASE"
  | "SALE"
  | "FEE"
  | "REFUND"
  | "PAYOUT_PENDING"
  | "PAYOUT_RELEASE"
  | "WITHDRAW"
  | "WITHDRAW_REFUND";

export type Ref = { refType?: string; refId?: string; note?: string };

export class WalletError extends Error {}

const COLUMN: Record<Bucket, "available" | "held" | "pending"> = {
  AVAILABLE: "available",
  HELD: "held",
  PENDING: "pending",
};

/** Fetches (creating if needed) the wallet row for a user. */
export async function ensureWallet(tx: Tx, userId: string) {
  const existing = await tx.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return tx.wallet.create({ data: { userId } });
}

export async function getBalance(userId: string) {
  const wallet = await ensureWallet(prisma, userId);
  return {
    available: wallet.available,
    held: wallet.held,
    pending: wallet.pending,
    total: wallet.available + wallet.held + wallet.pending,
  };
}

/**
 * Moves `amount` (signed) in one bucket of one wallet and records the entry.
 * Every other function in this file is built on top of this one.
 */
async function move(
  tx: Tx,
  userId: string,
  bucket: Bucket,
  amount: number,
  kind: LedgerKind,
  ref: Ref = {},
) {
  if (!Number.isInteger(amount)) {
    throw new WalletError("Amounts must be whole satang");
  }
  if (amount === 0) return;

  const wallet = await ensureWallet(tx, userId);
  const column = COLUMN[bucket];
  const balanceAfter = wallet[column] + amount;

  if (balanceAfter < 0) {
    throw new WalletError(
      bucket === "AVAILABLE" ? "Not enough balance in your wallet" : "Wallet balance is inconsistent",
    );
  }

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { [column]: balanceAfter },
  });

  await tx.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      kind,
      bucket,
      amount,
      balanceAfter,
      refType: ref.refType,
      refId: ref.refId,
      note: ref.note,
    },
  });
}

/** Money enters the system (approved top-up). */
export async function creditAvailable(
  tx: Tx,
  userId: string,
  amount: number,
  kind: LedgerKind,
  ref?: Ref,
) {
  if (amount <= 0) throw new WalletError("Amount must be positive");
  await move(tx, userId, "AVAILABLE", amount, kind, ref);
}

/** Money leaves `available` (buy-now purchase, withdrawal request). */
export async function debitAvailable(
  tx: Tx,
  userId: string,
  amount: number,
  kind: LedgerKind,
  ref?: Ref,
) {
  if (amount <= 0) throw new WalletError("Amount must be positive");
  await move(tx, userId, "AVAILABLE", -amount, kind, ref);
}

/**
 * Reserves funds behind a live bid: available → held.
 * `delta` may be negative when a bidder lowers their exposure.
 */
export async function adjustHold(tx: Tx, userId: string, delta: number, ref?: Ref) {
  if (delta === 0) return;
  if (delta > 0) {
    await move(tx, userId, "AVAILABLE", -delta, "HOLD", ref);
    await move(tx, userId, "HELD", delta, "HOLD", ref);
  } else {
    await move(tx, userId, "HELD", delta, "HOLD_RELEASE", ref);
    await move(tx, userId, "AVAILABLE", -delta, "HOLD_RELEASE", ref);
  }
}

/** Gives a losing bidder their reserved funds back: held → available. */
export async function releaseHold(tx: Tx, userId: string, amount: number, ref?: Ref) {
  await adjustHold(tx, userId, -amount, ref);
}

export type CaptureResult = {
  total: number;
  platformFee: number;
  sellerNet: number;
};

/**
 * Settles a sale. The buyer's money leaves (from `held` for auctions, from
 * `available` for buy-now) and lands in the seller's `pending` escrow minus the
 * platform commission.
 */
export async function captureSale(
  tx: Tx,
  opts: {
    buyerId: string;
    sellerId: string;
    total: number;
    fromHold: boolean;
    ref?: Ref;
  },
): Promise<CaptureResult> {
  const { buyerId, sellerId, total, fromHold, ref } = opts;
  if (total <= 0) throw new WalletError("Sale total must be positive");

  if (fromHold) {
    await move(tx, buyerId, "HELD", -total, "PURCHASE", ref);
  } else {
    await move(tx, buyerId, "AVAILABLE", -total, "PURCHASE", ref);
  }

  const platformFee = feeOf(total, platformFeePercent());
  const sellerNet = total - platformFee;

  await move(tx, sellerId, "PENDING", sellerNet, "PAYOUT_PENDING", ref);
  return { total, platformFee, sellerNet };
}

/** Buyer confirmed delivery: the seller's escrow becomes spendable. */
export async function releaseEscrow(tx: Tx, sellerId: string, amount: number, ref?: Ref) {
  await move(tx, sellerId, "PENDING", -amount, "PAYOUT_RELEASE", ref);
  await move(tx, sellerId, "AVAILABLE", amount, "PAYOUT_RELEASE", ref);
}

/** Order cancelled before completion: escrow flows back to the buyer. */
export async function refundOrder(
  tx: Tx,
  opts: { buyerId: string; sellerId: string; total: number; sellerNet: number; ref?: Ref },
) {
  await move(tx, opts.sellerId, "PENDING", -opts.sellerNet, "REFUND", opts.ref);
  await move(tx, opts.buyerId, "AVAILABLE", opts.total, "REFUND", opts.ref);
}

export async function ledgerFor(userId: string, take = 50) {
  const wallet = await ensureWallet(prisma, userId);
  return prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Re-derives every wallet balance from the ledger and reports mismatches.
 * Used by `npm run db:audit` and the admin console — an empty result is the
 * proof that the ledger and the balances agree.
 */
export async function auditWallets() {
  const wallets = await prisma.wallet.findMany({
    include: { user: { select: { email: true, handle: true } }, entries: true },
  });

  return wallets
    .map((wallet) => {
      const derived = { AVAILABLE: 0, HELD: 0, PENDING: 0 } as Record<Bucket, number>;
      for (const entry of wallet.entries) {
        derived[entry.bucket as Bucket] += entry.amount;
      }
      const drift = {
        available: wallet.available - derived.AVAILABLE,
        held: wallet.held - derived.HELD,
        pending: wallet.pending - derived.PENDING,
      };
      return { handle: wallet.user.handle, email: wallet.user.email, wallet, derived, drift };
    })
    .filter((row) => row.drift.available !== 0 || row.drift.held !== 0 || row.drift.pending !== 0);
}
