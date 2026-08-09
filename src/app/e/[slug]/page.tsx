import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function GuestLanding({
  params,
}: {
  params: { slug: string };
}) {
  const event = await getEventBySlug(params.slug);
  if (!event) notFound();

  const dateLabel = event.eventDate
    ? new Date(event.eventDate).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-10">
      {event.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverImageUrl}
          alt=""
          className="mb-6 h-56 w-full rounded-3xl object-cover shadow-md"
        />
      ) : (
        <div className="mb-6 flex h-40 w-full items-center justify-center rounded-3xl bg-gradient-to-br from-blush-200 to-blush-400 text-5xl shadow-md">
          💐
        </div>
      )}

      <p className="text-sm font-medium uppercase tracking-widest text-blush-500">
        Wedding
      </p>
      <h1 className="mt-1 text-center font-serif text-3xl font-bold text-gray-900">
        {event.brideName} &amp; {event.groomName}
      </h1>
      {dateLabel && <p className="mt-2 text-gray-500">{dateLabel}</p>}
      {event.venue && <p className="text-sm text-gray-400">{event.venue}</p>}

      <p className="mt-6 text-center leading-relaxed text-gray-600">
        {event.welcomeMessage ||
          "ขอบคุณที่มาร่วมเป็นส่วนหนึ่งในวันสำคัญของเรา 🤍 ร่วมส่งรูปและคำอวยพรให้บ่าวสาวได้เลย"}
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        <Link href={`/e/${event.slug}/wish`} className="btn-primary w-full text-base">
          💌 ส่งรูป &amp; คำอวยพร
        </Link>
        {event.envelopeEnabled && event.promptPayId && (
          <Link
            href={`/e/${event.slug}/envelope`}
            className="btn-secondary w-full text-base"
          >
            🧧 ใส่ซองออนไลน์
          </Link>
        )}
      </div>

      <p className="mt-10 text-xs text-gray-400">Powered by 💐 PhotoWish</p>
    </main>
  );
}
