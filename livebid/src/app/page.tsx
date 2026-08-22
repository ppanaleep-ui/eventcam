import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ShowCard, type ShowCardData } from "@/components/ShowCard";
import { formatMoney } from "@/lib/money";
import { platformFeePercent } from "@/lib/config";

export const dynamic = "force-dynamic";

async function loadShows(status: string, take = 12) {
  const shows = await prisma.show.findMany({
    where: { status },
    orderBy: status === "SCHEDULED" ? { scheduledAt: "asc" } : { startedAt: "desc" },
    take,
    include: {
      seller: { select: { handle: true, displayName: true, avatarEmoji: true } },
      listings: { select: { startPrice: true, buyNowPrice: true, status: true } },
    },
  });

  return shows.map<ShowCardData>((show) => ({
    id: show.id,
    title: show.title,
    category: show.category,
    coverEmoji: show.coverEmoji,
    status: show.status,
    scheduledAt: show.scheduledAt,
    seller: show.seller,
    itemCount: show.listings.length,
    lowestStart: show.listings.length
      ? Math.min(...show.listings.map((l) => l.buyNowPrice ?? l.startPrice))
      : null,
  }));
}

function Section({ title, subtitle, shows }: { title: string; subtitle: string; shows: ShowCardData[] }) {
  if (!shows.length) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-black">{title}</h2>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shows.map((show) => (
          <ShowCard key={show.id} show={show} />
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [user, live, upcoming, ended] = await Promise.all([
    getCurrentUser(),
    loadShows("LIVE"),
    loadShows("SCHEDULED"),
    loadShows("ENDED", 4),
  ]);

  return (
    <div className="space-y-10">
      <section className="card relative overflow-hidden p-8">
        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="chip">🔴 Live shopping · auctions · wallet</span>
          <h1 className="text-4xl font-black leading-tight sm:text-5xl">
            Buy and sell live.
            <br />
            <span className="text-neon-400">Pay from your wallet.</span>
          </h1>
          <p className="text-slate-300">
            Top your wallet up once, then bid with a single tap. Winning bids are settled instantly
            from your balance and every satang is tracked in your own ledger — no card re-entry, no
            surprise charges, and the seller only gets paid once you have your item.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            {user ? (
              <>
                <Link href="/wallet" className="btn-primary">
                  Top up wallet
                </Link>
                <Link href="/seller" className="btn-ghost">
                  {user.isSeller ? "Open seller studio" : "Start selling"}
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup" className="btn-primary">
                  Create a free account
                </Link>
                <Link href="/login" className="btn-ghost">
                  I already have one
                </Link>
              </>
            )}
          </div>
          {user?.wallet && (
            <p className="text-sm text-slate-400">
              Wallet balance:{" "}
              <span className="money font-semibold text-neon-400">
                {formatMoney(user.wallet.available)}
              </span>
              {user.wallet.held > 0 && (
                <>
                  {" "}
                  · <span className="money">{formatMoney(user.wallet.held)}</span> held in live bids
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {live.length === 0 && upcoming.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-5xl">📭</p>
          <h2 className="mt-3 text-xl font-bold">No shows scheduled yet</h2>
          <p className="mt-1 text-slate-400">
            Be the first — open the seller studio and schedule a show in under a minute.
          </p>
          <Link href="/seller" className="btn-primary mt-5">
            Start selling
          </Link>
        </div>
      )}

      <Section title="🔴 Live right now" subtitle="Jump in — items are on the block" shows={live} />
      <Section title="🗓 Starting soon" subtitle="Set a reminder and be there for the first lot" shows={upcoming} />
      <Section title="✅ Recently ended" subtitle="See what sold and for how much" shows={ended} />

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: "👛",
            title: "One wallet, instant bids",
            body: "Top up with PromptPay. Bids reserve funds instead of charging you — outbid, and the reservation is released on the spot.",
          },
          {
            icon: "🛡",
            title: "Escrow by default",
            body: "The winner's money is captured at the hammer, but the seller can only cash out after you confirm the item arrived.",
          },
          {
            icon: "🧾",
            title: "Every satang accounted for",
            body: `An append-only ledger backs every balance. Platform commission is a flat ${platformFeePercent()}% of each sale.`,
          },
        ].map((item) => (
          <div key={item.title} className="card space-y-2 p-5">
            <p className="text-2xl">{item.icon}</p>
            <h3 className="font-bold">{item.title}</h3>
            <p className="text-sm text-slate-400">{item.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
