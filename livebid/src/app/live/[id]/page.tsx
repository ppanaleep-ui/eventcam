import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listingWire, settleDueListings } from "@/lib/auction";
import { LiveRoom } from "@/components/LiveRoom";
import type { ChatWire } from "@/lib/wire";

export const dynamic = "force-dynamic";

export default async function LiveShowPage({ params }: { params: { id: string } }) {
  // Close anything whose timer expired while nobody was watching, so the room
  // always renders a truthful state.
  await settleDueListings(params.id);

  const [show, user] = await Promise.all([
    prisma.show.findUnique({
      where: { id: params.id },
      include: {
        seller: { select: { id: true, handle: true, displayName: true, avatarEmoji: true } },
        listings: {
          orderBy: { position: "asc" },
          include: {
            topBidder: { select: { handle: true } },
            winner: { select: { handle: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 60,
          include: { user: { select: { handle: true, displayName: true, avatarEmoji: true } } },
        },
      },
    }),
    getCurrentUser(),
  ]);

  if (!show) notFound();

  const active = show.listings.find((listing) => listing.status === "ACTIVE") ?? null;
  const lastClosed = [...show.listings]
    .filter((listing) => listing.settledAt)
    .sort((a, b) => (b.settledAt!.getTime() ?? 0) - (a.settledAt!.getTime() ?? 0))[0];

  const messages: ChatWire[] = show.messages
    .slice()
    .reverse()
    .map((message) => ({
      id: message.id,
      kind: message.kind === "SYSTEM" ? "SYSTEM" : "CHAT",
      text: message.text,
      handle: message.user?.handle ?? null,
      displayName: message.user?.displayName ?? null,
      avatarEmoji: message.user?.avatarEmoji ?? null,
      createdAt: message.createdAt.toISOString(),
    }));

  return (
    <LiveRoom
      showId={show.id}
      showTitle={show.title}
      showStatus={show.status}
      streamUrl={show.streamUrl}
      coverEmoji={show.coverEmoji}
      seller={{
        handle: show.seller.handle,
        displayName: show.seller.displayName,
        avatarEmoji: show.seller.avatarEmoji,
        isMe: user?.id === show.seller.id,
      }}
      initialListing={active ? listingWire(active) : lastClosed ? listingWire(lastClosed) : null}
      initialMessages={messages}
      queue={show.listings
        .filter((listing) => listing.status === "QUEUED")
        .map((listing) => ({
          id: listing.id,
          title: listing.title,
          emoji: listing.emoji,
          type: listing.type,
          startPrice: listing.startPrice,
          buyNowPrice: listing.buyNowPrice,
        }))}
      results={show.listings
        .filter((listing) => ["SOLD", "UNSOLD", "CANCELLED"].includes(listing.status))
        .map((listing) => ({
          id: listing.id,
          title: listing.title,
          emoji: listing.emoji,
          soldPrice: listing.soldPrice,
          status: listing.status,
          winnerHandle: listing.winner?.handle ?? null,
        }))}
      viewer={
        user
          ? {
              handle: user.handle,
              wallet: {
                available: user.wallet?.available ?? 0,
                held: user.wallet?.held ?? 0,
                pending: user.wallet?.pending ?? 0,
              },
            }
          : null
      }
    />
  );
}
