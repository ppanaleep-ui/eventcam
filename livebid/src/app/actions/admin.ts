"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { creditAvailable } from "@/lib/wallet";
import { completeTopUp } from "@/app/actions/wallet";

async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("Admins only");
  return user;
}

/** Confirms a bank transfer and credits the wallet. */
export async function approveTopUp(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const topUpId = String(formData.get("topUpId") ?? "");
  await completeTopUp(topUpId, `Approved by @${admin.handle}`);
  revalidatePath("/admin");
}

export async function rejectTopUp(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const topUpId = String(formData.get("topUpId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || "Slip could not be verified";

  await prisma.topUp.updateMany({
    where: { id: topUpId, status: "PENDING" },
    data: { status: "REJECTED", reviewNote: `${note} (@${admin.handle})` },
  });
  revalidatePath("/admin");
}

/** The operator sent the bank transfer; the money already left the wallet. */
export async function markWithdrawalPaid(formData: FormData): Promise<void> {
  await requireAdmin();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");

  await prisma.withdrawal.updateMany({
    where: { id: withdrawalId, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date() },
  });
  revalidatePath("/admin");
}

/** Rejecting a withdrawal puts the money back where it came from. */
export async function rejectWithdrawal(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || "Bank details rejected";

  await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal || withdrawal.status !== "PENDING") return;

    await creditAvailable(tx, withdrawal.userId, withdrawal.amount, "WITHDRAW_REFUND", {
      refType: "withdrawal",
      refId: withdrawal.id,
      note: "Withdrawal rejected — refunded",
    });
    await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "REJECTED", reviewNote: `${note} (@${admin.handle})` },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/wallet");
}
