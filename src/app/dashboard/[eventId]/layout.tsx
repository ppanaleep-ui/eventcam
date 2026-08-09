import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import EventNav from "@/components/EventNav";

export const dynamic = "force-dynamic";

export default async function EventDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { eventId: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
  });
  if (!event) notFound();
  if (event.ownerId !== user.id) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-blush-600">
          ← งานทั้งหมด
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold text-gray-900">
          {event.brideName} &amp; {event.groomName}
        </h1>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <aside className="md:w-56 md:shrink-0">
          <EventNav eventId={event.id} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
