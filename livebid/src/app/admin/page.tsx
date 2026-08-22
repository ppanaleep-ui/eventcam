import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { auditWallets } from "@/lib/wallet";
import { approveTopUp, rejectTopUp, markWithdrawalPaid, rejectWithdrawal } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isAdmin) redirect("/");

  const [topUps, withdrawals, drift, totals] = await Promise.all([
    prisma.topUp.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { handle: true, email: true } } },
    }),
    prisma.withdrawal.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { handle: true, email: true } } },
    }),
    auditWallets(),
    prisma.wallet.aggregate({ _sum: { available: true, held: true, pending: true } }),
  ]);

  const feeTotal = await prisma.order.aggregate({ _sum: { platformFee: true } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">🛠 Admin console</h1>
        <p className="text-sm text-slate-400">Money in, money out, and the ledger audit.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Wallet float", value: formatMoney(totals._sum.available ?? 0) },
          { label: "Held in bids", value: formatMoney(totals._sum.held ?? 0) },
          { label: "In escrow", value: formatMoney(totals._sum.pending ?? 0) },
          { label: "Commission earned", value: formatMoney(feeTotal._sum.platformFee ?? 0) },
        ].map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">{stat.label}</p>
            <p className="money mt-1 text-2xl font-black">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-white/10 p-4 font-bold">Top-ups awaiting confirmation ({topUps.length})</h2>
        {topUps.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {topUps.map((topUp) => (
              <li key={topUp.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="mr-auto">
                  <p className="font-semibold">
                    <span className="money">{formatMoney(topUp.amount)}</span> · @{topUp.user.handle}
                  </p>
                  <p className="text-xs text-slate-400">
                    {topUp.reference} · {topUp.createdAt.toLocaleString()}
                    {!topUp.slipUrl && " · no slip uploaded yet"}
                  </p>
                </div>
                {topUp.slipUrl && (
                  <Link href={topUp.slipUrl} target="_blank" className="btn-ghost">
                    View slip
                  </Link>
                )}
                <form action={approveTopUp}>
                  <input type="hidden" name="topUpId" value={topUp.id} />
                  <button className="btn-primary" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectTopUp}>
                  <input type="hidden" name="topUpId" value={topUp.id} />
                  <button className="btn-ghost" type="submit">
                    Reject
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-white/10 p-4 font-bold">Withdrawals to pay ({withdrawals.length})</h2>
        {withdrawals.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Nothing waiting.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {withdrawals.map((withdrawal) => (
              <li key={withdrawal.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="mr-auto">
                  <p className="font-semibold">
                    <span className="money">{formatMoney(withdrawal.amount)}</span> · @{withdrawal.user.handle}
                  </p>
                  <p className="text-xs text-slate-400">
                    {withdrawal.bankName} · {withdrawal.accountNo} · {withdrawal.accountName}
                  </p>
                </div>
                <form action={markWithdrawalPaid}>
                  <input type="hidden" name="withdrawalId" value={withdrawal.id} />
                  <button className="btn-primary" type="submit">
                    Mark paid
                  </button>
                </form>
                <form action={rejectWithdrawal}>
                  <input type="hidden" name="withdrawalId" value={withdrawal.id} />
                  <button className="btn-ghost" type="submit">
                    Reject & refund
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-bold">Ledger audit</h2>
        {drift.length === 0 ? (
          <p className="mt-2 text-sm text-neon-300">
            ✅ Every wallet balance matches the sum of its ledger entries.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-hot-400">
            {drift.map((row) => (
              <li key={row.handle}>
                @{row.handle}: available {row.drift.available}, held {row.drift.held}, pending{" "}
                {row.drift.pending} off
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
