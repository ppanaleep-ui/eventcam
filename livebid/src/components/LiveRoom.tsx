"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import { Countdown } from "@/components/Countdown";
import type { ChatWire, ListingWire, WalletWire } from "@/lib/wire";

type Props = {
  showId: string;
  showTitle: string;
  showStatus: string;
  streamUrl: string | null;
  coverEmoji: string;
  seller: { handle: string; displayName: string; avatarEmoji: string; isMe: boolean };
  initialListing: ListingWire | null;
  initialMessages: ChatWire[];
  queue: { id: string; title: string; emoji: string; type: string; startPrice: number; buyNowPrice: number | null }[];
  results: { id: string; title: string; emoji: string; soldPrice: number | null; status: string; winnerHandle: string | null }[];
  viewer: { handle: string; wallet: WalletWire } | null;
};

export function LiveRoom(props: Props) {
  const router = useRouter();
  const [listing, setListing] = useState<ListingWire | null>(props.initialListing);
  const [messages, setMessages] = useState<ChatWire[]>(props.initialMessages);
  const [wallet, setWallet] = useState<WalletWire | null>(props.viewer?.wallet ?? null);
  const [status, setStatus] = useState(props.showStatus);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const flash = useCallback((text: string, tone: "ok" | "error") => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 4000);
  }, []);

  // One SSE connection carries chat, bids, listing changes and show status.
  useEffect(() => {
    const source = new EventSource(`/api/shows/${props.showId}/stream`);

    source.addEventListener("chat", (event) => {
      const message = JSON.parse((event as MessageEvent).data) as ChatWire;
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message].slice(-200)));
    });

    source.addEventListener("listing", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as ListingWire;
      setListing((prev) => {
        if (next.status === "ACTIVE") return next;
        // A closed item stays on screen for a beat so the result is readable,
        // then the queue/results columns are re-fetched from the server.
        if (prev && prev.id === next.id) return next;
        return prev;
      });
      router.refresh();
    });

    source.addEventListener("show", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as { status: string };
      setStatus(next.status);
      router.refresh();
    });

    return () => source.close();
  }, [props.showId, router]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function bid(amount: number) {
    if (!listing) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/listings/${listing.id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await response.json();
      if (!response.ok) {
        flash(data.error ?? "Could not place that bid", "error");
      } else {
        setWallet(data.wallet);
        flash(`Bid placed — ${formatMoney(amount)} reserved`, "ok");
      }
    } catch {
      flash("Network hiccup — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    if (!listing) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/listings/${listing.id}/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        flash(data.error ?? "Could not complete the purchase", "error");
      } else {
        setWallet(data.wallet);
        flash("Bought! Find it under Orders", "ok");
        router.refresh();
      }
    } catch {
      flash("Network hiccup — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const response = await fetch(`/api/shows/${props.showId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      flash(data.error ?? "Message not sent", "error");
    }
  }

  const isAuction = listing?.type === "AUCTION";
  const price = listing
    ? isAuction
      ? listing.topBid || listing.startPrice
      : listing.buyNowPrice ?? 0
    : 0;
  const dueNow = listing ? (isAuction ? listing.nextBid : price) + listing.shippingFee : 0;
  const canAfford = wallet ? wallet.available >= dueNow : false;
  const leading = !!listing && !!props.viewer && listing.topBidderHandle === props.viewer.handle;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ---------------------------------------------------------------- stage */}
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="relative aspect-video w-full bg-black">
            {props.streamUrl ? (
              <iframe
                src={props.streamUrl}
                title={props.showTitle}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-700 via-ink-800 to-black text-center">
                <div>
                  <p className="text-7xl">{listing?.emoji ?? props.coverEmoji}</p>
                  <p className="mt-3 text-sm text-slate-400">
                    {status === "LIVE"
                      ? "Camera feed placeholder — plug an HLS/YouTube embed URL into the show settings"
                      : status === "SCHEDULED"
                        ? "The seller hasn't gone live yet"
                        : "This show has ended"}
                  </p>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
              {status === "LIVE" ? (
                <span className="flex items-center gap-1.5 rounded-full bg-hot-500 px-2.5 py-1 text-xs font-bold">
                  <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-white" /> LIVE
                </span>
              ) : (
                <span className="chip bg-black/60">{status === "ENDED" ? "Ended" : "Upcoming"}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg">
              {props.seller.avatarEmoji}
            </span>
            <div className="mr-auto">
              <h1 className="font-bold leading-tight">{props.showTitle}</h1>
              <p className="text-sm text-slate-400">
                {props.seller.displayName} · @{props.seller.handle}
              </p>
            </div>
            {props.seller.isMe && (
              <Link href={`/seller/shows/${props.showId}`} className="btn-ghost">
                🎛 Control room
              </Link>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------- bidding panel */}
        <div className="card p-5">
          {listing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/5 text-3xl">
                  {listing.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="chip mb-1">{isAuction ? "🔨 Auction" : "🛒 Buy now"}</p>
                  <h2 className="truncate text-lg font-bold">{listing.title}</h2>
                  <p className="text-sm text-slate-400">
                    {listing.shippingFee > 0
                      ? `+ ${formatMoney(listing.shippingFee)} shipping`
                      : "Free shipping"}
                  </p>
                </div>
                {isAuction && listing.status === "ACTIVE" && (
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Time left</p>
                    <Countdown endsAt={listing.endsAt} className="text-3xl" />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded-2xl bg-white/5 p-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {isAuction ? (listing.topBid ? "Current bid" : "Opening bid") : "Price"}
                  </p>
                  <p className="money text-3xl font-black text-neon-400">{formatMoney(price)}</p>
                </div>
                {isAuction && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Top bidder</p>
                    <p className="font-semibold">
                      {listing.topBidderHandle ? `@${listing.topBidderHandle}` : "—"}
                      {leading && <span className="ml-2 chip text-neon-300">that's you</span>}
                    </p>
                  </div>
                )}
                {listing.status !== "ACTIVE" && (
                  <p className="chip ml-auto">
                    {listing.status === "SOLD"
                      ? `Sold for ${formatMoney(listing.soldPrice ?? 0)}`
                      : listing.status === "UNSOLD"
                        ? "Went unsold"
                        : listing.status}
                  </p>
                )}
              </div>

              {listing.status === "ACTIVE" && (
                <>
                  {!props.viewer ? (
                    <Link href="/login" className="btn-primary w-full">
                      Sign in to bid
                    </Link>
                  ) : props.seller.isMe ? (
                    <p className="rounded-xl bg-white/5 p-3 text-center text-sm text-slate-400">
                      You're the seller — watch the bids roll in.
                    </p>
                  ) : isAuction ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {[0, 1, 2].map((step) => {
                          const amount = listing.nextBid + step * listing.minIncrement;
                          return (
                            <button
                              key={step}
                              type="button"
                              disabled={busy || leading || (wallet?.available ?? 0) < amount + listing.shippingFee}
                              onClick={() => bid(amount)}
                              className={step === 0 ? "btn-hot" : "btn-ghost"}
                            >
                              <span className="money">{formatMoney(amount)}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-center text-xs text-slate-400">
                        {leading
                          ? "You're the top bidder — sit tight."
                          : canAfford
                            ? `Bidding reserves ${formatMoney(dueNow)} from your wallet; it's released the moment you're outbid.`
                            : "Not enough balance for this bid."}
                        {!canAfford && (
                          <>
                            {" "}
                            <Link href="/wallet" className="text-neon-400 hover:underline">
                              Top up →
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button type="button" onClick={buy} disabled={busy || !canAfford} className="btn-primary w-full">
                        Buy now for {formatMoney(dueNow)}
                      </button>
                      {!canAfford && (
                        <p className="text-center text-xs text-slate-400">
                          Not enough balance.{" "}
                          <Link href="/wallet" className="text-neon-400 hover:underline">
                            Top up →
                          </Link>
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {wallet && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-sm">
                  <span className="text-slate-400">
                    Wallet:{" "}
                    <span className="money font-semibold text-neon-400">{formatMoney(wallet.available)}</span>
                    {wallet.held > 0 && (
                      <>
                        {" "}
                        · <span className="money">{formatMoney(wallet.held)}</span> held
                      </>
                    )}
                  </span>
                  <Link href="/wallet" className="text-neon-400 hover:underline">
                    Manage wallet →
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400">
              <p className="text-4xl">⏳</p>
              <p className="mt-2">
                {status === "LIVE"
                  ? "Nothing on the block right now — the seller is lining up the next item."
                  : "No item is live yet."}
              </p>
            </div>
          )}

          {notice && (
            <p
              className={`mt-4 animate-pop rounded-xl px-3 py-2 text-center text-sm font-medium ${
                notice.tone === "ok"
                  ? "bg-neon-500/15 text-neon-300"
                  : "bg-hot-500/15 text-hot-400"
              }`}
            >
              {notice.text}
            </p>
          )}
        </div>

        {/* -------------------------------------------------------- queue/results */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-3 font-bold">Up next ({props.queue.length})</h3>
            <ul className="space-y-2 text-sm">
              {props.queue.length === 0 && <li className="text-slate-400">Queue is empty.</li>}
              {props.queue.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                  <span className="text-xl">{item.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="money text-slate-400">
                    {formatMoney(item.buyNowPrice ?? item.startPrice)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <h3 className="mb-3 font-bold">Results ({props.results.length})</h3>
            <ul className="space-y-2 text-sm">
              {props.results.length === 0 && <li className="text-slate-400">Nothing sold yet.</li>}
              {props.results.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
                  <span className="text-xl">{item.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="money text-right text-slate-400">
                    {item.status === "SOLD" ? (
                      <>
                        {formatMoney(item.soldPrice ?? 0)}
                        {item.winnerHandle && <span className="block text-xs">@{item.winnerHandle}</span>}
                      </>
                    ) : (
                      item.status.toLowerCase()
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- chat */}
      <aside className="card flex h-[70vh] min-h-[420px] flex-col lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)]">
        <h3 className="border-b border-white/10 p-4 font-bold">Live chat</h3>
        <div ref={chatRef} className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4 text-sm">
          {messages.map((message) =>
            message.kind === "SYSTEM" ? (
              <p
                key={message.id}
                className="animate-fade-in rounded-xl bg-gold-500/10 px-3 py-2 text-center font-semibold text-gold-400"
              >
                {message.text}
              </p>
            ) : (
              <p key={message.id} className="animate-fade-in">
                <span className="mr-1">{message.avatarEmoji}</span>
                <span className="font-semibold text-slate-300">@{message.handle}</span>{" "}
                <span className="text-slate-100">{message.text}</span>
              </p>
            ),
          )}
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={props.viewer ? "Say something…" : "Sign in to chat"}
            disabled={!props.viewer || status === "ENDED"}
            maxLength={300}
          />
          <button className="btn-primary px-4" type="submit" disabled={!props.viewer || !draft.trim()}>
            Send
          </button>
        </form>
      </aside>
    </div>
  );
}
