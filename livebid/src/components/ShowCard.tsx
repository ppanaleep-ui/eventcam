import Link from "next/link";
import { formatMoney } from "@/lib/money";

export type ShowCardData = {
  id: string;
  title: string;
  category: string;
  coverEmoji: string;
  status: string;
  scheduledAt: Date | null;
  seller: { handle: string; displayName: string; avatarEmoji: string };
  itemCount: number;
  lowestStart: number | null;
};

export function ShowCard({ show }: { show: ShowCardData }) {
  const live = show.status === "LIVE";

  return (
    <Link
      href={`/live/${show.id}`}
      className="card group overflow-hidden transition hover:border-neon-500/40 hover:bg-ink-700/80"
    >
      <div className="relative grid h-40 place-items-center bg-gradient-to-br from-ink-600 to-ink-800 text-6xl">
        <span className="transition group-hover:scale-110">{show.coverEmoji}</span>
        {live ? (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-hot-500 px-2.5 py-1 text-xs font-bold">
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-white" /> LIVE
          </span>
        ) : (
          <span className="absolute left-3 top-3 chip">
            {show.status === "ENDED" ? "Replay" : "Upcoming"}
          </span>
        )}
        <span className="absolute right-3 top-3 chip">{show.itemCount} items</span>
      </div>

      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 font-bold">{show.title}</h3>
        <p className="flex items-center gap-1.5 text-sm text-slate-400">
          <span>{show.seller.avatarEmoji}</span>@{show.seller.handle}
        </p>
        <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
          <span className="chip">{show.category}</span>
          {show.lowestStart != null ? (
            <span className="money">from {formatMoney(show.lowestStart)}</span>
          ) : show.scheduledAt ? (
            <span>{show.scheduledAt.toLocaleString()}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
