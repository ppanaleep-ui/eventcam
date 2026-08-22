"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { releaseEscrow, refundOrder } from "@/lib/wallet";

/** Seller dispatched the item. */
export async function markShipped(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const trackingNo = String(formData.get("trackingNo") ?? "").trim() || null;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.sellerId !== user.id || order.status !== "PAID") return;

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "SHIPPED", trackingNo, shippedAt: new Date() },
  });

  revalidatePath("/seller");
  revalidatePath("/orders");
}

/**
 * Buyer confirmed the item arrived — this is what releases the seller's escrow
 * into their spendable balance.
 */
export async function confirmReceived(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.buyerId !== user.id) return;
    if (order.status !== "PAID" && order.status !== "SHIPPED") return;

    await releaseEscrow(tx, order.sellerId, order.sellerNet, {
      refType: "order",
      refId: order.id,
      note: "Buyer confirmed delivery",
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  });

  revalidatePath("/orders");
  revalidatePath("/wallet");
  revalidatePath("/seller");
}

/** Seller cancels an unfulfilled order; the buyer is made whole from escrow. */
export async function cancelAndRefund(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || (order.sellerId !== user.id && !user.isAdmin)) return;
    if (order.status === "COMPLETED" || order.status === "REFUNDED") return;

    await refundOrder(tx, {
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      total: order.total,
      sellerNet: order.sellerNet,
      ref: { refType: "order", refId: order.id, note: "Order cancelled by seller" },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
  });

  revalidatePath("/orders");
  revalidatePath("/seller");
  revalidatePath("/wallet");
}

/** Buyer adds/updates the delivery address on an order. */
export async function saveAddress(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") ?? "");
  const shippingAddress = String(formData.get("shippingAddress") ?? "").trim().slice(0, 500);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== user.id) return;

  await prisma.order.update({ where: { id: orderId }, data: { shippingAddress } });
  revalidatePath("/orders");
}
