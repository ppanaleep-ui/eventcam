import "server-only";
import { NextRequest } from "next/server";

// Simple in-memory sliding-window rate limiter. Good enough to blunt spam bursts
// on the public guest endpoints. For multi-instance deployments, back this with
// Redis instead (same check() surface).

type Hit = { count: number; resetAt: number };

const globalForRl = globalThis as unknown as {
  rlBuckets: Map<string, Hit> | undefined;
};

const buckets = globalForRl.rlBuckets ?? new Map<string, Hit>();
if (process.env.NODE_ENV !== "production") {
  globalForRl.rlBuckets = buckets;
}

/** Best-effort client IP from proxy headers, falling back to a constant. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Returns { ok: false, retryAfter } when the caller has exceeded `limit`
 * requests within `windowMs`. Otherwise { ok: true }.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { ok: true, retryAfter: 0 };
}

// Opportunistically evict expired buckets so the map doesn't grow unbounded.
if (!globalForRl.rlBuckets || process.env.NODE_ENV === "production") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }, 60_000);
  // Don't keep the process alive just for cleanup.
  if (typeof timer.unref === "function") timer.unref();
}
