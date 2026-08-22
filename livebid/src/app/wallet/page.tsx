import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { ledgerFor } from "@/lib/wallet";
import { LedgerTable } from "@/components/LedgerTable";
import { TopUpForm, WithdrawForm } from "@/components/WalletForms";
import { startTopUp, requestWithdrawal } from "@/app/actions/wallet";

export const dynamic = "force-dynamic";

function Balance({
  label,
  amount,
  hint,
  accent,
}: {
  label: string;
  amount: number;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`money mt-1 text-3xl font-black ${accent ?? ""}`}>{formatMoney(amount)}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [entries, topUps, withdrawals, activeHolds] = await Promise.all([
    ledgerFor(user.id, 60),
    prisma.topUp.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.hold.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { listing: { select: { title: true, showId: true } } },
    }),
  ]);

  const wallet = user.wallet!;
  const total = wallet.available + wallet.held + wallet.pending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">👛 Wallet</h1>
        <p className="text-sm text-slate-400">
          Total balance <span className="money font-semibold text-slate-200">{formatMoney(total)}</span> — one
          pot for bidding, buying and getting paid.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Balance
          label="Available"
          amount={wallet.available}
          hint="Ready to bid or buy with"
          accent="text-neon-400"
        />
        <Balance
          label="Held in bids"
          amount={wallet.held}
          hint="Reserved while your bids are live — released when you're outbid"
          accent="text-gold-400"
        />
        <Balance
          label="Sales in escrow"
          amount={wallet.pending}
          hint="Released once buyers confirm delivery"
        />
      </div>

      {activeHolds.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold">Live reservations</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {activeHolds.map((hold) => (
              <li key={hold.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <Link href={`/live/${hold.listing.showId}`} className="hover:underline">
                  {hold.listing.title}
                </Link>
                <span className="money font-semibold text-gold-400">{formatMoney(hold.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="font-bold">Top up</h2>
            <p className="text-sm text-slate-400">
              Pay in with PromptPay, upload the slip, and the balance lands in your wallet.
            </p>
          </div>
          <TopUpForm action={startTopUp} />
          {topUps.length > 0 && (
            <ul className="space-y-2 border-t border-white/10 pt-3 text-sm">
              {topUps.map((topUp) => (
                <li key={topUp.id} className="flex items-center justify-between gap-2">
                  <Link href={`/wallet/topup/${topUp.id}`} className="text-slate-300 hover:underline">
                    {topUp.reference}
                  </Link>
                  <span className="money">{formatMoney(topUp.amount)}</span>
                  <span
                    className={`chip ${
                      topUp.status === "COMPLETED"
                        ? "text-neon-300"
                        : topUp.status === "REJECTED"
                          ? "text-hot-400"
                          : ""
                    }`}
                  >
                    {topUp.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <div>
            <h2 className="font-bold">Withdraw</h2>
            <p className="text-sm text-slate-400">
              Move your available balance to a bank account. The amount leaves your wallet immediately
              and is refunded if the transfer is rejected.
            </p>
          </div>
          <WithdrawForm action={requestWithdrawal} available={wallet.available} />
          {withdrawals.length > 0 && (
            <ul className="space-y-2 border-t border-white/10 pt-3 text-sm">
              {withdrawals.map((withdrawal) => (
                <li key={withdrawal.id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-300">
                    {withdrawal.bankName} ···{withdrawal.accountNo.slice(-4)}
                  </span>
                  <span className="money">{formatMoney(withdrawal.amount)}</span>
                  <span
                    className={`chip ${
                      withdrawal.status === "PAID"
                        ? "text-neon-300"
                        : withdrawal.status === "REJECTED"
                          ? "text-hot-400"
                          : ""
                    }`}
                  >
                    {withdrawal.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-white/10 p-4 font-bold">Ledger</h2>
        <LedgerTable entries={entries} />
      </section>
    </div>
  );
}
