import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { confirmReceived, saveAddress } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  PAID: "Paid — waiting for the seller to ship",
  SHIPPED: "On its way",
  COMPLETED: "Completed",
  REFUNDED: "Refunded to your wallet",
};

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const orders = await prisma.order.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      seller: { select: { handle: true, avatarEmoji: true } },
      listing: { select: { title: true, emoji: true, showId: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black">📦 Your orders</h1>
        <p className="text-sm text-slate-400">
          Everything you've won or bought. Confirming delivery is what releases the seller's money from
          escrow — so only confirm once the item is actually in your hands.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-5xl">🛍</p>
          <h2 className="mt-3 text-xl font-bold">No orders yet</h2>
          <p className="mt-1 text-slate-400">Find a live show and get bidding.</p>
          <Link href="/" className="btn-primary mt-5">
            Browse live shows
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="card space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-2xl">
                  {order.listing.emoji}
                </span>
                <div className="mr-auto min-w-0">
                  <p className="truncate font-bold">{order.listing.title}</p>
                  <p className="text-sm text-slate-400">
                    {order.seller.avatarEmoji} @{order.seller.handle} ·{" "}
                    <Link href={`/live/${order.listing.showId}`} className="hover:underline">
                      view show
                    </Link>
                  </p>
                </div>
                <div className="text-right">
                  <p className="money text-xl font-black">{formatMoney(order.total)}</p>
                  <p className="text-xs text-slate-400">
                    {formatMoney(order.itemPrice)} item
                    {order.shippingFee > 0 && ` + ${formatMoney(order.shippingFee)} shipping`}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
                <span className="chip">{STATUS_COPY[order.status] ?? order.status}</span>
                {order.trackingNo && <span className="chip">Tracking {order.trackingNo}</span>}

                <form action={saveAddress} className="ml-auto flex flex-1 items-center gap-2 sm:flex-none">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input
                    className="input sm:w-72"
                    name="shippingAddress"
                    defaultValue={order.shippingAddress ?? ""}
                    placeholder="Delivery address"
                  />
                  <button className="btn-ghost" type="submit">
                    Save
                  </button>
                </form>

                {(order.status === "PAID" || order.status === "SHIPPED") && (
                  <form action={confirmReceived}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="btn-primary" type="submit">
                      Confirm received
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
