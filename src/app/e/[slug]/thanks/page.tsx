import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";

export const dynamic = "force-dynamic";

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { kind?: string };
}) {
  const event = await getEventBySlug(params.slug);
  if (!event) notFound();

  const isEnvelope = searchParams.kind === "envelope";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blush-100 text-5xl">
        {isEnvelope ? "🧧" : "💌"}
      </div>
      <h1 className="font-serif text-2xl font-bold text-gray-900">
        {isEnvelope ? "ขอบคุณสำหรับซองของคุณ" : "ส่งคำอวยพรเรียบร้อยแล้ว"}
      </h1>
      <p className="mt-3 leading-relaxed text-gray-600">
        {isEnvelope
          ? `ระบบได้บันทึกซองของคุณให้ ${event.brideName} & ${event.groomName} แล้ว ขอบคุณจากใจ 🤍`
          : `คำอวยพรของคุณถูกส่งถึง ${event.brideName} & ${event.groomName} แล้ว และจะปรากฏในหนังสือที่ระลึกของบ่าวสาว 🤍`}
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        {!isEnvelope && event.envelopeEnabled && event.promptPayId && (
          <Link href={`/e/${event.slug}/envelope`} className="btn-secondary w-full">
            🧧 ใส่ซองออนไลน์ด้วย
          </Link>
        )}
        {isEnvelope && (
          <Link href={`/e/${event.slug}/wish`} className="btn-secondary w-full">
            💌 ส่งคำอวยพรด้วย
          </Link>
        )}
        <Link href={`/e/${event.slug}`} className="btn-ghost w-full">
          กลับหน้าหลัก
        </Link>
      </div>
    </main>
  );
}
