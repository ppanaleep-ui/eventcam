"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateSlug } from "@/lib/utils";
import { saveImage } from "@/lib/uploads";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Loads an event and asserts the current user owns it. */
async function ownedEvent(eventId: string) {
  const user = await requireUser();
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || event.ownerId !== user.id) {
    redirect("/dashboard");
  }
  return event;
}

export type FormResult = { error?: string; ok?: boolean } | undefined;

// --- Create event ---------------------------------------------------------

const createSchema = z.object({
  brideName: z.string().min(1, "กรุณากรอกชื่อเจ้าสาว").max(80),
  groomName: z.string().min(1, "กรุณากรอกชื่อเจ้าบ่าว").max(80),
  eventDate: z.string().optional(),
  venue: z.string().max(160).optional(),
});

export async function createEventAction(
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse({
    brideName: formData.get("brideName"),
    groomName: formData.get("groomName"),
    eventDate: formData.get("eventDate") || undefined,
    venue: formData.get("venue") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  const event = await prisma.event.create({
    data: {
      slug: generateSlug(),
      ownerId: user.id,
      brideName: parsed.data.brideName.trim(),
      groomName: parsed.data.groomName.trim(),
      eventDate: parsed.data.eventDate ? new Date(parsed.data.eventDate) : null,
      venue: parsed.data.venue?.trim() || null,
    },
  });

  redirect(`/dashboard/${event.id}`);
}

// --- Update settings ------------------------------------------------------

export async function updateEventAction(
  eventId: string,
  _prev: FormResult,
  formData: FormData,
): Promise<FormResult> {
  await ownedEvent(eventId);

  const brideName = String(formData.get("brideName") || "").trim();
  const groomName = String(formData.get("groomName") || "").trim();
  if (!brideName || !groomName) {
    return { error: "กรุณากรอกชื่อบ่าวสาว" };
  }

  const promptPayId = String(formData.get("promptPayId") || "").trim();
  const eventDate = String(formData.get("eventDate") || "").trim();

  await prisma.event.update({
    where: { id: eventId },
    data: {
      brideName,
      groomName,
      venue: String(formData.get("venue") || "").trim() || null,
      eventDate: eventDate ? new Date(eventDate) : null,
      welcomeMessage: String(formData.get("welcomeMessage") || "").trim() || null,
      envelopeEnabled: formData.get("envelopeEnabled") === "on",
      moderateWishes: formData.get("moderateWishes") === "on",
      promptPayId: promptPayId || null,
      promptPayName: String(formData.get("promptPayName") || "").trim() || null,
      lineChannelAccessToken:
        String(formData.get("lineChannelAccessToken") || "").trim() || null,
      lineUserId: String(formData.get("lineUserId") || "").trim() || null,
    },
  });

  revalidatePath(`/dashboard/${eventId}/settings`);
  revalidatePath(`/dashboard/${eventId}`);
  return { ok: true };
}

// --- Cover image ----------------------------------------------------------

export async function uploadCoverAction(eventId: string, formData: FormData) {
  await ownedEvent(eventId);
  const file = formData.get("cover");
  if (file instanceof File && file.size > 0) {
    const url = await saveImage(file, "media");
    await prisma.event.update({
      where: { id: eventId },
      data: { coverImageUrl: url },
    });
  }
  revalidatePath(`/dashboard/${eventId}/settings`);
}

// --- Media (prewedding / atmosphere) --------------------------------------

export async function addMediaAction(eventId: string, formData: FormData) {
  await ownedEvent(eventId);
  const kind = String(formData.get("kind") || "prewedding");
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

  const count = await prisma.media.count({ where: { eventId } });
  let order = count;
  for (const file of files) {
    if (file.size === 0) continue;
    const url = await saveImage(file, "media");
    await prisma.media.create({
      data: { eventId, url, kind, sortOrder: order++ },
    });
  }
  revalidatePath(`/dashboard/${eventId}/settings`);
  revalidatePath(`/dashboard/${eventId}/photobook`);
}

export async function deleteMediaAction(eventId: string, mediaId: string) {
  await ownedEvent(eventId);
  await prisma.media.deleteMany({ where: { id: mediaId, eventId } });
  revalidatePath(`/dashboard/${eventId}/settings`);
  revalidatePath(`/dashboard/${eventId}/photobook`);
}

// --- Wish moderation ------------------------------------------------------

export async function setWishStatusAction(
  eventId: string,
  wishId: string,
  status: "approved" | "hidden",
) {
  await ownedEvent(eventId);
  await prisma.wish.updateMany({
    where: { id: wishId, eventId },
    data: { status },
  });
  revalidatePath(`/dashboard/${eventId}/wishes`);
}

export async function deleteWishAction(eventId: string, wishId: string) {
  await ownedEvent(eventId);
  await prisma.wish.deleteMany({ where: { id: wishId, eventId } });
  revalidatePath(`/dashboard/${eventId}/wishes`);
}

// --- Envelope management --------------------------------------------------

export async function setEnvelopeStatusAction(
  eventId: string,
  envelopeId: string,
  verifyStatus: "verified" | "failed" | "unverified",
) {
  await ownedEvent(eventId);
  await prisma.envelope.updateMany({
    where: { id: envelopeId, eventId },
    data: { verifyStatus },
  });
  revalidatePath(`/dashboard/${eventId}/envelopes`);
}

export async function deleteEnvelopeAction(eventId: string, envelopeId: string) {
  await ownedEvent(eventId);
  await prisma.envelope.deleteMany({ where: { id: envelopeId, eventId } });
  revalidatePath(`/dashboard/${eventId}/envelopes`);
}
