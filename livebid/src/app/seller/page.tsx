import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { platformFeePercent } from "@/lib/config";
import { CreateShowForm } from "@/components/SellerForms";
import { becomeSeller, createShow } from "@/app/actions/shows";
import { markShipped, cancelAndRefund } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

export default async function SellerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.isSeller) {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-6 text-center">
        <div className="card space-y-4 p-8">
          <p className="text-5xl">🎥</p>
          <h1 className="text-2xl font-black">Start selling on LiveBid</h1>
          <p className="text-slate-400">
            Run live auctions or fixed-price drops. Buyers pay from their wallet, we hold the money in
            escrow until they confirm delivery, and your share lands in your wallet minus a{" "}
            {platformFeePercent()}% commission.
          </p>
          <form action={becomeSeller}>
            <button className="btn-primary w-full" type="submit">
              Become a seller
            </button>
          </form>
        </div>
      </div>
    );
  }

  const [shows, orders, wallet] = await Promise.all([
    prisma.show.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { listings: { select: { status: true, soldPrice: true } } },
    }),
    prisma.order.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        buyer: { select: { handle: true } },
        listing: { select: { title: true, emoji: true } },
      },
    }),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
  ]);

  const gross = orders.reduce((sum, order) => sum + order.total, 0);
  const fees = orders.reduce((sum, order) => sum + order.platformFee, 0);
  const awaitingShipment = orders.filter((order) => order.status === "PAID").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">🎛 Seller studio</h1>
          <p className="text-sm text-slate-400">Your shows, sales and payouts.</p>
        </div>
        <Link href="/wallet" className="btn-ghost">
          Wallet & payouts
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Gross sales", value: formatMoney(gross), hint: `${orders.length} orders` },
          { label: "Commission paid", value: formatMoney(fees), hint: `${platformFeePercent()}% of each sale` },
          {
            label: "In escrow",
            value: formatMoney(wallet?.pending ?? 0),
            hint: "Released when buyers confirm",
          },
          {
            label: "Available",
            value: formatMoney(wallet?.available ?? 0),
            hint: "Withdrawable now",
          },
        ].map((stat) => (
          <div key={stat.label} className="card p-5">
            <p className="text-xs uppercase tracking-wide text-slate-400">{stat.label}</p>
            <p className="money mt-1 text-2xl font-black">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-500">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card overflow-hidden">
          <h2 className="border-b border-white/10 p-4 font-bold">Your shows</h2>
          {shows.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No shows yet — create your first one on the right.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {shows.map((show) => {
                const sold = show.listings.filter((l) => l.status === "SOLD");
                return (
                  <li key={show.id} className="flex flex-wrap items-center gap-3 p-4">
                    <span className="text-2xl">{show.coverEmoji}</span>
                    <div className="mr-auto min-w-0">
                      <p className="truncate font-semibold">{show.title}</p>
                      <p className="text-xs text-slate-400">
                        {show.listings.length} items · {sold.length} sold ·{" "}
                        <span className="money">
                          {formatMoney(sold.reduce((sum, l) => sum + (l.soldPrice ?? 0), 0))}
                        </span>
                      </p>
                    </div>
                    <span
                      className={`chip ${
                        show.status === "LIVE" ? "text-hot-400" : show.status === "ENDED" ? "" : "text-gold-400"
                      }`}
                    >
                      {show.status.toLowerCase()}
                    </span>
                    <Link href={`/seller/shows/${show.id}`} className="btn-ghost">
                      Control room
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <div>
            <h2 className="font-bold">New show</h2>
            <p className="text-sm text-slate-400">Schedule it now, go live whenever you're ready.</p>
          </div>
          <CreateShowForm action={createShow} />
        </section>
      </div>

      <section className="card overflow-hidden">
        <h2 className="border-b border-white/10 p-4 font-bold">
          Orders {awaitingShipment > 0 && <span className="chip ml-2">{awaitingShipment} to ship</span>}
        </h2>
        {orders.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No sales yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="text-2xl">{order.listing.emoji}</span>
                <div className="mr-auto min-w-0">
                  <p className="truncate font-semibold">{order.listing.title}</p>
                  <p className="text-xs text-slate-400">
                    @{order.buyer.handle} · <span className="money">{formatMoney(order.total)}</span> · you
                    net <span className="money">{formatMoney(order.sellerNet)}</span>
                    {order.shippingAddress && <span className="block">Ship to: {order.shippingAddress}</span>}
                  </p>
                </div>
                <span className="chip">{order.status.toLowerCase()}</span>
                {order.status === "PAID" && (
                  <>
                    <form action={markShipped} className="flex items-center gap-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input className="input w-40" name="trackingNo" placeholder="Tracking no." />
                      <button className="btn-primary" type="submit">
                        Mark shipped
                      </button>
                    </form>
                    <form action={cancelAndRefund}>
                      <input type="hidden" name="orderId" value={order.id} />
                      <button className="btn-ghost" type="submit">
                        Refund
                      </button>
                    </form>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
