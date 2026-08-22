import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { placeBid, AuctionError } from "@/lib/auction";
import { WalletError, getBalance } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Places a bid. The bidder's wallet is reserved (not charged) on success. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to bid" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid bid" }, { status: 400 });
  }

  try {
    const result = await placeBid(user.id, params.id, amount);
    return NextResponse.json({ ok: true, ...result, wallet: await getBalance(user.id) });
  } catch (error) {
    if (error instanceof AuctionError || error instanceof WalletError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
