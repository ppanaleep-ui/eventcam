import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buyNow, AuctionError } from "@/lib/auction";
import { WalletError, getBalance } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Buys a fixed-price item straight from the wallet balance. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to buy" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const address = typeof body.address === "string" ? body.address.slice(0, 500) : undefined;

  try {
    const order = await buyNow(user.id, params.id, address);
    return NextResponse.json({ ok: true, orderId: order.id, wallet: await getBalance(user.id) });
  } catch (error) {
    if (error instanceof AuctionError || error instanceof WalletError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
