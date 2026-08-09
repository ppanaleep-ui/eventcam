import { prisma } from "@/lib/db";
import { timeAgo, cx } from "@/lib/utils";
import {
  setWishStatusAction,
  deleteWishAction,
} from "@/app/actions/events";

export const dynamic = "force-dynamic";

const statusMeta: Record<string, { label: string; cls: string }> = {
  approved: { label: "แสดงอยู่", cls: "bg-green-100 text-green-700" },
  pending: { label: "รออนุมัติ", cls: "bg-gold-400/30 text-gray-700" },
  hidden: { label: "ซ่อนอยู่", cls: "bg-gray-100 text-gray-500" },
};

export default async function WishesPage({
  params,
}: {
  params: { eventId: string };
}) {
  const { eventId } = params;
  const wishes = await prisma.wish.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          คำอวยพร ({wishes.length})
        </h2>
      </div>

      {wishes.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          ยังไม่มีคำอวยพร — แชร์ QR หรือลิงก์ให้แขกเริ่มส่งได้เลย
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {wishes.map((w) => {
            const meta = statusMeta[w.status] ?? statusMeta.approved;
            return (
              <div key={w.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{w.guestName}</p>
                    <p className="text-xs text-gray-400">{timeAgo(w.createdAt)}</p>
                  </div>
                  <span
                    className={cx(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      meta.cls,
                    )}
                  >
                    {meta.label}
                  </span>
                </div>

                {w.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.photoUrl}
                    alt=""
                    className="max-h-64 w-full rounded-xl object-cover"
                  />
                )}
                <p className="whitespace-pre-wrap text-sm text-gray-700">
                  {w.message}
                </p>

                <div className="mt-1 flex flex-wrap gap-2">
                  {w.status !== "approved" && (
                    <form action={setWishStatusAction.bind(null, eventId, w.id, "approved")}>
                      <button className="rounded-lg bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100">
                        ✓ อนุมัติ/แสดง
                      </button>
                    </form>
                  )}
                  {w.status !== "hidden" && (
                    <form action={setWishStatusAction.bind(null, eventId, w.id, "hidden")}>
                      <button className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200">
                        ซ่อน
                      </button>
                    </form>
                  )}
                  <form action={deleteWishAction.bind(null, eventId, w.id)}>
                    <button className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100">
                      ลบ
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
