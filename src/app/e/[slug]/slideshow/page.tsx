import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Slideshow, { type Slide } from "@/components/Slideshow";

export const dynamic = "force-dynamic";

export default async function SlideshowPage({
  params,
}: {
  params: { slug: string };
}) {
  const event = await prisma.event.findUnique({
    where: { slug: params.slug },
  });
  if (!event) notFound();

  const [prewedding, wishes] = await Promise.all([
    prisma.media.findMany({
      where: { eventId: event.id, kind: { in: ["prewedding", "atmosphere"] } },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.wish.findMany({
      where: { eventId: event.id, status: "approved" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const photoSlides: Slide[] = prewedding.map((m) => ({
    kind: "photo",
    id: m.id,
    url: m.url,
    caption: m.caption ?? undefined,
  }));

  const wishSlides: Slide[] = wishes.map((w) => ({
    kind: "wish",
    id: w.id,
    guestName: w.guestName,
    message: w.message,
    photoUrl: w.photoUrl ?? undefined,
  }));

  return (
    <Slideshow
      slug={event.slug}
      coupleName={`${event.brideName} & ${event.groomName}`}
      initialPhotos={photoSlides}
      initialWishes={wishSlides}
    />
  );
}
