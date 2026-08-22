import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { signOut } from "@/app/actions/auth";

type Props = {
  user: {
    handle: string;
    avatarEmoji: string;
    isSeller: boolean;
    isAdmin: boolean;
    available: number;
  } | null;
};

export function NavBar({ user }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-hot-500 text-base">🔨</span>
          <span>
            Live<span className="text-neon-400">Bid</span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 text-sm text-slate-300 sm:flex">
          <Link href="/" className="rounded-lg px-3 py-2 hover:bg-white/5">
            Browse
          </Link>
          {user && (
            <>
              <Link href="/orders" className="rounded-lg px-3 py-2 hover:bg-white/5">
                Orders
              </Link>
              <Link href="/seller" className="rounded-lg px-3 py-2 hover:bg-white/5">
                {user.isSeller ? "Seller studio" : "Start selling"}
              </Link>
              {user.isAdmin && (
                <Link href="/admin" className="rounded-lg px-3 py-2 hover:bg-white/5">
                  Admin
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/wallet"
                className="flex items-center gap-2 rounded-xl border border-neon-500/30 bg-neon-500/10 px-3 py-2 text-sm font-semibold text-neon-300 hover:bg-neon-500/20"
              >
                <span>👛</span>
                <span className="money">{formatMoney(user.available)}</span>
              </Link>
              <span className="hidden items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-sm sm:flex">
                <span>{user.avatarEmoji}</span>
                <span className="text-slate-300">@{user.handle}</span>
              </span>
              <form action={signOut}>
                <button className="btn-ghost px-3 py-2" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary">
                Join free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
