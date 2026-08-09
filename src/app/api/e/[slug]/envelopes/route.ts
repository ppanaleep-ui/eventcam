import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveImage, UploadError } from "@/lib/uploads";
import { verifySlip } from "@/lib/slip";
import { publish } from "@/lib/events-bus";
import { notifyNewEnvelope } from "@/lib/line";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const event = await prisma.event.findUnique({ where: { slug: params.slug } });
  if (!event) {
    return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
  }
  if (!event.envelopeEnabled) {
    return NextResponse.json(
      { error: "งานนี้ยังไม่เปิดรับซองออนไลน์" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const guestName = String(form.get("guestName") || "").trim();
  const message = String(form.get("message") || "").trim();
  const amount = Number(form.get("amount"));
  const slip = form.get("slip");

  if (!guestName) {
    return NextResponse.json({ error: "กรุณากรอกชื่อของคุณ" }, { status: 400 });
  }
  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "จำนวนเงินไม่ถูกต้อง" }, { status: 400 });
  }
  if (!(slip instanceof File) || slip.size === 0) {
    return NextResponse.json({ error: "กรุณาแนบสลิปการโอน" }, { status: 400 });
  }

  // Save the slip image.
  let slipUrl: string;
  try {
    slipUrl = await saveImage(slip, "slips");
  } catch (err) {
    const msg = err instanceof UploadError ? err.message : "อัปโหลดสลิปไม่สำเร็จ";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Verify the slip through the configured provider (no-op → "unverified").
  const verification = await verifySlip(slip);

  const envelope = await prisma.envelope.create({
    data: {
      eventId: event.id,
      guestName,
      message: message || null,
      // Trust the provider's parsed amount when available, else the guest's input.
      amount: verification.amount ?? amount,
      slipUrl,
      verifyStatus: verification.status,
      verifyRef: verification.ref ?? null,
      verifyRaw: verification.raw ? JSON.stringify(verification.raw) : null,
    },
  });

  publish({
    type: "envelope",
    eventId: event.id,
    slug: event.slug,
    payload: {
      id: envelope.id,
      guestName: envelope.guestName,
      amount: envelope.amount,
      verifyStatus: envelope.verifyStatus,
      createdAt: envelope.createdAt,
    },
  });

  notifyNewEnvelope({
    channelAccessToken: event.lineChannelAccessToken,
    to: event.lineUserId,
    brideName: event.brideName,
    groomName: event.groomName,
    guestName,
    amount: envelope.amount,
    verifyStatus: envelope.verifyStatus,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    id: envelope.id,
    verifyStatus: envelope.verifyStatus,
  });
}
