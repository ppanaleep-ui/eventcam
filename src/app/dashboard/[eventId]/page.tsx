import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatTHB, timeAgo } from "@/lib/utils";
import { appUrl } from "@/lib/events";
import LiveBadge from "@/components/LiveBadge";

export const dynamic = "force-dynamic";

export default async function EventOverview({
  params,
}: {
  params: { eventId: string };
}) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
  });

  const [wishCount, pendingCount, envelopeAgg, verifiedAgg, recentWishes] =
    await Promise.all([
      prisma.wish.count({ where: { eventId: event.id, status: "approved" } }),
      prisma.wish.count({ where: { eventId: event.id, status: "pending" } }),
      prisma.envelope.aggregate({
        where: { eventId: event.id },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.envelope.aggregate({
        where: { eventId: event.id, verifyStatus: "verified" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.wish.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const totalTHB = envelopeAgg._sum.amount ?? 0;
  const verifiedTHB = verifiedAgg._sum.amount ?? 0;

  const stats = [
    { label: "คำอวยพร", value: wishCount.toLocaleString("th-TH"), icon: "💌" },
    {
      label: "ซองออนไลน์",
      value: (envelopeAgg._count ?? 0).toLocaleString("th-TH"),
      icon: "🧧",
    },
    { label: "ยอดรวมทั้งหมด", value: formatTHB(totalTHB), icon: "💰" },
    {
      label: "ยอดที่ตรวจสอบแล้ว",
      value: formatTHB(verifiedTHB),
      icon: "✅",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">ภาพรวมงาน</h2>
        <LiveBadge slug={event.slug} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="text-2xl" aria-hidden>
              {s.icon}
            </div>
            <div className="mt-2 text-xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="rounded-2xl bg-gold-400/20 px-5 py-4 text-sm text-gray-700">
          มีคำอวยพร {pendingCount} รายการรอการอนุมัติ —{" "}
          <Link href={`/dashboard/${event.id}/wishes`} className="font-medium text-blush-700 underline">
            ตรวจสอบเลย
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">คำอวยพรล่าสุด</h3>
            <Link
              href={`/dashboard/${event.id}/wishes`}
              className="text-sm text-blush-600"
            >
              ดูทั้งหมด
            </Link>
          </div>
          {recentWishes.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              ยังไม่มีคำอวยพร
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-blush-50">
              {recentWishes.map((w) => (
                <li key={w.id} className="flex gap-3 py-3">
                  {w.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={w.photoUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {w.guestName}
                    </p>
                    <p className="truncate text-sm text-gray-500">{w.message}</p>
                    <p className="text-xs text-gray-400">{timeAgo(w.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="mb-4 font-semibold text-gray-900">ลิงก์สำคัญ</h3>
          <div className="flex flex-col gap-3">
            <Link href={`/dashboard/${event.id}/qr`} className="btn-secondary justify-start">
              🔗 QR code &amp; ลิงก์อวยพรสำหรับแขก
            </Link>
            <a
              href={`/e/${event.slug}/slideshow`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary justify-start"
            >
              🖥️ เปิดสไลด์โชว์หน้างาน
            </a>
            <Link
              href={`/dashboard/${event.id}/envelopes`}
              className="btn-secondary justify-start"
            >
              🧧 สรุปยอดซองออนไลน์
            </Link>
          </div>
          <p className="mt-4 break-all rounded-lg bg-blush-50 p-3 text-xs text-gray-500">
            ลิงก์งาน: {appUrl(`/e/${event.slug}`)}
          </p>
        </div>
      </div>
    </div>
  );
}
