/**
 * Re-derives every wallet balance from the append-only ledger and fails loudly
 * if anything drifted. Safe to run against production.
 */
import { auditWallets } from "../src/lib/wallet";
import { prisma } from "../src/lib/db";

async function main() {
  const drift = await auditWallets();
  const totals = await prisma.wallet.aggregate({
    _sum: { available: true, held: true, pending: true },
  });

  console.log("available:", totals._sum.available ?? 0);
  console.log("held:     ", totals._sum.held ?? 0);
  console.log("pending:  ", totals._sum.pending ?? 0);

  if (drift.length === 0) {
    console.log("\n✅ every wallet matches its ledger");
    return;
  }

  console.error("\n❌ ledger drift detected:");
  for (const row of drift) {
    console.error(` @${row.handle}`, row.drift);
  }
  process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
