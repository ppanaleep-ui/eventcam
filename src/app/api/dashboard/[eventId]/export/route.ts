import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { appUrl } from "@/lib/events";

export const runtime = "nodejs";

// Full data export for the couple / production team to build the printed
// photobook. Owner-only. Returns every wish, all media, and the envelope
// summary as a single JSON document, with absolute media URLs.
export async function GET(
  _req: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
  });
  if (!event || event.ownerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [wishes, media, envelopes] = await Promise.all([
    prisma.wish.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.media.findMany({
      where: { eventId: event.id },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.envelope.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const abs = (u: string | null) => (u ? appUrl(u) : null);

  const totalTHB = envelopes.reduce((s, e) => s + e.amount, 0);
  const verifiedTHB = envelopes
    .filter((e) => e.verifyStatus === "verified")
    .reduce((s, e) => s + e.amount, 0);

  const payload = {
    exportedAt: new Date().toISOString(),
    event: {
      brideName: event.brideName,
      groomName: event.groomName,
      eventDate: event.eventDate,
      venue: event.venue,
      coverImageUrl: abs(event.coverImageUrl),
    },
    wishes: wishes.map((w) => ({
      guestName: w.guestName,
      message: w.message,
      photoUrl: abs(w.photoUrl),
      status: w.status,
      createdAt: w.createdAt,
    })),
    media: media.map((m) => ({
      kind: m.kind,
      url: abs(m.url),
      caption: m.caption,
    })),
    envelopes: {
      summary: {
        count: envelopes.length,
        totalTHB,
        verifiedTHB,
      },
      items: envelopes.map((e) => ({
        guestName: e.guestName,
        amount: e.amount,
        message: e.message,
        slipUrl: abs(e.slipUrl),
        verifyStatus: e.verifyStatus,
        verifyRef: e.verifyRef,
        createdAt: e.createdAt,
      })),
    },
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="photowish-${event.slug}.json"`,
    },
  });
}
