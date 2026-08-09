import Link from "next/link";
import { notFound } from "next/navigation";
import { getEventBySlug } from "@/lib/events";
import WishForm from "@/components/WishForm";

export const dynamic = "force-dynamic";

export default async function WishPage({
  params,
}: {
  params: { slug: string };
}) {
  const event = await getEventBySlug(params.slug);
  if (!event) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
      <Link href={`/e/${event.slug}`} className="mb-4 text-sm text-blush-600">
        ← กลับ
      </Link>
      <h1 className="font-serif text-2xl font-bold text-gray-900">
        ส่งคำอวยพรถึง {event.brideName} &amp; {event.groomName}
      </h1>
      <p className="mb-6 mt-1 text-sm text-gray-500">
        รูปและคำอวยพรของคุณจะถูกเก็บไว้ในหนังสือที่ระลึกของบ่าวสาว
      </p>
      <WishForm slug={event.slug} />
    </main>
  );
}
