"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseMoney } from "@/lib/money";
import { saveImage, UploadError } from "@/lib/uploads";
import {
  AuctionError,
  cancelListing,
  endShow,
  startListing,
  startShow,
} from "@/lib/auction";

export type FormState = { error?: string; ok?: string } | undefined;

/** Anyone can flip themselves into a seller — no application queue. */
export async function becomeSeller(): Promise<void> {
  const user = await requireUser();
  if (!user.isSeller) {
    await prisma.user.update({ where: { id: user.id }, data: { isSeller: true } });
  }
  revalidatePath("/seller");
}

const showSchema = z.object({
  title: z.string().min(4, "Give your show a title").max(80),
  description: z.string().max(500).optional(),
  category: z.string().min(2).max(40),
  coverEmoji: z.string().min(1).max(8),
  streamUrl: z.string().url("Stream URL must be a full URL").optional().or(z.literal("")),
});

export async function createShow(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = showSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    category: String(formData.get("category") ?? "Collectibles").trim(),
    coverEmoji: String(formData.get("coverEmoji") ?? "📦").trim(),
    streamUrl: String(formData.get("streamUrl") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  const scheduledRaw = String(formData.get("scheduledAt") ?? "").trim();
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return { error: "That start time isn't a valid date" };
  }

  if (!user.isSeller) {
    await prisma.user.update({ where: { id: user.id }, data: { isSeller: true } });
  }

  const show = await prisma.show.create({
    data: {
      sellerId: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      coverEmoji: parsed.data.coverEmoji,
      streamUrl: parsed.data.streamUrl || null,
      scheduledAt,
    },
  });

  redirect(`/seller/shows/${show.id}`);
}

const listingSchema = z.object({
  title: z.string().min(2, "Item needs a name").max(80),
  description: z.string().max(500).optional(),
  emoji: z.string().min(1).max(8),
  type: z.enum(["AUCTION", "BUY_NOW"]),
});

export async function addListing(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const showId = String(formData.get("showId") ?? "");

  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show || show.sellerId !== user.id) return { error: "Show not found" };
  if (show.status === "ENDED") return { error: "This show has ended" };

  const parsed = listingSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    emoji: String(formData.get("emoji") ?? "🎁").trim(),
    type: String(formData.get("type") ?? "AUCTION"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  let startPrice = 0;
  let buyNowPrice: number | null = null;
  let minIncrement = 0;
  let shippingFee = 0;
  try {
    startPrice = parseMoney(String(formData.get("startPrice") ?? "1"));
    minIncrement = parseMoney(String(formData.get("minIncrement") ?? "1"));
    shippingFee = parseMoney(String(formData.get("shippingFee") ?? "0"));
    const buyNowRaw = String(formData.get("buyNowPrice") ?? "").trim();
    buyNowPrice = buyNowRaw ? parseMoney(buyNowRaw) : null;
  } catch {
    return { error: "Prices must look like 250 or 250.50" };
  }

  if (parsed.data.type === "BUY_NOW" && !buyNowPrice) {
    return { error: "Buy-now items need a price" };
  }
  if (parsed.data.type === "AUCTION" && startPrice <= 0) {
    return { error: "Auctions need an opening bid" };
  }
  if (minIncrement <= 0) return { error: "Bid increment must be more than zero" };

  const durationSec = Number(formData.get("durationSec") ?? 30);
  if (!Number.isFinite(durationSec) || durationSec < 10 || durationSec > 600) {
    return { error: "Auction length must be between 10 and 600 seconds" };
  }

  let photoUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      photoUrl = await saveImage(photo, "items");
    } catch (error) {
      return { error: error instanceof UploadError ? error.message : "Could not read that photo" };
    }
  }

  const last = await prisma.listing.findFirst({
    where: { showId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.listing.create({
    data: {
      showId,
      title: parsed.data.title,
      description: parsed.data.description,
      emoji: parsed.data.emoji,
      type: parsed.data.type,
      photoUrl,
      startPrice,
      buyNowPrice,
      minIncrement,
      shippingFee,
      durationSec: Math.round(durationSec),
      position: (last?.position ?? 0) + 1,
    },
  });

  revalidatePath(`/seller/shows/${showId}`);
  return { ok: `${parsed.data.title} added to the queue` };
}

export async function removeListing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { show: { select: { sellerId: true } } },
  });
  if (!listing || listing.show.sellerId !== user.id) return;
  if (listing.status !== "QUEUED") return; // anything live or sold is history

  await prisma.listing.delete({ where: { id: listingId } });
  revalidatePath(`/seller/shows/${listing.showId}`);
}

// --- Live controls -------------------------------------------------------

async function control(formData: FormData, run: (userId: string, id: string) => Promise<unknown>) {
  const user = await requireUser();
  const showId = String(formData.get("showId") ?? "");
  const targetId = String(formData.get("targetId") ?? showId);
  try {
    await run(user.id, targetId);
  } catch (error) {
    if (!(error instanceof AuctionError)) throw error;
    // Control-room actions are idempotent enough that surfacing the message on
    // the next render is plenty — the state the seller sees is always fresh.
  }
  revalidatePath(`/seller/shows/${showId}`);
  revalidatePath(`/live/${showId}`);
}

export async function goLive(formData: FormData): Promise<void> {
  await control(formData, startShow);
}

export async function closeShow(formData: FormData): Promise<void> {
  await control(formData, endShow);
}

export async function putOnBlock(formData: FormData): Promise<void> {
  await control(formData, startListing);
}

export async function pullListing(formData: FormData): Promise<void> {
  await control(formData, cancelListing);
}
