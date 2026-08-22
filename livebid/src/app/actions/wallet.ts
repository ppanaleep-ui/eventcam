"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseMoney, formatMoney } from "@/lib/money";
import { autoApproveTopUp } from "@/lib/config";
import { creditAvailable, debitAvailable, WalletError } from "@/lib/wallet";
import { saveImage, UploadError } from "@/lib/uploads";

export type FormState = { error?: string; ok?: string } | undefined;

const MIN_TOPUP = 2000; // ฿20
const MAX_TOPUP = 10_000_000; // ฿100,000
const MIN_WITHDRAW = 10_000; // ฿100

function amountFrom(value: FormDataEntryValue | null): number {
  return parseMoney(String(value ?? ""));
}

/**
 * Step 1 of a top-up: record the intent and hand the user a reference number.
 * Money is NOT credited here — only an approved transfer does that.
 */
export async function startTopUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  let amount: number;
  try {
    amount = amountFrom(formData.get("amount"));
  } catch {
    return { error: "Enter an amount like 500 or 500.50" };
  }
  if (amount < MIN_TOPUP) return { error: `Minimum top-up is ${formatMoney(MIN_TOPUP)}` };
  if (amount > MAX_TOPUP) return { error: `Maximum top-up is ${formatMoney(MAX_TOPUP)}` };

  const topUp = await prisma.topUp.create({
    data: {
      userId: user.id,
      amount,
      method: "PROMPTPAY",
      reference: `LB${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    },
  });

  redirect(`/wallet/topup/${topUp.id}`);
}

/**
 * Step 2: attach the bank transfer slip. With AUTO_APPROVE_TOPUP=true the
 * top-up clears immediately (demo/staging); otherwise it waits for /admin.
 */
export async function attachSlip(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const topUpId = String(formData.get("topUpId") ?? "");

  const topUp = await prisma.topUp.findUnique({ where: { id: topUpId } });
  if (!topUp || topUp.userId !== user.id) return { error: "Top-up not found" };
  if (topUp.status !== "PENDING") return { error: "This top-up is already closed" };

  const file = formData.get("slip");
  let slipUrl: string;
  try {
    slipUrl = await saveImage(file as File, "slips");
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "Could not read that file" };
  }

  await prisma.topUp.update({ where: { id: topUp.id }, data: { slipUrl } });

  if (autoApproveTopUp()) {
    await completeTopUp(topUp.id, "Auto-approved (AUTO_APPROVE_TOPUP)");
    revalidatePath("/wallet");
    return { ok: `${formatMoney(topUp.amount)} added to your wallet` };
  }

  revalidatePath("/wallet");
  return { ok: "Slip received — we'll confirm it shortly" };
}

/**
 * Credits an approved top-up. Idempotent: a top-up that already COMPLETED is
 * left alone, so a double-click can never double-credit a wallet.
 */
export async function completeTopUp(topUpId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const topUp = await tx.topUp.findUnique({ where: { id: topUpId } });
    if (!topUp) throw new WalletError("Top-up not found");
    if (topUp.status === "COMPLETED") return topUp;
    if (topUp.status === "REJECTED") throw new WalletError("This top-up was rejected");

    await creditAvailable(tx, topUp.userId, topUp.amount, "TOPUP", {
      refType: "topup",
      refId: topUp.id,
      note: note ?? `Top-up ${topUp.reference}`,
    });

    return tx.topUp.update({
      where: { id: topUp.id },
      data: { status: "COMPLETED", completedAt: new Date(), reviewNote: note ?? null },
    });
  });
}

const withdrawSchema = z.object({
  bankName: z.string().min(2, "Bank name is required").max(60),
  accountName: z.string().min(2, "Account name is required").max(80),
  accountNo: z.string().min(6, "Account number looks too short").max(30),
});

/**
 * Cash out. The balance leaves `available` right away so it cannot be spent
 * twice while an operator processes the transfer; a rejection refunds it.
 */
export async function requestWithdrawal(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  let amount: number;
  try {
    amount = amountFrom(formData.get("amount"));
  } catch {
    return { error: "Enter an amount like 500" };
  }
  if (amount < MIN_WITHDRAW) return { error: `Minimum withdrawal is ${formatMoney(MIN_WITHDRAW)}` };

  const parsed = withdrawSchema.safeParse({
    bankName: String(formData.get("bankName") ?? "").trim(),
    accountName: String(formData.get("accountName") ?? "").trim(),
    accountNo: String(formData.get("accountNo") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  try {
    await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.create({
        data: { userId: user.id, amount, ...parsed.data },
      });
      await debitAvailable(tx, user.id, amount, "WITHDRAW", {
        refType: "withdrawal",
        refId: withdrawal.id,
        note: `Withdrawal to ${parsed.data.bankName}`,
      });
    });
  } catch (error) {
    if (error instanceof WalletError) return { error: error.message };
    throw error;
  }

  revalidatePath("/wallet");
  return { ok: `${formatMoney(amount)} queued for transfer` };
}
