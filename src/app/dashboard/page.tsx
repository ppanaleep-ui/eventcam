import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import CreateEventForm from "@/components/CreateEventForm";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const user = await getCurrentUser();
  const events = await prisma.event.findMany({
    where: { ownerId: user!.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { wishes: true, envelopes: true } },
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {events.length === 0 ? (
        <div className="mx-auto max-w-md">
          <h1 className="mb-2 text-center font-serif text-2xl font-bold text-gray-900">
            สร้างงานแต่งงานแรกของคุณ
          </h1>
          <p className="mb-6 text-center text-sm text-gray-500">
            กรอกรายละเอียดเบื้องต้น แล้วเริ่มรับคำอวยพรได้ทันที
          </p>
          <div className="card">
            <CreateEventForm />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-serif text-2xl font-bold text-gray-900">งานของฉัน</h1>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/${e.id}`}
                className="card transition hover:shadow-md"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  {e.brideName} &amp; {e.groomName}
                </h2>
                {e.eventDate && (
                  <p className="text-sm text-gray-500">
                    {new Date(e.eventDate).toLocaleDateString("th-TH", {
                      dateStyle: "long",
                    })}
                  </p>
                )}
                <div className="mt-4 flex gap-4 text-sm text-gray-600">
                  <span>💌 {e._count.wishes} คำอวยพร</span>
                  <span>🧧 {e._count.envelopes} ซอง</span>
                </div>
              </Link>
            ))}

            <details className="card">
              <summary className="cursor-pointer font-semibold text-blush-700">
                + สร้างงานใหม่
              </summary>
              <div className="mt-4">
                <CreateEventForm />
              </div>
            </details>
          </div>
        </>
      )}
    </main>
  );
}
