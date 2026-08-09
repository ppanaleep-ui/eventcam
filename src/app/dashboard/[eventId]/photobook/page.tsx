import { prisma } from "@/lib/db";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function PhotobookPage({
  params,
}: {
  params: { eventId: string };
}) {
  const { eventId } = params;
  const [event, wishes, prewedding, atmosphere] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.wish.findMany({
      where: { eventId, status: { in: ["approved", "pending"] } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.media.findMany({
      where: { eventId, kind: "prewedding" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.media.findMany({
      where: { eventId, kind: "atmosphere" },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const dateLabel = event.eventDate
    ? new Date(event.eventDate).toLocaleDateString("th-TH", { dateStyle: "long" })
    : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">หนังสือที่ระลึก</h2>
          <p className="text-sm text-gray-500">
            ตัวอย่างเลย์เอาต์สำหรับจัดพิมพ์ — รวมคำอวยพร รูปแขก และภาพงานทั้งหมด
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/dashboard/${eventId}/export`} className="btn-secondary">
            ⬇️ ดาวน์โหลดข้อมูล (JSON)
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Printable book */}
      <article className="mx-auto w-full max-w-3xl bg-white text-gray-900 print:max-w-none">
        {/* Cover */}
        <section className="mb-10 break-after-page rounded-2xl border border-blush-100 p-10 text-center print:border-0">
          {event.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverImageUrl}
              alt=""
              className="mx-auto mb-6 h-64 w-full max-w-xl rounded-xl object-cover"
            />
          )}
          <p className="text-sm uppercase tracking-[0.3em] text-blush-500">
            Wedding Wish Book
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold">
            {event.brideName} &amp; {event.groomName}
          </h1>
          {dateLabel && <p className="mt-2 text-gray-500">{dateLabel}</p>}
          {event.venue && <p className="text-sm text-gray-400">{event.venue}</p>}
        </section>

        {/* Prewedding gallery */}
        {prewedding.length > 0 && (
          <section className="mb-10 break-after-page">
            <h2 className="mb-4 text-center font-serif text-2xl">Pre-wedding</h2>
            <div className="grid grid-cols-2 gap-3">
              {prewedding.map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.id}
                  src={m.url}
                  alt=""
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              ))}
            </div>
          </section>
        )}

        {/* Wishes */}
        <section className="mb-10">
          <h2 className="mb-6 text-center font-serif text-2xl">
            คำอวยพรจากแขกผู้มีเกียรติ
          </h2>
          {wishes.length === 0 ? (
            <p className="py-8 text-center text-gray-400">ยังไม่มีคำอวยพร</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {wishes.map((w) => (
                <div
                  key={w.id}
                  className="break-inside-avoid rounded-2xl border border-blush-100 p-5"
                >
                  {w.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.photoUrl}
                      alt=""
                      className="mb-3 h-48 w-full rounded-lg object-cover"
                    />
                  )}
                  <p className="whitespace-pre-wrap font-serif text-gray-800">
                    “{w.message}”
                  </p>
                  <p className="mt-3 text-right text-sm font-semibold text-blush-600">
                    — {w.guestName}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Atmosphere */}
        {atmosphere.length > 0 && (
          <section className="mb-10 break-before-page">
            <h2 className="mb-4 text-center font-serif text-2xl">บรรยากาศในงาน</h2>
            <div className="grid grid-cols-2 gap-3">
              {atmosphere.map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.id}
                  src={m.url}
                  alt=""
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              ))}
            </div>
          </section>
        )}

        <p className="py-6 text-center text-sm text-gray-400">
          💐 จัดทำด้วย PhotoWish
        </p>
      </article>
    </div>
  );
}
