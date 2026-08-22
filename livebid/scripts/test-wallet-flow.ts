/**
 * End-to-end check of the money path — run with `npm run test:flow`.
 *
 * Walks a real auction from top-up to payout and asserts the wallet balances
 * after every step, then proves the ledger re-derives those same balances:
 *
 *   top-up → bid (hold) → outbid (release) → win (capture) → escrow → payout
 */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { auditWallets, creditAvailable, getBalance } from "../src/lib/wallet";
import { placeBid, settleDueListings, startListing, startShow, buyNow } from "../src/lib/auction";
import { formatMoney } from "../src/lib/money";

const B = (baht: number) => baht * 100;

let step = 0;
function ok(label: string) {
  step += 1;
  console.log(`  ${String(step).padStart(2, " ")}. ✅ ${label}`);
}

async function balances(userId: string) {
  const { available, held, pending } = await getBalance(userId);
  return { available, held, pending };
}

async function main() {
  console.log("\nWallet flow\n");

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

  const passwordHash = await bcrypt.hash("password123", 4);
  const make = (email: string, handle: string, isSeller = false) =>
    prisma.user.create({
      data: { email, handle, displayName: handle, passwordHash, isSeller, wallet: { create: {} } },
    });

  const seller = await make("s@test.local", "seller", true);
  const alice = await make("a@test.local", "alice");
  const bob = await make("b@test.local", "bob");

  // --- top-up ------------------------------------------------------------
  await prisma.$transaction(async (tx) => {
    await creditAvailable(tx, alice.id, B(1000), "TOPUP", { note: "test" });
    await creditAvailable(tx, bob.id, B(1000), "TOPUP", { note: "test" });
  });
  assert.deepEqual(await balances(alice.id), { available: B(1000), held: 0, pending: 0 });
  ok("top-up credits `available`");

  // --- show with one auction --------------------------------------------
  const show = await prisma.show.create({
    data: {
      sellerId: seller.id,
      title: "Test show",
      listings: {
        create: {
          title: "Test lot",
          type: "AUCTION",
          startPrice: B(100),
          minIncrement: B(20),
          shippingFee: B(50),
          durationSec: 60,
          position: 1,
        },
      },
    },
    include: { listings: true },
  });
  const lot = show.listings[0];

  await startShow(seller.id, show.id);
  await startListing(seller.id, lot.id);
  ok("seller can go live and put a lot on the block");

  // --- bidding -----------------------------------------------------------
  await placeBid(alice.id, lot.id, B(100));
  assert.deepEqual(await balances(alice.id), { available: B(850), held: B(150), pending: 0 });
  ok("a bid reserves item + shipping, it does not charge");

  await placeBid(bob.id, lot.id, B(120));
  assert.deepEqual(await balances(alice.id), { available: B(1000), held: 0, pending: 0 });
  assert.deepEqual(await balances(bob.id), { available: B(830), held: B(170), pending: 0 });
  ok("being outbid releases the reservation immediately");

  await assert.rejects(
    () => placeBid(alice.id, lot.id, B(130)),
    /Bid at least/,
    "a bid below the increment should be rejected",
  );
  ok("bids below the next increment are rejected");

  await assert.rejects(
    () => placeBid(alice.id, lot.id, B(5000)),
    /Not enough balance/,
    "a bid beyond the balance should be rejected",
  );
  assert.deepEqual(await balances(alice.id), { available: B(1000), held: 0, pending: 0 });
  ok("a bid you cannot fund is rejected and changes nothing");

  await placeBid(alice.id, lot.id, B(200));
  assert.deepEqual(await balances(bob.id), { available: B(1000), held: 0, pending: 0 });
  ok("re-bidding releases the previous leader");

  // --- settlement --------------------------------------------------------
  await settleDueListings(show.id, { force: true });
  const settled = await prisma.listing.findUniqueOrThrow({ where: { id: lot.id } });
  assert.equal(settled.status, "SOLD");
  assert.equal(settled.soldPrice, B(200));
  assert.equal(settled.winnerId, alice.id);

  const order = await prisma.order.findUniqueOrThrow({ where: { listingId: lot.id } });
  assert.equal(order.total, B(250)); // 200 item + 50 shipping
  assert.equal(order.platformFee, B(25)); // 10% commission
  assert.equal(order.sellerNet, B(225));

  assert.deepEqual(await balances(alice.id), { available: B(750), held: 0, pending: 0 });
  assert.deepEqual(await balances(seller.id), { available: 0, held: 0, pending: B(225) });
  ok("the hammer captures the winner's hold into the seller's escrow, minus commission");

  // --- delivery ----------------------------------------------------------
  // The `confirmReceived` server action reads the session, so the test drives
  // the same money path it uses directly.
  const { releaseEscrow } = await import("../src/lib/wallet");
  await prisma.$transaction(async (tx) => {
    await releaseEscrow(tx, seller.id, order.sellerNet, { refType: "order", refId: order.id });
    await tx.order.update({ where: { id: order.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  });
  assert.deepEqual(await balances(seller.id), { available: B(225), held: 0, pending: 0 });
  ok("confirming delivery releases escrow into the seller's available balance");

  // --- buy now -----------------------------------------------------------
  const fixed = await prisma.listing.create({
    data: {
      showId: show.id,
      title: "Fixed price lot",
      type: "BUY_NOW",
      startPrice: 1,
      buyNowPrice: B(300),
      minIncrement: 1,
      shippingFee: B(20),
      position: 2,
    },
  });
  await startListing(seller.id, fixed.id);
  await buyNow(bob.id, fixed.id, "123 Test Rd");
  assert.deepEqual(await balances(bob.id), { available: B(680), held: 0, pending: 0 });
  assert.deepEqual(await balances(seller.id), { available: B(225), held: 0, pending: B(288) });
  ok("buy-now charges `available` straight away and escrows the seller's share");

  await assert.rejects(() => buyNow(alice.id, fixed.id), /not for sale/i);
  ok("a sold item cannot be bought twice");

  // --- unsold lot returns every hold -------------------------------------
  const unsold = await prisma.listing.create({
    data: {
      showId: show.id,
      title: "Nobody wants this",
      type: "AUCTION",
      startPrice: B(50),
      minIncrement: B(10),
      durationSec: 60,
      position: 3,
    },
  });
  await startListing(seller.id, unsold.id);
  await placeBid(alice.id, unsold.id, B(50));
  const beforeCancel = await balances(alice.id);
  assert.equal(beforeCancel.held, B(50));
  const { cancelListing } = await import("../src/lib/auction");
  await cancelListing(seller.id, unsold.id);
  assert.deepEqual(await balances(alice.id), { available: B(750), held: 0, pending: 0 });
  ok("pulling a lot refunds every reservation on it");

  // --- ledger integrity ---------------------------------------------------
  const drift = await auditWallets();
  assert.deepEqual(drift, [], "wallet balances must equal the sum of their ledger entries");
  ok("every wallet balance re-derives exactly from the ledger");

  const wallets = await prisma.wallet.findMany();
  const totalInSystem = wallets.reduce((sum, w) => sum + w.available + w.held + w.pending, 0);
  const fees = await prisma.order.aggregate({ _sum: { platformFee: true } });
  assert.equal(totalInSystem + (fees._sum.platformFee ?? 0), B(2000));
  ok(`nothing leaked: wallets + commission = ${formatMoney(B(2000))} paid in`);

  console.log("\nAll wallet-flow checks passed 🎉\n");
}

main()
  .catch((error) => {
    console.error("\n❌", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
