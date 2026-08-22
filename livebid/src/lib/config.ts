// Runtime configuration, read from the environment with safe defaults so the
// app boots with nothing but DATABASE_URL + SESSION_SECRET set.

export function platformFeePercent(): number {
  const raw = Number(process.env.PLATFORM_FEE_PERCENT ?? "10");
  if (!Number.isFinite(raw) || raw < 0 || raw > 50) return 10;
  return raw;
}

export function promptPayId(): string | null {
  const id = (process.env.PROMPTPAY_ID ?? "").replace(/[^0-9]/g, "");
  return id.length >= 10 ? id : null;
}

export function autoApproveTopUp(): boolean {
  return (process.env.AUTO_APPROVE_TOPUP ?? "").toLowerCase() === "true";
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Seconds an auction is extended when a bid lands in the closing moments. */
export const ANTI_SNIPE_WINDOW_SEC = 10;

/** Hard ceiling on a single bid, to catch fat-fingered input (฿5,000,000). */
export const MAX_BID = 500_000_000;
