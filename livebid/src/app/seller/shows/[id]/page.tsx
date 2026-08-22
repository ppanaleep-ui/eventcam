import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { nextBidAmount, settleDueListings } from "@/lib/auction";
import { AddListingForm } from "@/components/SellerForms";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Countdown } from "@/components/Countdown";
import { addListing, closeShow, goLive, pullListing, putOnBlock, removeListing } from "@/app/actions/shows";

export const dynamic = "force-dynamic";

export default async function ControlRoomPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await settleDueListings(params.id);

  const show = await prisma.show.findUnique({
    where: { id: params.id },
    include: {
      listings: {
        orderBy: { position: "asc" },
        include: {
          topBidder: { select: { handle: true } },
          winner: { select: { handle: true } },
          _count: { select: { bids: true } },
        },
      },
    },
  });
  if (!show) notFound();
  if (show.sellerId !== user.id) redirect(`/live/${show.id}`);

  const active = show.listings.find((listing) => listing.status === "ACTIVE") ?? null;
  const queue = show.listings.filter((listing) => listing.status === "QUEUED");
  const done = show.listings.filter((listing) => ["SOLD", "UNSOLD", "CANCELLED"].includes(listing.status));
  const takings = done.reduce((sum, listing) => sum + (listing.soldPrice ?? 0), 0);

  return (
    <div className="space-y-5">
      <LiveRefresh showId={show.id} />

      <div className="card flex flex-wrap items-center gap-3 p-5">
        <span className="text-3xl">{show.coverEmoji}</span>
        <div className="mr-auto">
          <h1 className="text-xl font-black">{show.title}</h1>
          <p className="text-sm text-slate-400">
            {show.status === "LIVE" ? "🔴 On air" : show.status === "ENDED" ? "Ended" : "Not started"} ·{" "}
            {show.listings.length} items · <span className="money">{formatMoney(takings)}</span> taken
          </p>
        </div>
        <Link href={`/live/${show.id}`} className="btn-ghost">
          View public room
        </Link>
        {show.status !== "ENDED" &&
          (show.status === "LIVE" ? (
            <form action={closeShow}>
              <input type="hidden" name="showId" value={show.id} />
              <button className="btn-ghost" type="submit">
                End show
              </button>
            </form>
          ) : (
            <form action={goLive}>
              <input type="hidden" name="showId" value={show.id} />
              <button className="btn-hot" type="submit">
                🔴 Go live
              </button>
            </form>
          ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 font-bold">On the block</h2>
            {active ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-2xl">
                    {active.emoji}
                  </span>
                  <div className="mr-auto">
                    <p className="font-bold">{active.title}</p>
                    <p className="text-sm text-slate-400">
                      {active._count.bids} bids · next bid{" "}
                      <span className="money">{formatMoney(nextBidAmount(active))}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="money text-2xl font-black text-neon-400">
                      {formatMoney(active.topBid || active.buyNowPrice || active.startPrice)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {active.topBidder ? `@${active.topBidder.handle}` : "no bids yet"}
                    </p>
                  </div>
                  {active.type === "AUCTION" && (
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Ends in</p>
                      <Countdown endsAt={active.endsAt ? active.endsAt.toISOString() : null} className="text-2xl" />
                    </div>
                  )}
                </div>
                <form action={pullListing}>
                  <input type="hidden" name="showId" value={show.id} />
                  <input type="hidden" name="targetId" value={active.id} />
                  <button className="btn-ghost" type="submit">
                    Pull item (refunds all bids)
                  </button>
                </form>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Nothing live. {show.status === "LIVE" ? "Send up the next item →" : "Go live to start selling."}
              </p>
            )}
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-white/10 p-4 font-bold">Queue ({queue.length})</h2>
            {queue.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">Queue is empty — add items on the right.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {queue.map((listing) => (
                  <li key={listing.id} className="flex flex-wrap items-center gap-3 p-4">
                    <span className="text-2xl">{listing.emoji}</span>
                    <div className="mr-auto min-w-0">
                      <p className="truncate font-semibold">{listing.title}</p>
                      <p className="text-xs text-slate-400">
                        {listing.type === "AUCTION"
                          ? `opens at ${formatMoney(listing.startPrice)} · +${formatMoney(listing.minIncrement)} · ${listing.durationSec}s`
                          : `buy now ${formatMoney(listing.buyNowPrice ?? 0)}`}
                        {listing.shippingFee > 0 && ` · +${formatMoney(listing.shippingFee)} shipping`}
                      </p>
                    </div>
                    <form action={putOnBlock}>
                      <input type="hidden" name="showId" value={show.id} />
                      <input type="hidden" name="targetId" value={listing.id} />
                      <button className="btn-primary" type="submit" disabled={show.status !== "LIVE"}>
                        Put on block
                      </button>
                    </form>
                    <form action={removeListing}>
                      <input type="hidden" name="listingId" value={listing.id} />
                      <button className="btn-ghost" type="submit">
                        Remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card overflow-hidden">
            <h2 className="border-b border-white/10 p-4 font-bold">Sold & closed ({done.length})</h2>
            {done.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">Nothing closed yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {done.map((listing) => (
                  <li key={listing.id} className="flex items-center gap-3 p-4 text-sm">
                    <span className="text-xl">{listing.emoji}</span>
                    <span className="mr-auto truncate">{listing.title}</span>
                    <span className="text-slate-400">
                      {listing.status === "SOLD" ? (
                        <>
                          <span className="money font-semibold text-neon-400">
                            {formatMoney(listing.soldPrice ?? 0)}
                          </span>{" "}
                          → @{listing.winner?.handle}
                        </>
                      ) : (
                        listing.status.toLowerCase()
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="card space-y-4 p-5 lg:sticky lg:top-20 lg:self-start">
          <div>
            <h2 className="font-bold">Add an item</h2>
            <p className="text-sm text-slate-400">Items sit in the queue until you send them up.</p>
          </div>
          <AddListingForm action={addListing} showId={show.id} />
        </section>
      </div>
    </div>
  );
}
