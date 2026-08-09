import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";
import { promptPayQrDataUrl } from "@/lib/promptpay";
import EnvelopeForm from "@/components/EnvelopeForm";

export const dynamic = "force-dynamic";

export default async function EnvelopePage({
  params,
}: {
  params: { slug: string };
}) {
  const event = await getEventBySlug(params.slug);
  if (!event) notFound();

  if (!event.envelopeEnabled || !event.promptPayId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-6 py-16 text-center">
        <p className="text-gray-600">งานนี้ยังไม่เปิดรับซองออนไลน์</p>
        <Link href={`/e/${event.slug}`} className="btn-secondary mt-6">
          ← กลับ
        </Link>
      </main>
    );
  }

  const qr = await promptPayQrDataUrl(event.promptPayId);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
      <Link href={`/e/${event.slug}`} className="mb-4 text-sm text-blush-600">
        ← กลับ
      </Link>
      <h1 className="font-serif text-2xl font-bold text-gray-900">
        ใส่ซองออนไลน์ 🧧
      </h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">
        โอนเข้าบัญชี PromptPay ของ {event.brideName} &amp; {event.groomName} โดยตรง
        แล้วแนบสลิปเพื่อให้ระบบสรุปยอดให้บ่าวสาว
      </p>

      <div className="card mb-6 flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="PromptPay QR" className="h-60 w-60" />
        <p className="mt-3 text-sm font-medium text-gray-700">
          {event.promptPayName || "บัญชีบ่าวสาว"}
        </p>
        <p className="text-xs text-gray-400">
          สแกนด้วยแอปธนาคาร แล้วระบุจำนวนเงินที่ต้องการ
        </p>
      </div>

      <EnvelopeForm slug={event.slug} />
    </main>
  );
}
