import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/events";
import { qrDataUrl } from "@/lib/qr";
import CopyField from "@/components/CopyField";

export const dynamic = "force-dynamic";

export default async function QrPage({
  params,
}: {
  params: { eventId: string };
}) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: params.eventId },
  });

  const guestUrl = appUrl(`/e/${event.slug}`);
  const slideshowUrl = appUrl(`/e/${event.slug}/slideshow`);
  const guestQr = await qrDataUrl(guestUrl, 640);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-gray-900">QR code &amp; ลิงก์</h2>

      <div className="card flex flex-col items-center text-center">
        <h3 className="mb-1 font-semibold text-gray-900">QR สำหรับวางหน้างาน</h3>
        <p className="mb-4 text-sm text-gray-500">
          พิมพ์ QR นี้ไปวางที่โต๊ะลงทะเบียน ให้แขกสแกนเพื่อส่งรูปและคำอวยพร
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={guestQr}
          alt="Guest QR"
          className="h-64 w-64 rounded-xl border border-blush-100"
        />
        <a
          href={guestQr}
          download={`photowish-${event.slug}.png`}
          className="btn-primary mt-4"
        >
          ⬇️ ดาวน์โหลด QR
        </a>
      </div>

      <div className="card flex flex-col gap-4">
        <div>
          <h3 className="mb-1 font-semibold text-gray-900">ลิงก์อวยพรสำหรับแขก</h3>
          <p className="mb-2 text-sm text-gray-500">
            ส่งให้เพื่อนหรือญาติที่มาร่วมงานไม่ได้ ให้ร่วมส่งคำอวยพรออนไลน์
          </p>
          <CopyField value={guestUrl} />
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-gray-900">ลิงก์สไลด์โชว์หน้างาน</h3>
          <p className="mb-2 text-sm text-gray-500">
            ส่งให้ทางโรงแรม/ทีมงานเปิดขึ้นจอโปรเจกเตอร์ (แสดงรูป Pre-wedding สลับคำอวยพรสด)
          </p>
          <CopyField value={slideshowUrl} />
        </div>
      </div>
    </div>
  );
}
