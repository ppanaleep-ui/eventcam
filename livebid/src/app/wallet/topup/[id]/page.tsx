import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { promptPayId } from "@/lib/config";
import { promptPayQrDataUrl } from "@/lib/promptpay";
import { SlipForm } from "@/components/WalletForms";
import { attachSlip } from "@/app/actions/wallet";

export const dynamic = "force-dynamic";

export default async function TopUpPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const topUp = await prisma.topUp.findUnique({ where: { id: params.id } });
  if (!topUp || topUp.userId !== user.id) notFound();

  const account = promptPayId();
  const qr = account ? await promptPayQrDataUrl(account, topUp.amount / 100) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/wallet" className="text-sm text-slate-400 hover:underline">
        ← Back to wallet
      </Link>

      <div className="card space-y-5 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-black">Top up {formatMoney(topUp.amount)}</h1>
          <span
            className={`chip ${
              topUp.status === "COMPLETED"
                ? "text-neon-300"
                : topUp.status === "REJECTED"
                  ? "text-hot-400"
                  : "text-gold-400"
            }`}
          >
            {topUp.status.toLowerCase()}
          </span>
        </div>

        {topUp.status === "COMPLETED" ? (
          <p className="rounded-xl bg-neon-500/10 p-4 text-sm text-neon-300">
            Done — {formatMoney(topUp.amount)} is in your wallet.
          </p>
        ) : topUp.status === "REJECTED" ? (
          <p className="rounded-xl bg-hot-500/10 p-4 text-sm text-hot-400">
            This top-up was rejected. {topUp.reviewNote}
          </p>
        ) : (
          <>
            <ol className="space-y-2 text-sm text-slate-300">
              <li>
                1. Scan the QR with any Thai banking app and transfer exactly{" "}
                <span className="money font-semibold">{formatMoney(topUp.amount)}</span>.
              </li>
              <li>
                2. Put reference <span className="font-mono font-semibold">{topUp.reference}</span> in the
                note if your bank allows it.
              </li>
              <li>3. Upload the slip below — the balance appears once it's confirmed.</li>
            </ol>

            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="PromptPay QR code"
                className="mx-auto h-64 w-64 rounded-2xl bg-white p-3"
              />
            ) : (
              <p className="rounded-xl bg-hot-500/10 p-4 text-sm text-hot-400">
                No PromptPay account configured. Set <code>PROMPTPAY_ID</code> in the environment to render
                a payable QR here.
              </p>
            )}

            {topUp.slipUrl && (
              <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">
                Slip uploaded — waiting for confirmation.
              </p>
            )}

            <SlipForm action={attachSlip} topUpId={topUp.id} />
          </>
        )}
      </div>
    </div>
  );
}
