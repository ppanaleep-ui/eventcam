import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveImage, UploadError } from "@/lib/uploads";
import { publish } from "@/lib/events-bus";
import { notifyNewWish } from "@/lib/line";
import { appUrl } from "@/lib/events";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  // Throttle: max 8 wishes / minute per IP per event.
  const rl = checkRateLimit(`wish:${params.slug}:${clientIp(req)}`, 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "ส่งบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const event = await prisma.event.findUnique({ where: { slug: params.slug } });
  if (!event) {
    return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const guestName = String(form.get("guestName") || "").trim();
  const message = String(form.get("message") || "").trim();
  const photo = form.get("photo");

  if (!guestName || !message) {
    return NextResponse.json(
      { error: "กรุณากรอกชื่อและคำอวยพร" },
      { status: 400 },
    );
  }
  if (message.length > 1000 || guestName.length > 80) {
    return NextResponse.json({ error: "ข้อความยาวเกินกำหนด" }, { status: 400 });
  }

  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      photoUrl = await saveImage(photo, "wishes");
    } catch (err) {
      const msg = err instanceof UploadError ? err.message : "อัปโหลดรูปไม่สำเร็จ";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  const status = event.moderateWishes ? "pending" : "approved";

  const wish = await prisma.wish.create({
    data: {
      eventId: event.id,
      guestName,
      message,
      photoUrl,
      status,
    },
  });

  // Push to live slideshow / dashboard only when it's visible.
  if (status === "approved") {
    publish({
      type: "wish",
      eventId: event.id,
      slug: event.slug,
      payload: {
        id: wish.id,
        guestName: wish.guestName,
        message: wish.message,
        photoUrl: wish.photoUrl,
        createdAt: wish.createdAt,
      },
    });
  }

  // Real-time LINE notification (no-ops if not configured). Don't block on it.
  notifyNewWish({
    channelAccessToken: event.lineChannelAccessToken,
    to: event.lineUserId,
    brideName: event.brideName,
    groomName: event.groomName,
    guestName,
    message,
    slideshowUrl: appUrl(`/e/${event.slug}/slideshow`),
  }).catch(() => {});

  return NextResponse.json({ ok: true, id: wish.id, status });
}
