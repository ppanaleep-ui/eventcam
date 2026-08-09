import { prisma } from "@/lib/db";
import { formatTHB, timeAgo, cx } from "@/lib/utils";
import {
  setEnvelopeStatusAction,
  deleteEnvelopeAction,
} from "@/app/actions/events";

export const dynamic = "force-dynamic";

const verifyMeta: Record<string, { label: string; cls: string }> = {
  verified: { label: "✅ ตรวจสอบแล้ว", cls: "bg-green-100 text-green-700" },
  unverified: { label: "⏳ รอตรวจสอบ", cls: "bg-gold-400/30 text-gray-700" },
  failed: { label: "❌ ไม่ผ่าน", cls: "bg-red-100 text-red-700" },
  duplicate: { label: "⚠️ สลิปซ้ำ", cls: "bg-orange-100 text-orange-700" },
};

export default async function EnvelopesPage({
  params,
}: {
  params: { eventId: string };
}) {
  const { eventId } = params;
  const [envelopes, agg, verifiedAgg] = await Promise.all([
    prisma.envelope.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.envelope.aggregate({
      where: { eventId },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.envelope.aggregate({
      where: { eventId, verifyStatus: "verified" },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const total = agg._sum.amount ?? 0;
  const verified = verifiedAgg._sum.amount ?? 0;
  const pending = total - verified;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-gray-900">สรุปยอดซองออนไลน์</h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <div className="text-sm text-gray-500">ยอดรวมทั้งหมด</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">
            {formatTHB(total)}
          </div>
          <div className="text-xs text-gray-400">{agg._count} ซอง</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">ตรวจสอบแล้ว</div>
          <div className="mt-1 text-2xl font-bold text-green-700">
            {formatTHB(verified)}
          </div>
          <div className="text-xs text-gray-400">{verifiedAgg._count} ซอง</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">รอตรวจสอบ</div>
          <div className="mt-1 text-2xl font-bold text-gold-600">
            {formatTHB(pending)}
          </div>
        </div>
      </div>

      {envelopes.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          ยังไม่มีซองออนไลน์
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-blush-100 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">ผู้ให้</th>
                <th className="px-4 py-3 font-medium">จำนวน</th>
                <th className="px-4 py-3 font-medium">สลิป</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">เวลา</th>
                <th className="px-4 py-3 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {envelopes.map((e) => {
                const meta = verifyMeta[e.verifyStatus] ?? verifyMeta.unverified;
                return (
                  <tr key={e.id} className="border-b border-blush-50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{e.guestName}</div>
                      {e.message && (
                        <div className="max-w-[16rem] truncate text-xs text-gray-400">
                          {e.message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {formatTHB(e.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {e.slipUrl ? (
                        <a
                          href={e.slipUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blush-600 underline"
                        >
                          ดูสลิป
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cx(
                          "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
                          meta.cls,
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                      {timeAgo(e.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {e.verifyStatus !== "verified" && (
                          <form
                            action={setEnvelopeStatusAction.bind(
                              null,
                              eventId,
                              e.id,
                              "verified",
                            )}
                          >
                            <button
                              title="ยืนยันด้วยตนเอง"
                              className="rounded-lg bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                            >
                              ✓
                            </button>
                          </form>
                        )}
                        <form action={deleteEnvelopeAction.bind(null, eventId, e.id)}>
                          <button
                            title="ลบ"
                            className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                          >
                            ลบ
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
